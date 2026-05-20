/**
 * SchemaRunner —— 核心层 Schema 执行接口与注入点
 *
 * 核心层（View、Scene）通过此模块获取 schema 执行能力，
 * 而不直接依赖 FlowRunner 实现。
 *
 * 应用层在初始化 App 时调用 setSchemaRunner() 注入真正的实现（FlowRunner）。
 * 未注入时默认为 no-op，避免核心层在无运行时环境（如纯测试）下报错。
 */

import type { FlowSchema, IView } from '@/core/interfaces/IView.js'
import type Scene from '@/core/scene/Scene.js'

// ────────────────────────────────────────────
//  ISchemaRunner —— 核心层执行 Schema 的接口
// ────────────────────────────────────────────

/** Schema 执行时的输入上下文 */
export interface SchemaRunInput {
    /** 触发事件的 View 本身 */
    self: IView

    /**
     * 当前页面（Scene）
     * 为 null 时表示 View 尚未挂载到 Scene
     */
    page: Scene | null

    /** 通过 id 查找同页面其他 View */
    view: (id: string) => IView | null

    /** 触发事件时传入的原始参数列表 */
    eventArgs: unknown[]

    /** 应用 ID（可选，用于 callFlow 等远程调用） */
    appId?: string
}

/** Schema 执行器接口 */
export interface ISchemaRunner {
    run(schema: FlowSchema, input: SchemaRunInput): Promise<void>
}

// ────────────────────────────────────────────
//  模块级注入点
// ────────────────────────────────────────────

/** 默认 no-op runner */
const noopRunner: ISchemaRunner = {
    run: async () => {},
}

let _schemaRunner: ISchemaRunner = noopRunner

/**
 * 设置全局 schema 执行器
 *
 * 由应用层在 App 初始化时调用，注入 FlowRunner 实现。
 * 核心层代码通过 getSchemaRunner() 获取执行器，不直接 import FlowRunner。
 */
export function setSchemaRunner(runner: ISchemaRunner): void {
    _schemaRunner = runner
}

/**
 * 获取当前 schema 执行器
 *
 * 核心层（Scene.triggerSchema 等）通过此函数获取执行器。
 */
export function getSchemaRunner(): ISchemaRunner {
    return _schemaRunner
}
