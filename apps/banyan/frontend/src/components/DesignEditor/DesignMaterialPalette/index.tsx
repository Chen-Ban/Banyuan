import React from 'react'
import type { IComponentDefinition, IDragProps } from '@banyuan/banvasgl'
import styles from './index.module.scss'

export interface DesignMaterialPaletteProps {
    renderMaterial?: (material: IComponentDefinition, dragProps: IDragProps) => React.ReactNode
    className?: string
    style?: React.CSSProperties
}

interface InternalProps extends DesignMaterialPaletteProps {
    materials: IComponentDefinition[]
    dragProps: (component: IComponentDefinition) => IDragProps
}

const ComponentIcon: React.FC<{ icon: IComponentDefinition['icon'] }> = ({ icon }) => {
    if (icon.type === 'svg') {
        return (
            <span
                className={styles.iconWrapper}
                dangerouslySetInnerHTML={{ __html: icon.content }}
            />
        )
    }
    return <img src={icon.src} width={20} height={20} alt="" style={{ objectFit: 'contain' }} />
}

const DesignMaterialPaletteInner: React.FC<InternalProps> = ({
    materials,
    dragProps,
    renderMaterial,
    className,
    style,
}) => {
    return (
        <div className={`${styles.palette} ${className ?? ''}`} style={style}>
            {materials.map(def => {
                const dp = dragProps(def)

                if (renderMaterial) {
                    return <React.Fragment key={def.id}>{renderMaterial(def, dp)}</React.Fragment>
                }

                return (
                    <div
                        key={def.id}
                        className={styles.item}
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
