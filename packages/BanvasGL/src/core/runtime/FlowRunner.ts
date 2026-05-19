/**
 * FlowRunner —— BanvasGL 运行态流程执行器
 *
 * 基于 banvas-flow 的 FlowRunner 实现，
 * 通过 BanvasFlowContext 将 BanvasGL 运行时输入适配为 FlowContext。
 */

import {
    FlowRunner as BanvasFlowRunner,
    NodeExecutorRegistry,
    conditionExecutor,
    delayExecutor,
    setVariableExecutor,
    callFlowExecutor,
    setDataExecutor,
    navigateExecutor,
    animateExecutor,
    setVisibleExecutor,
} from 'banvas-flow'
import type { FlowContext } from 'banvas-flow'
import type { FlowSchema } from '@/core/interfaces'
import type { IView } from '@/core/interfaces/IView'
import type Scene from '@/core/scene/Scene'

// ────────────────────────────────────────────
//  BanvasRuntimeInput —— FlowRunner.run 的输入参数（内部接口）
// ────────────────────────────────────────────

/** FlowRunner.run 的输入参数，由 Scene.triggerSchema / View 构建 */
export interface BanvasRuntimeInput {
    /** 触发事件的 View 本身 */
    self: IView

    /**
     * 当前页面（Scene）
     *
     * 为 null 时表示 View 尚未挂载到 Scene（如 onCreated 生命周期），
     * 此时依赖 Scene 的操作（navigate / animate / markDirty / pageDataRef）将被跳过。
     */
    page: Scene | null

    /**
     * 通过 id 查找同页面其他 View
     *
     * 特殊值 'self' 由 FlowRunner 内部展开为 input.self，调用方无需处理。
     */
    view: (id: string) => IView | null

    /**
     * 触发事件时传入的原始参数列表
     *
     * 对应 FlowValue { kind: 'eventArg', index: N }：
     *   index 0 → 原生 MouseEvent（点击/移动类事件）
     *   index 1 → 命中点的画布坐标 { x, y }（如需精确坐标）
     *
     * 生命周期钩子（onAttach / onCreated 等）的 eventArgs 为空数组。
     */
    eventArgs: unknown[]

    /**
     * 应用 ID（可选）
     *
     * 用于 callFlow 节点调用后端 API 时标识应用。
     * 由 Scene.triggerSchema 在构建时注入（通过 scene._app）。
     */
    appId?: string
}

// ────────────────────────────────────────────
//  BanvasFlowContext —— BanvasRuntimeInput → FlowContext 适配
// ────────────────────────────────────────────

class BanvasFlowContext implements FlowContext {
    eventArgs: unknown[]
    env: Record<string, unknown>

    private input: BanvasRuntimeInput

    constructor(input: BanvasRuntimeInput) {
        this.input = input
        this.eventArgs = input.eventArgs

        // 注入前端环境能力
        this.env = {
            appId: input.appId,

            setViewData: (viewId: string, key: string, value: unknown) => {
                const target = viewId === 'self'
                    ? input.self
                    : input.view(viewId)
                if (!target) return
                target.setData({ [key]: value as string | number | boolean | object })
                input.page?.markDirty(target)
            },

            navigateTo: (pageId: string) => {
                if (!input.page) return
                const app = input.page._app ?? null
                if (!app) return
                const targetScene = app.getScene(pageId)
                if (!targetScene) return
                app.navigateTo(targetScene)
            },

            playAnimation: (viewId: string, animationId: string) => {
                if (!input.page) return
                const id = viewId === 'self' ? input.self.id : viewId
                input.page.playAnimation(id, animationId)
            },

            setViewVisible: (viewId: string, visible: boolean) => {
                const target = viewId === 'self'
                    ? input.self
                    : input.view(viewId)
                if (!target) return
                target.setVisible(visible)
                input.page?.markDirty(target)
            },

            callFlow: async (flowId: string, flowInput: Record<string, unknown>) => {
                const appId = input.appId
                if (!appId) return {}
                try {
                    const resp = await fetch(`/api/apps/${appId}/flows/${encodeURIComponent(flowId)}/run`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ input: flowInput }),
                    })
                    const data = await resp.json()
                    return data?.data?.result ?? {}
                } catch {
                    return {}
                }
            },
        }
    }

    getVariable(scope: string, key: string): unknown {
        if (scope === 'page') {
            if (!this.input.page) return undefined
            return (this.input.page.data as Record<string, unknown>)[key]
        }
        const target = scope === 'self'
            ? this.input.self
            : this.input.view(scope)
        if (!target) return undefined
        const field = target.data[key]
        if (!field) return undefined
        return field.value ?? field.default
    }

    setVariable(scope: string, key: string, value: unknown): void {
        if (scope === 'page') {
            if (!this.input.page) return
            const pageData = this.input.page.data as Record<string, unknown>
            pageData[key] = value
            return
        }
        const target = scope === 'self'
            ? this.input.self
            : this.input.view(scope)
        if (!target) return
        target.setData({ [key]: value as string | number | boolean | object })
        this.input.page?.markDirty(target)
    }
}

// ────────────────────────────────────────────
//  单例 runner（lazy 初始化）
// ────────────────────────────────────────────

let runner: BanvasFlowRunner | null = null

function getRunner(): BanvasFlowRunner {
    if (!runner) {
        const registry = new NodeExecutorRegistry()
            .register('condition', conditionExecutor)
            .register('delay', delayExecutor)
            .register('setVariable', setVariableExecutor)
            .register('callFlow', callFlowExecutor)
            .register('setData', setDataExecutor)
            .register('navigate', navigateExecutor)
            .register('animate', animateExecutor)
            .register('setVisible', setVisibleExecutor)
        runner = new BanvasFlowRunner(registry)
    }
    return runner
}

// ────────────────────────────────────────────
//  FlowRunner —— 静态 API
// ────────────────────────────────────────────

export class FlowRunner {
    /**
     * 执行一个 FlowSchema
     *
     * @param schema  要执行的流程图
     * @param input   运行时输入（由 Scene.triggerSchema / View 构建）
     */
    static async run(schema: FlowSchema, input: BanvasRuntimeInput): Promise<void> {
        if (!schema.nodes.length) return

        // BanvasGL 的 FlowEdge 有 id 字段，banvas-flow 的没有，执行前剥除
        const adaptedSchema = {
            nodes: schema.nodes,
            edges: schema.edges.map(e => ({
                from: e.from,
                to: e.to,
                branch: e.branch,
                toParam: e.toParam,
            })),
        }

        const flowCtx = new BanvasFlowContext(input)
        await getRunner().run(adaptedSchema, flowCtx)
    }
}
