/**
 * 流程节点物料定义
 *
 * 每个物料描述节点的业务语义（kind / label / description / category）。
 * 渲染方式（颜色、图标等）由业务方决定，hook 只提供默认 UI 组件。
 */

import type { FlowNode } from '@banyuan/flow'

/** 流程节点物料定义（纯业务语义，不含渲染信息） */
export interface FlowNodeMaterial {
    /** 对应的 FlowNode kind */
    kind: FlowNode['kind']
    /** 面板中显示的名称 */
    label: string
    /** 描述（悬浮提示） */
    description: string
    /** 节点分类 */
    category: 'action' | 'value'
}

/** 前端流程节点物料（用于页面事件编辑器） */
export const CLIENT_FLOW_MATERIALS: FlowNodeMaterial[] = [
    // ── 动作节点 ──
    { kind: 'setData', label: '设置数据', description: '修改某个 View 的 data 字段值', category: 'action' },
    { kind: 'setVisible', label: '显隐控制', description: '设置某个 View 的可见性', category: 'action' },
    { kind: 'navigate', label: '跳转页面', description: '导航到另一个页面', category: 'action' },
    { kind: 'animate', label: '播放动画', description: '触发某个 View 的预定义动画', category: 'action' },
    { kind: 'condition', label: '条件分支', description: '根据条件选择 true / false 分支', category: 'action' },
    { kind: 'delay', label: '延迟等待', description: '等待指定毫秒后继续执行', category: 'action' },
    { kind: 'subFlow', label: '子流程', description: '可复用的子流程，内部包含一组节点和连线', category: 'action' },
    // ── 值节点 ──
    { kind: 'variable', label: 'View 变量', description: '引用某个 View 的 data 字段值', category: 'value' },
    { kind: 'pageVar', label: '页面变量', description: '引用当前页面的 data 字段值', category: 'value' },
    { kind: 'eventParam', label: '事件参数', description: '引用触发事件时传入的原始参数', category: 'value' },
]

/** 后端云函数节点物料（用于云函数编辑器） */
export const SERVER_FLOW_MATERIALS: FlowNodeMaterial[] = [
    // ── 数据库操作 ──
    { kind: 'dbQuery', label: '数据库查询', description: '从数据库查询数据', category: 'action' },
    { kind: 'dbInsert', label: '数据库插入', description: '向数据库插入数据', category: 'action' },
    { kind: 'dbUpdate', label: '数据库更新', description: '更新数据库中的数据', category: 'action' },
    { kind: 'dbDelete', label: '数据库删除', description: '删除数据库中的数据', category: 'action' },
    // ── 网络与计算 ──
    { kind: 'httpRequest', label: 'HTTP 请求', description: '发送 HTTP 请求到外部接口', category: 'action' },
    { kind: 'transform', label: '数据转换', description: '对数据进行格式转换或映射', category: 'action' },
    { kind: 'script', label: '自定义脚本', description: '执行自定义 JavaScript 脚本', category: 'action' },
    // ── 流程控制 ──
    { kind: 'condition', label: '条件分支', description: '根据条件选择 true / false 分支', category: 'action' },
    { kind: 'delay', label: '延迟等待', description: '等待指定毫秒后继续执行', category: 'action' },
    { kind: 'setVariable', label: '设置变量', description: '设置流程局部变量或输出变量', category: 'action' },
    { kind: 'subFlow', label: '子流程', description: '可复用的子流程，内部包含一组节点和连线', category: 'action' },
    // ── 值节点 ──
    { kind: 'eventParam', label: '事件参数', description: '引用触发云函数时传入的请求参数', category: 'value' },
]
