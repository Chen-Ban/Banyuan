/**
 * ViewRegistry —— 通用视图工厂注册表
 *
 * 核心层只关心渲染和交互：任何实现了 IView 接口契约的视图，核心层都能
 * 无感知地进行渲染、命中检测、事件分发。外部容器只要遵循接口约定，
 * 对核心层来说与内置视图没有任何区别。
 *
 * 本注册表解决的是"跨包动态创建"问题——当编辑态包（如 BanvasDesign）
 * 需要按类型字符串创建视图实例（如用户拖拽连线时创建 EdgeView），
 * 但又不想直接依赖具体实现包（如 BanvasFlowEditor）时，
 * 通过注册表做间接寻址，避免循环依赖和硬耦合。
 *
 * 使用方式：
 *
 *   // 外部库注册（应用初始化时调用）
 *   import { registerViewFactory } from '@banyuan/banvasgl'
 *   registerViewFactory('EDGEVIEW', (opts) => new EdgeView(opts))
 *   registerViewFactory('NODEVIEW', (opts) => new NodeView(opts))
 *
 *   // 编辑态/应用层按需创建
 *   import { createView, hasViewFactory } from '@banyuan/banvasgl'
 *   if (hasViewFactory('EDGEVIEW')) {
 *       const edge = createView<IEdgeView>('EDGEVIEW', { fromPortId: 'xxx' })
 *   }
 */

import type { IView } from '@/types/view.js'

// ────────────────────────────────────────────
//  IViewFactory —— 视图工厂函数签名
// ────────────────────────────────────────────

/**
 * 视图工厂函数
 *
 * @param options 创建选项，具体字段由各视图类型自行定义
 * @returns 创建的视图实例
 */
export type IViewFactory<T extends IView = IView> = (options: any) => T

// ────────────────────────────────────────────
//  注册表
// ────────────────────────────────────────────

const _registry = new Map<string, IViewFactory>()

/**
 * 注册一个外部视图工厂
 *
 * @param type  视图类型标识（如 'EDGEVIEW'、'NODEVIEW'）
 * @param factory  创建该类型视图的工厂函数
 */
export function registerViewFactory<T extends IView = IView>(
    type: string,
    factory: IViewFactory<T>,
): void {
    _registry.set(type, factory as IViewFactory)
}

/**
 * 批量注册多个视图工厂
 *
 * @param entries  [type, factory] 元组数组
 */
export function registerViewFactories(
    entries: Array<[string, IViewFactory]>,
): void {
    for (const [type, factory] of entries) {
        _registry.set(type, factory)
    }
}

/**
 * 根据 type 创建视图实例
 *
 * @param type  视图类型标识
 * @param options  传给工厂函数的创建选项
 * @returns 创建的视图实例，如果该类型未注册则返回 null
 */
export function createView<T extends IView = IView>(
    type: string,
    options?: any,
): T | null {
    const factory = _registry.get(type)
    if (!factory) return null
    return factory(options) as T
}

/**
 * 判断某个视图类型是否已注册工厂
 */
export function hasViewFactory(type: string): boolean {
    return _registry.has(type)
}

/**
 * 获取指定类型的工厂函数
 *
 * @returns 工厂函数，未注册时返回 null
 */
export function getViewFactory<T extends IView = IView>(
    type: string,
): IViewFactory<T> | null {
    return (_registry.get(type) as IViewFactory<T>) ?? null
}

/**
 * 移除已注册的视图工厂（用于测试或热更新场景）
 */
export function unregisterViewFactory(type: string): boolean {
    return _registry.delete(type)
}

/**
 * 获取所有已注册的视图类型列表
 */
export function getRegisteredViewTypes(): string[] {
    return Array.from(_registry.keys())
}
