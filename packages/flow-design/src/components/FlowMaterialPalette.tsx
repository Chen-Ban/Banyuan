import React from 'react'
import type { FlowNodeMaterial } from '../materials.js'
import type { IFlowDragProps } from '../hook/useFlowBanvas.js'

// ── 类型定义 ──

export interface FlowMaterialPaletteProps {
    /**
     * 自定义物料卡片渲染（slot）
     *
     * 不传则使用默认渲染（按 category 分组 + 简洁卡片）。
     * 传入时，dragProps 已计算好，业务方 spread 到根元素即可。
     */
    renderMaterial?: (material: FlowNodeMaterial, dragProps: IFlowDragProps) => React.ReactNode
    /** 自定义容器 className */
    className?: string
    /** 自定义容器 style */
    style?: React.CSSProperties
}

/** 内部 props（由 hook 注入，业务方不需要传） */
interface InternalProps extends FlowMaterialPaletteProps {
    materials: FlowNodeMaterial[]
    dragProps: (material: FlowNodeMaterial) => IFlowDragProps
}

// ── 默认样式 ──

const paletteStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 8,
}

const groupStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
}

const groupHeaderStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--flow-palette-text-secondary, #666)',
    padding: '2px 0',
}

const cardRowStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
}

const cardStyle: React.CSSProperties = {
    padding: '4px 8px',
    fontSize: 12,
    borderRadius: 4,
    border: '1px solid var(--flow-palette-border, #e0e0e0)',
    background: 'var(--flow-palette-card-bg, #fafafa)',
    color: 'var(--flow-palette-text, currentColor)',
    cursor: 'grab',
    userSelect: 'none',
    whiteSpace: 'nowrap',
}

// ── 组件实现 ──

/**
 * 流程物料面板默认 UI
 *
 * 由 useFlowBanvas 返回，业务方直接渲染即可：
 * ```tsx
 * const { Canvas, MaterialPalette } = useFlowBanvas(options, schema, mode)
 * return (
 *   <div>
 *     <MaterialPalette />
 *     {Canvas}
 *   </div>
 * )
 * ```
 *
 * 如需自定义单个物料卡片的渲染，传入 renderMaterial slot：
 * ```tsx
 * <MaterialPalette renderMaterial={(m, dp) => (
 *   <MyCard key={m.kind} {...dp}>{m.label}</MyCard>
 * )} />
 * ```
 */
const FlowMaterialPaletteInner: React.FC<InternalProps> = ({
    materials,
    dragProps,
    renderMaterial,
    className,
    style,
}) => {
    const actionNodes = materials.filter(m => m.category === 'action')
    const valueNodes = materials.filter(m => m.category === 'value')

    const renderItem = (m: FlowNodeMaterial) => {
        const dp = dragProps(m)

        if (renderMaterial) {
            return <React.Fragment key={m.kind}>{renderMaterial(m, dp)}</React.Fragment>
        }

        return (
            <div
                key={m.kind}
                style={cardStyle}
                title={m.description}
                {...dp}
            >
                {m.label}
            </div>
        )
    }

    return (
        <div className={className} style={{ ...paletteStyle, ...style }}>
            {actionNodes.length > 0 && (
                <div style={groupStyle}>
                    <div style={groupHeaderStyle}>动作节点</div>
                    <div style={cardRowStyle}>
                        {actionNodes.map(renderItem)}
                    </div>
                </div>
            )}
            {valueNodes.length > 0 && (
                <div style={groupStyle}>
                    <div style={groupHeaderStyle}>值节点</div>
                    <div style={cardRowStyle}>
                        {valueNodes.map(renderItem)}
                    </div>
                </div>
            )}
        </div>
    )
}

/**
 * 创建绑定好 materials + dragProps 的 MaterialPalette 组件
 *
 * 由 hook 内部调用，返回一个只需要接收 slot props 的组件。
 */
export function createFlowMaterialPalette(
    materials: FlowNodeMaterial[],
    dragProps: (material: FlowNodeMaterial) => IFlowDragProps,
): React.FC<FlowMaterialPaletteProps> {
    const BoundPalette: React.FC<FlowMaterialPaletteProps> = (props) => (
        <FlowMaterialPaletteInner
            {...props}
            materials={materials}
            dragProps={dragProps}
        />
    )
    BoundPalette.displayName = 'FlowMaterialPalette'
    return BoundPalette
}
