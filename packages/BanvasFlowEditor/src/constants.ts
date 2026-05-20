/**
 * BanvasFlowEditor 扩展的视图类型常量
 *
 * BanvasGL 的 ViewType 设计为 string 类型，业务层可自由扩展。
 * 流程编辑器新增 NODEVIEW / PORTVIEW / EDGEVIEW 三种视图类型。
 */
export const FLOW_VIEWTYPE = {
    NODEVIEW: 'NODEVIEW',
    PORTVIEW: 'PORTVIEW',
    EDGEVIEW: 'EDGEVIEW',
} as const
