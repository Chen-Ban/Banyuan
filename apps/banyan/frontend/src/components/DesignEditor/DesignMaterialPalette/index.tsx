import React, { useCallback, useEffect, useState } from 'react'
import type { IMaterial, IMaterialTemplate } from '@banyuan/banvasgl'
import type { IDragProps } from '@/types'
import { materialApi } from '@/api'
import MaterialThumbnail from '@/components/MaterialThumbnail'
import styles from './index.module.scss'

export interface DesignMaterialPaletteProps {
    renderMaterial?: (material: IMaterial, dragProps: IDragProps) => React.ReactNode
    className?: string
    style?: React.CSSProperties
}

/**
 * 设计物料面板（自含组件）
 *
 * 内部自行获取物料数据并管理拖拽协议，消费方直接渲染即可：
 * ```tsx
 * <DesignMaterialPalette />
 * // 或自定义渲染：
 * <DesignMaterialPalette renderMaterial={(m, dp) => <MyCard {...dp}>{m.meta.name}</MyCard>} />
 * ```
 */
const DesignMaterialPalette: React.FC<DesignMaterialPaletteProps> = ({
    renderMaterial,
    className,
    style,
}) => {
    const [materials, setMaterials] = useState<IMaterial[]>([])

    // ── 从后端获取物料列表 ──
    useEffect(() => {
        let cancelled = false
        materialApi
            .fetchMaterials({ source: 'builtin', kind: 'render', status: 'active', pageSize: 50 })
            .then((res) => {
                if (cancelled) return
                return Promise.all(
                    res.data.materials.map((m: any) =>
                        materialApi.fetchMaterial(m.material_id!).then((detail) => detail.data),
                    ),
                )
            })
            .then((fullMaterials) => {
                if (cancelled || !fullMaterials) return
                const mapped: IMaterial[] = fullMaterials.map((m: any) => ({
                    meta: {
                        id: m.material_id,
                        name: m.name,
                        description: m.description,
                        tags: m.tags,
                        thumbnail: m.thumbnail,
                        source: m.source,
                        version: m.version,
                    },
                    template: m.template as IMaterialTemplate,
                }))
                setMaterials(mapped)
            })
            .catch(() => {
                /* 静默处理 */
            })

        return () => { cancelled = true }
    }, [])

    // ── 拖拽 props 工厂 ──
    const dragProps = useCallback(
        (material: IMaterial): IDragProps => ({
            draggable: true,
            onDragStart: (e: any) => {
                e.dataTransfer.setData(
                    'application/json',
                    JSON.stringify({ template: material.template }),
                )
                e.dataTransfer.effectAllowed = 'copy'
            },
        }),
        [],
    )

    return (
        <div className={`${styles.palette} ${className ?? ''}`} style={style}>
            {materials.map(material => {
                const dp = dragProps(material)

                if (renderMaterial) {
                    return <React.Fragment key={material.meta.id}>{renderMaterial(material, dp)}</React.Fragment>
                }

                return (
                    <div
                        key={material.meta.id}
                        className={styles.item}
                        title={material.meta.description ?? material.meta.name}
                        {...dp}
                    >
                        <MaterialThumbnail material={material} size={20} className={styles.iconWrapper} />
                    </div>
                )
            })}
        </div>
    )
}

export default DesignMaterialPalette
export type { DesignMaterialPaletteProps as DesignMaterialPaletteExportProps }
