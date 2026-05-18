/**
 * FlowRunner —— FlowSchema 执行引擎
 *
 * 将 FlowSchema（有向图）编译为可执行逻辑并运行。
 * 从特殊入口节点 '__start__' 出发，按边顺序依次执行节点，
 * 遇到 condition 节点时根据求值结果选择 true/false 分支。
 *
 * 设计要点：
 *   - 纯引擎层，不依赖 React，不触发 React 重渲染
 *   - 所有副作用（setData / navigate / animate / setVisible）均通过 RuntimeContext 完成
 *   - async/await 支持 delay 节点；其余节点同步执行
 *   - 循环图（有环）通过最大步数限制防止死循环
 */

import type {
    FlowSchema,
    FlowNode,
    FlowEdge,
    FlowValue,
    FlowCondition,
    FlowVarNode,
    FlowPageVarNode,
    FlowEventParamNode,
    FlowCallCloudFunctionNode,
    RuntimeContext,
} from '@/core/interfaces'

// 单次 run 最多执行的节点数，防止死循环
const MAX_STEPS = 1000

// ────────────────────────────────────────────
//  resolveValue —— FlowValue → 实际值
// ────────────────────────────────────────────

/**
 * 将值节点（FlowVarNode / FlowPageVarNode / FlowEventParamNode）直接求值
 *
 * 纯函数，无副作用，不走执行队列。
 * 由 resolveValue 在遇到 nodeRef 时调用。
 */
export function resolveValueNode(
    node: FlowVarNode | FlowPageVarNode | FlowEventParamNode,
    ctx: RuntimeContext,
): unknown {
    switch (node.kind) {
        case 'variable': {
            const target = node.viewId === 'self'
                ? ctx.self
                : ctx.view(node.viewId)
            if (!target) return undefined
            const field = target.data[node.key]
            if (!field) return undefined
            return field.value ?? field.default
        }
        case 'pageVar': {
            if (!ctx.page) return undefined
            return (ctx.page.data as Record<string, unknown>)[node.key]
        }
        case 'eventParam': {
            return ctx.eventArgs[node.index]
        }
    }
}

/**
 * 将 FlowValue 解析为运行时实际值
 *
 * dataRef 读取约定：field.value ?? field.default
 * nodeRef：在 nodeMap 中找到对应值节点后直接求值（不走执行队列）
 */
export function resolveValue(
    val: FlowValue,
    ctx: RuntimeContext,
    nodeMap?: Map<string, FlowNode>,
): unknown {
    switch (val.kind) {
        case 'literal':
            return val.value

        case 'dataRef': {
            const target = val.viewId === 'self'
                ? ctx.self
                : ctx.view(val.viewId)
            if (!target) return undefined
            const field = target.data[val.key]
            if (!field) return undefined
            return field.value ?? field.default
        }

        case 'pageDataRef': {
            if (!ctx.page) return undefined
            // Scene.data 是自由对象（any），直接按 key 读取
            return (ctx.page.data as Record<string, unknown>)[val.key]
        }

        case 'eventArg':
            return ctx.eventArgs[val.index]

        case 'nodeRef': {
            if (!nodeMap) return undefined
            const valueNode = nodeMap.get(val.nodeId)
            if (!valueNode) return undefined
            // 只允许值节点类型，动作节点不能作为值来源
            if (
                valueNode.kind !== 'variable' &&
                valueNode.kind !== 'pageVar' &&
                valueNode.kind !== 'eventParam'
            ) return undefined
            return resolveValueNode(valueNode, ctx)
        }
    }
}

// ────────────────────────────────────────────
//  evalCondition —— 条件求值
// ────────────────────────────────────────────

function evalCondition(
    left: unknown,
    op: FlowCondition['op'],
    right: unknown,
): boolean {
    switch (op) {
        case '==':  return left == right   // 宽松比较，兼容 number/string 混用
        case '!=':  return left != right
        case '>':   return (left as number) >  (right as number)
        case '>=':  return (left as number) >= (right as number)
        case '<':   return (left as number) <  (right as number)
        case '<=':  return (left as number) <= (right as number)
    }
}

// ────────────────────────────────────────────
//  executeCallCloudFunction —— 云函数调用
// ────────────────────────────────────────────

/**
 * 执行 callCloudFunction 节点
 *
 * 运行时通过 fetch 调用后端 /api/apps/:appId/functions/:name/run 接口。
 * appId 从 RuntimeContext.page._app.id 获取（如果可用）。
 * 结果按 outputBindings 写入对应 View 的 data 字段。
 */
