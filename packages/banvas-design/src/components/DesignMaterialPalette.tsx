import React from 'react'
import type { IComponentDefinition, IDragProps } from '@banyuan/banvasgl'

// ── 类型定义 ──

export interface DesignMaterialPaletteProps {
    /**
     * 自定义物料卡片渲染（slot）
     *
     * 不传则使用默认渲染（图标网格 + hover 提示）。
     * 传入时，dragProps 已计算好，业务方 spread 到根元素即可。
     */
    renderMaterial?: (material: IComponentDefinition, dragProps: IDragProps) => React.ReactNode
    /** 自定义容器 className */
    className?: string
    /** 自定义容器 style */
    style?: React.CSSProperties
}

/** 内部 props（由 hook 注入，业务方不需要传） */
interface InternalProps extends DesignMaterialPaletteProps {
    materials: IComponentDefinition[]
    dragProps: (component: IComponentDefinition) => IDragProps
}

// ── 默认样式 ──

const paletteStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    padding: 8,
}

const itemStyle: React.CSSProperties = {
    width: 36,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    border: '1px solid #e8e8e8',
    background: '#fafafa',
    cursor: 'grab',
    userSelect: 'none',
}

// ── 默认图标渲染 ──

const ComponentIcon: React.FC<{ icon: IComponentDefinition['icon'] }> = ({ icon }) => {
    if (icon.type === 'svg') {
        return (
            <span
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                dangerouslySetInnerHTML={{ __html: icon.content }}
            />
        )
    }
    return <img src={icon.src} width={20} height={20} alt="" style={{ objectFit: 'contain' }} />
}

// ── 组件实现 ──

/**
 * 设计态物料面板默认 UI
 *
 * 由 useDesignBanvas 返回，业务方直接渲染即可：
 * ```tsx
 * const { Banvas, MaterialPalette } = useDesignBanvas(pages, options)
 * return (
 *   <div>
 *     <MaterialPalette />
 *     {Banvas}
 *   </div>
 * )
 * ```
 *
 * 如需自定义单个物料卡片的渲染，传入 renderMaterial slot：
 * ```tsx
 * <MaterialPalette renderMaterial={(m, dp) => (
 *   <MyCard key={m.id} {...dp}>{m.label}</MyCard>
 * )} />
 * ```
 */
const DesignMaterialPaletteInner: React.FC<InternalProps> = ({
    materials,
    dragProps,
    renderMaterial,
    className,
    style,
}) => {
    return (
        <div className={className} style={{ ...paletteStyle, ...style }}>
            {materials.map(def => {
                const dp = dragProps(def)

                if (renderMaterial) {
                    return <React.Fragment key={def.id}>{renderMaterial(def, dp)}</React.Fragment>
                }

                return (
                    <div
                        key={def.id}
                        style={itemStyle}
                        title={def.description ?? def.label}
                        {...dp}
                    >
                        <ComponentIcon icon={def.icon} />
                    </div>
                )
            })}
        </div>
    )
}

/**
 * 创建绑定好 materials + dragProps 的 MaterialPalette 组件
 *
 * 由 hook 内部调用，返回一个只需要接收 slot props 的组件。
 */
export function createDesignMaterialPalette(
    materials: IComponentDefinition[],
    dragProps: (component: IComponentDefinition) => IDragProps,
): React.FC<DesignMaterialPaletteProps> {
    const BoundPalette: React.FC<DesignMaterialPaletteProps> = (props) => (
        <DesignMaterialPaletteInner
            {...props}
            materials={materials}
            dragProps={dragProps}
        />
    )
    BoundPalette.displayName = 'DesignMaterialPalette'
    return BoundPalette
}
