/**
 * IRuntime —— FlowRunner 运行时相关接口
 *
 * 每次事件触发时由调用方（useRuntimeEvents / View._triggerLifetime）构建，
 * 执行完毕后即弃。持有本次执行所需的全部数据源，FlowRunner 通过它解析 FlowValue。
 *
 * 设计要点：
 *   - 纯数据对象，不持有 React 状态，不触发 React 重渲染
 *   - view() 查找同页面其他 View，'self' 由调用方在构建时展开为实际 id
 *   - eventArgs 按位置索引，对应 FlowValue { kind: 'eventArg', index }
 */

import type { IView } from '@/core/interfaces/IView'
import type Scene from '@/core/scene/Scene'

export interface RuntimeContext {
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
     * 特殊值 'self' 由 FlowRunner 内部展开为 ctx.self，调用方无需处理。
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
}
