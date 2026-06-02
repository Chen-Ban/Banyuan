import React, { useCallback, useEffect, useState } from 'react'
import type { IMaterial, IMaterialTemplate } from '@banyuan/banvasgl'
import { materialApi } from '@/api'
import styles from './index.module.scss'

export interface IFlowDragProps {
    draggable: true
    onDragStart: (e: any) => void
}

// ── 类型定义 ──

/** 流程画布模式：client 前端事件流程 / server 云函数流程 */
export type FlowMode = 'client' | 'server'

export type FlowNodeCategory = 'action' | 'value'

export function getFlowNodeCategory(material: IMaterial): FlowNodeCategory {
    return material.meta.tags?.includes('value') ? 'value' : 'action'
}

export interface FlowMaterialPaletteProps {
    /** 流程模式（决定获取哪类物料） */
    mode?: FlowMode
    renderMaterial?: (material: IMaterial, dragProps: IFlowDragProps) => React.ReactNode
    className?: string
    style?: React.CSSProperties
}

// ── 组件实现 ──

/**
 * 流程物料面板（自含组件）
 *
 * 内部自行获取物料数据并管理拖拽协议：
 * ```tsx
 * <FlowMaterialPalette mode="client" />
 * <FlowMaterialPalette mode="server" />
 * ```
 */
const FlowMaterialPalette: React.FC<FlowMaterialPaletteProps> = ({
    mode = 'client',
    renderMaterial,
    className,
    style,
}) => {
    const [materials, setMaterials] = useState<IMaterial[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // ── 从后端获取流程节点物料 ──
    useEffect(() => {
        let cancelled = false
        const tags = ['flow', mode]

        setLoading(true)
        setError(null)

        materialApi.fetchMaterials({ source: 'builtin', kind: 'flow', tags, status: 'active', pageSize: 50 })
            .then((res) => {
                if (cancelled) return
                return Promise.all(
                    res.data.materials.map((m: any) =>
                        materialApi.fetchMaterial(m.material_id!)
                            .then((detail) => detail.data),
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
                setLoading(false)
            })
            .catch((err) => {
                if (cancelled) return
                setError(err?.message ?? '物料加载失败')
                setLoading(false)
            })

        return () => { cancelled = true }
    }, [mode])

    // ── 拖拽 props 工厂（统一使用 application/json 协议） ──
    const dragProps = useCallback(
        (material: IMaterial): IFlowDragProps => ({
            draggable: true,
            onDragStart: (e: any) => {
                e.dataTransfer.setData(
                    'application/json',
                    JSON.stringify({ materialId: material.meta.id }),
                )
                e.dataTransfer.effectAllowed = 'copy'
            },
        }),
        [],
    )

    // ── 加载/错误状态 ──
    if (loading) {
        return (
            <div className={`${styles.palette} ${className ?? ''}`} style={style}>
                <div className={styles.placeholder}>加载中...</div>
            </div>
        )
    }

    if (error) {
        return (
            <div className={`${styles.palette} ${className ?? ''}`} style={style}>
                <div className={styles.error}>{error}</div>
            </div>
        )
    }

    // ── 分组渲染 ──
    const actionNodes = materials.filter(m => getFlowNodeCategory(m) === 'action')
    const valueNodes = materials.filter(m => getFlowNodeCategory(m) === 'value')

    const renderItem = (m: IMaterial) => {
        const dp = dragProps(m)

        if (renderMaterial) {
            return <React.Fragment key={m.meta.id}>{renderMaterial(m, dp)}</React.Fragment>
        }

        return (
            <div
                key={m.meta.id}
                className={styles.card}
                title={m.meta.description}
                {...dp}
            >
                {m.meta.name}
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

export default FlowMaterialPalette
