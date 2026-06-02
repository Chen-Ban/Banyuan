/**
 * ComponentPalette — 从左侧弹出的物料抽屉
 *
 * 职责：以 Drawer 形式展示物料，内部 grid 布局，不占用画布空间。
 * 通过 renderMaterial slot 覆盖默认样式，适配深色主题。
 */

import React from 'react'
import { Drawer, Tooltip } from 'antd'
import { DesignMaterialPalette } from '@/components/DesignEditor'
import type { IMaterial } from '@banyuan/banvasgl'
import type { IDragProps } from '@/types'
import MaterialPanel from '@/components/MaterialPanel'
import MaterialThumbnail from '@/components/MaterialThumbnail'
import styles from './index.module.scss'

interface ComponentPaletteProps {
  /** 控制抽屉开关 */
  open: boolean
  onClose: () => void
  /** 抽屉挂载的 DOM 容器（相对定位基准） */
  container: HTMLElement | null
}

/** 单个物料卡片（深色主题 grid 项） */
const MaterialItem: React.FC<{
  material: IMaterial
  dragProps: IDragProps
}> = ({ material, dragProps }) => {
  return (
    <Tooltip title={material.meta.description ?? material.meta.name} placement="right" mouseEnterDelay={0.4}>
      <div className={styles.item} {...dragProps}>
        <span className={styles.itemIcon}>
          <MaterialThumbnail material={material} size={18} />
        </span>
        <span className={styles.itemLabel}>{material.meta.name}</span>
      </div>
    </Tooltip>
  )
}

const ComponentPalette: React.FC<ComponentPaletteProps> = ({
  open,
  onClose,
  container,
}) => {
  const renderMaterial = (material: IMaterial, dragProps: IDragProps) => (
    <MaterialItem key={material.meta.id} material={material} dragProps={dragProps} />
  )

  return (
    <Drawer
      open={open}
      onClose={onClose}
      placement="left"
      width={260}
      mask={false}
      closable={false}
      classNames={{ body: styles.drawerBody }}
      getContainer={container ?? false}
      rootStyle={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, height: '100%' }}
      styles={{
        wrapper: {
          // 卡片效果：距容器四边 12px，圆角，淡边框
          top: 12,
          bottom: 12,
          left: 12,
          height: 'calc(100% - 24px)',
          borderRadius: 12,
          border: '1px solid rgba(255, 255, 255, 0.1)',
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
        },
      }}
    >
      <DesignMaterialPalette
        className={styles.grid}
        renderMaterial={renderMaterial}
      />
      <MaterialPanel />
    </Drawer>
  )
}

export default ComponentPalette