async function executeCallCloudFunction(
    node: FlowCallCloudFunctionNode & { id: string },
    ctx: RuntimeContext,
    nodeMap: Map<string, FlowNode>,
): Promise<void> {
    if (!node.functionName) {
        console.warn('[FlowRunner] callCloudFunction: functionName 为空，跳过')
        return
    }

    // 构建输入参数
    const input: Record<string, unknown> = {}
    for (const [key, flowValue] of Object.entries(node.inputBindings)) {
        input[key] = resolveValue(flowValue, ctx, nodeMap)
    }

    // 获取 appId
    const appId = ctx.appId
    if (!appId) {
        console.warn('[FlowRunner] callCloudFunction: RuntimeContext 中无 appId，跳过')
        return
    }

    try {
        const response = await fetch(`/api/apps/${appId}/functions/${encodeURIComponent(node.functionName)}/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input }),
        })
        const data = await response.json()

        if (!response.ok || !data.success) {
            console.warn(`[FlowRunner] callCloudFunction: 调用失败 - ${data.message ?? response.statusText}`)
            return
        }

        const result = data.data?.result

        // 按 outputBindings 写入页面变量
        if (result && typeof result === 'object' && node.outputBindings) {
            for (const [resultKey, pageVarKey] of Object.entries(node.outputBindings)) {
                if (!pageVarKey) continue
                const val = (result as Record<string, unknown>)[resultKey]
                if (val === undefined) continue
                // 写入当前页面的 data
                if (ctx.page) {
                    const pageData = ctx.page.data as Record<string, unknown>
                    pageData[pageVarKey] = val
                }
            }
        }
    } catch (err) {
        console.warn('[FlowRunner] callCloudFunction: 网络错误', err)
    }
}

// ────────────────────────────────────────────
//  executeNode —— 单节点执行
// ────────────────────────────────────────────

/**
 * 执行单个 FlowNode
 *
 * @returns condition 节点返回 'true' | 'false'，其余节点返回 void
 */
async function executeNode(
    node: FlowNode,
    ctx: RuntimeContext,
    nodeMap: Map<string, FlowNode>,
): Promise<'true' | 'false' | void> {
    switch (node.kind) {
        case 'setData': {
            const val = resolveValue(node.value, ctx, nodeMap)
            const target = node.viewId === 'self'
                ? ctx.self
                : ctx.view(node.viewId)
            if (!target) break
            target.setData({ [node.key]: val as string | number | boolean | object })
            // 通知 Scene 该 View 需要重绘（未挂载时跳过）
            ctx.page?.markDirty(target)
            break
        }

        case 'navigate': {
            if (!ctx.page) {
                console.warn('[FlowRunner] navigate: 当前上下文无 Scene，跳过导航')
                break
            }
            const app = ctx.page._app ?? null
            if (!app) {
                console.warn('[FlowRunner] navigate: Scene 未持有 app 引用，跳过导航')
                break
            }
            const targetScene = app.getScene(node.pageId)
            if (!targetScene) {
                console.warn(`[FlowRunner] navigate: 找不到页面 ${node.pageId}`)
                break
            }
            app.navigateTo(targetScene)
            break
        }

        case 'animate': {
            if (!ctx.page) break
            const viewId = node.viewId === 'self' ? ctx.self.id : node.viewId
            ctx.page.playAnimation(viewId, node.animationId)
            break
        }

        case 'condition': {
            const left  = resolveValue(node.condition.left,  ctx, nodeMap)
            const right = resolveValue(node.condition.right, ctx, nodeMap)
            return evalCondition(left, node.condition.op, right) ? 'true' : 'false'
        }

        case 'delay':
            await new Promise<void>(resolve => setTimeout(resolve, node.ms))
            break

        case 'setVisible': {
            const target = node.viewId === 'self'
                ? ctx.self
                : ctx.view(node.viewId)
            if (!target) break
            target.setVisible(node.visible)
            ctx.page?.markDirty(target)
            break
        }

        case 'callCloudFunction': {
            await executeCallCloudFunction(node, ctx, nodeMap)
            break
        }

        // 值节点不参与执行队列，遇到时直接跳过
        case 'variable':
        case 'pageVar':
        case 'eventParam':
            break
    }
}

// ────────────────────────────────────────────
//  FlowRunner.run —— 主入口
// ────────────────────────────────────────────

export class FlowRunner {
    /**
     * 执行一个 FlowSchema
     *
     * @param schema  要执行的流程图
     * @param ctx     运行时上下文（由 useRuntimeEvents 构建）
     */
    static async run(schema: FlowSchema, ctx: RuntimeContext): Promise<void> {
        if (!schema.nodes.length) return

        // 建立 id → node 查找表
        const nodeMap = new Map<string, FlowNode>(
            schema.nodes.map(n => [n.id, n])
        )

        // 建立 from → edges[] 邻接表
        const edgeMap = new Map<string, FlowEdge[]>()
        for (const edge of schema.edges) {
            const list = edgeMap.get(edge.from) ?? []
            list.push(edge)
            edgeMap.set(edge.from, list)
        }

        let currentId = '__start__'
        let steps = 0

        while (steps < MAX_STEPS) {
            steps++

            const outEdges = edgeMap.get(currentId) ?? []
            if (outEdges.length === 0) break  // 流程正常结束

            if (outEdges.length === 1 && !outEdges[0].branch) {
                // 普通顺序边：直接跳到下一节点
                currentId = outEdges[0].to
            } else {
                // condition 节点的分支边：先执行当前节点求值，再选边
                const node = nodeMap.get(currentId)
                if (!node) break
                const branch = await executeNode(node, ctx, nodeMap)
                const edge = outEdges.find(e => e.branch === branch)
                if (!edge) break
                currentId = edge.to
                continue
            }

            const node = nodeMap.get(currentId)
            if (!node) break
            await executeNode(node, ctx, nodeMap)
        }

        if (steps >= MAX_STEPS) {
            console.warn('[FlowRunner] 达到最大执行步数，流程可能存在死循环')
        }
    }
}
