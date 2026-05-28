import React from 'react'
import type { FlowNodeMaterial } from '@banyuan/banvasgl'
import type { IFlowDragProps } from '../../../hooks/flow/useFlowBanvas'
import styles from './index.module.scss'

// ── 类型定义 ──

export interface FlowMaterialPaletteProps {
    renderMaterial?: (material: FlowNodeMaterial, dragProps: IFlowDragProps) => React.ReactNode
    className?: string
    style?: React.CSSProperties
}

interface InternalProps extends FlowMaterialPaletteProps {
    materials: FlowNodeMaterial[]
    dragProps: (material: FlowNodeMaterial) => IFlowDragProps
}

// ── 组件实现 ──

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
                className={styles.card}
                title={m.description}
                {...dp}
            >
                {m.label}
            </div>
        )
    }

    return (
        <div className={`${styles.palette} ${className ?? ''}`} style={style}>
            {actionNodes.length > 0 && (
                <div className={styles.group}>
                    <div className={styles.groupHeader}>动作节点</div>
                    <div className={styles.cardRow}>
                        {actionNodes.map(renderItem)}
                    </div>
                </div>
            )}
            {valueNodes.length > 0 && (
                <div className={styles.group}>
                    <div className={styles.groupHeader}>值节点</div>
                    <div className={styles.cardRow}>
                        {valueNodes.map(renderItem)}
                    </div>
                </div>
            )}
        </div>
    )
}

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
