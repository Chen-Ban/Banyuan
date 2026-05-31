/**
 * MaterialPanel — 自定义物料面板
 *
 * 展示用户保存的自定义物料列表，支持搜索和拖拽到画布实例化。
 * 作为 ComponentPalette 的补充区域显示。
 */

import React, { useState, useEffect, useCallback } from 'react'
import { Input } from 'antd'
import { BlockOutlined } from '@ant-design/icons'
import { materialApi } from '@/api'
import type { IMaterial } from '@banyuan/banvasgl'
import styles from './index.module.scss'

export interface MaterialPanelProps {
  className?: string
  style?: React.CSSProperties
}

const MaterialPanel: React.FC<MaterialPanelProps> = ({ className, style }) => {
  const [materials, setMaterials] = useState<Partial<IMaterial>[]>([])
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)

  const loadMaterials = useCallback(async (search?: string) => {
    setLoading(true)
    try {
      const res = await materialApi.fetchMaterials({
        keyword: search || undefined,
        status: 'active',
      })
      setMaterials(res.data.materials)
    } catch {
      // 静默处理
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadMaterials()
  }, [loadMaterials])

  const handleSearch = useCallback((value: string) => {
    setKeyword(value)
    loadMaterials(value)
  }, [loadMaterials])

  const handleDragStart = useCallback((e: React.DragEvent, material: Partial<IMaterial>) => {
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({ materialId: material.material_id }),
    )
    e.dataTransfer.effectAllowed = 'copy'
  }, [])

  return (
    <div className={`${styles.panel} ${className ?? ''}`} style={style}>
      <div className={styles.header}>
        <div className={styles.title}>自定义物料</div>
        <Input.Search
          className={styles.searchInput}
          placeholder="搜索物料"
          size="small"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onSearch={handleSearch}
          allowClear
        />
      </div>

      <div className={styles.list}>
        {materials.length === 0 && !loading && (
          <div className={styles.empty}>
            {keyword ? '没有匹配的物料' : '暂无自定义物料'}
          </div>
        )}

        {materials.map((material) => (
          <div
            key={material.material_id}
            className={styles.item}
            draggable
            onDragStart={(e) => handleDragStart(e, material)}
            title={material.description || material.name}
          >
            <span className={styles.itemIcon}>
              <BlockOutlined />
            </span>
            <div className={styles.itemInfo}>
              <div className={styles.itemName}>{material.name}</div>
              {material.description && (
                <div className={styles.itemDesc}>{material.description}</div>
              )}
              {material.tags && material.tags.length > 0 && (
                <div className={styles.itemTags}>
                  {material.tags.slice(0, 3).map((tag) => (
                    <span key={tag} className={styles.tag}>{tag}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default MaterialPanel
