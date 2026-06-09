/**
 * UnifiedMaterialPanel — 统一物料面板
 *
 * 三段式布局：
 *   1. 内置物料（按当前模式过滤）
 *   2. 自定义物料（应用级）
 *   3. 物料市场（占位）
 *
 * 顶部搜索框做全局过滤，栅格卡片展示，拖拽协议统一为 { materialId }。
 * 每个分组最多展示 3×3（9项），超出折叠，点击展开/收起。
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Input, Tooltip } from 'antd'
import { SearchOutlined, DownOutlined, UpOutlined } from '@ant-design/icons'
import type { IMaterial, IMaterialTemplate } from '@banyuan/banvasgl'
import { materialApi } from '@/api'
import MaterialThumbnail from '@/components/MaterialThumbnail'
import styles from './index.module.scss'

// ── 类型定义 ──

export type MaterialMode = 'render' | 'client-flow' | 'server-flow'

export interface UnifiedMaterialPanelProps {
  mode: MaterialMode
  className?: string
  style?: React.CSSProperties
}

interface MaterialGroup {
  key: string
  title: string
  materials: IMaterial[]
}

const MAX_VISIBLE = 9 // 3×3

// ── 辅助函数 ──

function getMaterialParams(mode: MaterialMode) {
  switch (mode) {
    case 'render':
      return { source: 'builtin' as const, kind: 'render' as const, tags: undefined }
    case 'client-flow':
      return { source: 'builtin' as const, kind: 'flow' as const, tags: ['flow', 'client'] }
    case 'server-flow':
      return { source: 'builtin' as const, kind: 'flow' as const, tags: ['flow', 'server'] }
  }
}

function isFlowMode(mode: MaterialMode): boolean {
  return mode === 'client-flow' || mode === 'server-flow'
}

// ── 可折叠分组子组件 ──

const CollapsibleGrid: React.FC<{
  materials: IMaterial[]
  onDragStart: (e: React.DragEvent, material: IMaterial) => void
}> = ({ materials, onDragStart }) => {
  const [expanded, setExpanded] = useState(false)
  const needsCollapse = materials.length > MAX_VISIBLE
  const visibleMaterials = needsCollapse && !expanded
    ? materials.slice(0, MAX_VISIBLE)
    : materials

  return (
    <>
      <div className={styles.grid}>
        {visibleMaterials.map((material) => (
          <Tooltip
            key={material.meta.id}
            title={material.meta.description ?? material.meta.name}
            placement="right"
            mouseEnterDelay={0.4}
          >
            <div
              className={styles.card}
              draggable
              onDragStart={(e) => onDragStart(e, material)}
            >
              <span className={styles.cardIcon}>
                <MaterialThumbnail material={material} size={18} />
              </span>
              <span className={styles.cardLabel}>{material.meta.name}</span>
            </div>
          </Tooltip>
        ))}
      </div>
      {needsCollapse && (
        <button
          className={styles.expandBtn}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? (
            <><UpOutlined /> 收起</>
          ) : (
            <><DownOutlined /> 展开全部 ({materials.length})</>
          )}
        </button>
      )}
    </>
  )
}

// ── 组件实现 ──

const UnifiedMaterialPanel: React.FC<UnifiedMaterialPanelProps> = ({
  mode,
  className,
  style,
}) => {
  const [builtinMaterials, setBuiltinMaterials] = useState<IMaterial[]>([])
  const [customMaterials, setCustomMaterials] = useState<IMaterial[]>([])
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)

  // ── 获取内置物料 ──
  useEffect(() => {
    let cancelled = false
    setLoading(true)

    const params = getMaterialParams(mode)
    materialApi
      .fetchMaterials({
        source: params.source,
        kind: params.kind,
        tags: params.tags,
        status: 'active',
        pageSize: 100,
      })
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
        setBuiltinMaterials(mapped)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [mode])

  // ── 获取自定义物料 ──
  useEffect(() => {
    let cancelled = false

    const kind = mode === 'render' ? 'render' : 'flow'
    materialApi
      .fetchMaterials({ source: 'user', kind, status: 'active', pageSize: 100 })
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
        setCustomMaterials(mapped)
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [mode])

  // ── 搜索过滤 ──
  const filterMaterials = useCallback((materials: IMaterial[]) => {
    if (!keyword.trim()) return materials
    const kw = keyword.trim().toLowerCase()
    return materials.filter(
      (m) =>
        m.meta.name.toLowerCase().includes(kw) ||
        m.meta.description?.toLowerCase().includes(kw) ||
        m.meta.tags?.some((t) => t.toLowerCase().includes(kw)),
    )
  }, [keyword])

  // ── 内置物料分组 ──
  const builtinGroups: MaterialGroup[] = useMemo(() => {
    const filtered = filterMaterials(builtinMaterials)
    if (!isFlowMode(mode)) {
      // render 模式不分组
      return filtered.length > 0 ? [{ key: 'all', title: '内置组件', materials: filtered }] : []
    }
    // flow 模式按 action/value 分组
    const actionNodes = filtered.filter((m) => !m.meta.tags?.includes('value'))
    const valueNodes = filtered.filter((m) => m.meta.tags?.includes('value'))
    const groups: MaterialGroup[] = []
    if (actionNodes.length > 0) groups.push({ key: 'action', title: '动作节点', materials: actionNodes })
    if (valueNodes.length > 0) groups.push({ key: 'value', title: '值节点', materials: valueNodes })
    return groups
  }, [builtinMaterials, mode, filterMaterials])

  const filteredCustom = useMemo(() => filterMaterials(customMaterials), [customMaterials, filterMaterials])

  // ── 拖拽处理 ──
  const handleDragStart = useCallback((e: React.DragEvent, material: IMaterial) => {
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({ materialId: material.meta.id }),
    )
    e.dataTransfer.effectAllowed = 'copy'
  }, [])

  return (
    <div className={`${styles.panel} ${className ?? ''}`} style={style}>
      {/* 搜索框 */}
      <div className={styles.searchArea}>
        <Input
          size="small"
          placeholder="搜索物料"
          prefix={<SearchOutlined />}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          allowClear
          className={styles.searchInput}
        />
      </div>

      <div className={styles.content}>
        {/* 内置物料 */}
        {loading && (
          <div className={styles.placeholder}>加载中...</div>
        )}

        {!loading && builtinGroups.map((group) => (
          <div key={group.key} className={styles.group}>
            <div className={styles.groupTitle}>{group.title}</div>
            <CollapsibleGrid
              materials={group.materials}
              onDragStart={handleDragStart}
            />
          </div>
        ))}

        {/* 自定义物料 */}
        {filteredCustom.length > 0 && (
          <div className={styles.group}>
            <div className={styles.groupTitle}>自定义物料</div>
            <CollapsibleGrid
              materials={filteredCustom}
              onDragStart={handleDragStart}
            />
          </div>
        )}

        {/* 物料市场（占位） */}
        <div className={styles.group}>
          <div className={styles.groupTitle}>物料市场</div>
          <div className={styles.marketPlaceholder}>即将上线</div>
        </div>
      </div>
    </div>
  )
}

export default UnifiedMaterialPanel
