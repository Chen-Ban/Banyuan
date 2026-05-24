/**
 * 流程图编辑器视图注册
 *
 * 将 BanvasFlowEditor 的视图类型（NodeView / EdgeView / PortView）
 * 注册到 BanvasGL 核心层的 ViewRegistry 中，使核心层可以按 type 创建这些视图，
 * 而不需要直接依赖本包，避免循环依赖。
 */

import { registerViewFactories } from '@banyuan/banvasgl'
import { FlowViewType } from './constants.js'
import NodeView from './views/NodeView.js'
import EdgeView from './views/EdgeView.js'
import PortView from './views/PortView.js'

/**
 * 将流程图编辑器的视图类型注册到 BanvasGL ViewRegistry
 *
 * 应用层在初始化时调用此函数，之后核心层即可通过
 * `createView('EDGEVIEW', opts)` 等方式创建流程图视图实例。
 */
export function installFlowViews(): void {
    registerViewFactories([
        [FlowViewType.NODEVIEW, (opts) => new NodeView(opts)],
        [FlowViewType.EDGEVIEW, (opts) => new EdgeView(opts)],
        [FlowViewType.PORTVIEW, (opts) => new PortView(opts)],
    ])
}
