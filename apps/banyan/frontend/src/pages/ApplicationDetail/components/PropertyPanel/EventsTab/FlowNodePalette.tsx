import React from 'react'
import styles from './FlowNodePalette.module.scss'

// ── 节点物料定义 ──

export type FlowNodeKind =
    // 前端动作节点
    | 'setData'
    | 'setVisible'
    | 'navigate'
    | 'animate'
    // 后端动作节点
    | 'dbQuery'
    | 'dbInsert'
    | 'dbUpdate'
    | 'dbDelete'
    | 'httpRequest'
    | 'transform'
    | 'script'
    // 共享节点
    | 'condition'
    | 'delay'
    // 值节点
    | 'variable'
    | 'pageVar'
    | 'eventParam'

export interface FlowNodeMaterial {
    kind: FlowNodeKind
    label: string
    description: string
    /** 节点分类 */
    category: 'action' | 'value'
    /** 节点色标 */
    color: string
}

/** 前端流程节点物料（用于页面事件编辑器） */
export const CLIENT_FLOW_NODE_MATERIALS: FlowNodeMaterial[] = [
    // ── 动作节点 ──
    {
        kind: 'setData',
        label: '设置数据',
        description: '修改某个 View 的 data 字段值',
        category: 'action',
        color: '#3498db',
    },
    {
        kind: 'setVisible',
        label: '显隐控制',
        description: '设置某个 View 的可见性',
        category: 'action',
        color: '#3498db',
    },
    {
        kind: 'navigate',
        label: '跳转页面',
        description: '导航到另一个页面',
        category: 'action',
        color: '#3498db',
    },
    {
        kind: 'animate',
        label: '播放动画',
        description: '触发某个 View 的预定义动画',
        category: 'action',
        color: '#3498db',
    },
    {
        kind: 'condition',
        label: '条件分支',
        description: '根据条件选择 true / false 分支',
        category: 'action',
        color: '#e67e22',
    },
    {
        kind: 'delay',
        label: '延迟等待',
        description: '等待指定毫秒后继续执行',
        category: 'action',
        color: '#3498db',
    },
    // ── 值节点 ──
    {
        kind: 'variable',
        label: 'View 变量',
        description: '引用某个 View 的 data 字段值',
        category: 'value',
        color: '#27ae60',
    },
    {
        kind: 'pageVar',
        label: '页面变量',
        description: '引用当前页面的 data 字段值',
        category: 'value',
        color: '#27ae60',
    },
    {
        kind: 'eventParam',
        label: '事件参数',
        description: '引用触发事件时传入的原始参数',
        category: 'value',
        color: '#27ae60',
    },
]

/** 后端云函数节点物料（用于云函数编辑器） */
export const SERVER_FLOW_NODE_MATERIALS: FlowNodeMaterial[] = [
    // ── 数据库操作 ──
    {
        kind: 'dbQuery',
        label: '数据库查询',
        description: '从数据库查询数据',
        category: 'action',
        color: '#8e44ad',
    },
    {
        kind: 'dbInsert',
        label: '数据库插入',
        description: '向数据库插入数据',
        category: 'action',
        color: '#8e44ad',
    },
    {
        kind: 'dbUpdate',
        label: '数据库更新',
        description: '更新数据库中的数据',
        category: 'action',
        color: '#8e44ad',
    },
    {
        kind: 'dbDelete',
        label: '数据库删除',
        description: '删除数据库中的数据',
        category: 'action',
        color: '#8e44ad',
    },
    // ── 网络与计算 ──
    {
        kind: 'httpRequest',
        label: 'HTTP 请求',
        description: '发送 HTTP 请求到外部接口',
        category: 'action',
        color: '#2980b9',
    },
    {
        kind: 'transform',
        label: '数据转换',
        description: '对数据进行格式转换或映射',
        category: 'action',
        color: '#16a085',
    },
    {
        kind: 'script',
        label: '自定义脚本',
        description: '执行自定义 JavaScript 脚本',
        category: 'action',
        color: '#d35400',
    },
    // ── 流程控制 ──
    {
        kind: 'condition',
        label: '条件分支',
        description: '根据条件选择 true / false 分支',
        category: 'action',
        color: '#e67e22',
    },
    {
        kind: 'delay',
        label: '延迟等待',
        description: '等待指定毫秒后继续执行',
        category: 'action',
        color: '#3498db',
    },
]

/** 默认使用前端物料（向后兼容） */
export const FLOW_NODE_MATERIALS = CLIENT_FLOW_NODE_MATERIALS


// ── 拖拽数据协议 ──

export const FLOW_NODE_DRAG_TYPE = 'application/x-flow-node-kind'

export function setFlowNodeDragData(e: React.DragEvent, kind: FlowNodeKind) {
    e.dataTransfer.setData(FLOW_NODE_DRAG_TYPE, kind)
    e.dataTransfer.effectAllowed = 'copy'
}

export function getFlowNodeDragData(e: React.DragEvent): FlowNodeKind | null {
    const kind = e.dataTransfer.getData(FLOW_NODE_DRAG_TYPE)
    return kind ? (kind as FlowNodeKind) : null
}

// ── 单个物料卡片 ──

interface NodeCardProps {
    material: FlowNodeMaterial
}

const NodeCard: React.FC<NodeCardProps> = ({ material }) => {
    const handleDragStart = (e: React.DragEvent) => {
        setFlowNodeDragData(e, material.kind)
    }

    return (
        <div
            className={styles.nodeCard}
            draggable
            onDragStart={handleDragStart}
            title={material.description}
            style={{ '--node-color': material.color } as React.CSSProperties}
        >
            <span className={styles.nodeColorDot} />
            <span className={styles.nodeLabel}>{material.label}</span>
        </div>
    )
}

// ── 物料面板主体 ──

interface FlowNodePaletteProps {
    /** vertical（默认）：竖向排列，用于嵌入侧边栏；horizontal：横向排列，用于弹窗顶部 */
    layout?: 'vertical' | 'horizontal'
    /** 自定义物料列表（默认使用前端物料） */
    materials?: FlowNodeMaterial[]
}

const FlowNodePalette: React.FC<FlowNodePaletteProps> = ({ layout = 'vertical', materials = CLIENT_FLOW_NODE_MATERIALS }) => {
    const isHorizontal = layout === 'horizontal'
    const actionNodes = materials.filter(m => m.category === 'action')
    const valueNodes = materials.filter(m => m.category === 'value')

    return (
        <div className={isHorizontal ? styles.paletteHorizontal : styles.palette}>
            <div className={isHorizontal ? styles.groupHorizontal : styles.group}>
                <div className={styles.groupHeader}>动作节点</div>
                <div className={isHorizontal ? styles.cardRow : undefined}>
                    {actionNodes.map(m => (
                        <NodeCard key={m.kind} material={m} />
                    ))}
                </div>
            </div>
            {valueNodes.length > 0 && (
                <div className={isHorizontal ? styles.groupHorizontal : styles.group}>
                    <div className={styles.groupHeader}>值节点</div>
                    <div className={isHorizontal ? styles.cardRow : undefined}>
                        {valueNodes.map(m => (
                            <NodeCard key={m.kind} material={m} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

export default FlowNodePalette
