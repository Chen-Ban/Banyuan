/**
 * ComponentPalette — 从左侧弹出的物料抽屉
 *
 * 职责：以 Drawer 形式展示物料，内部 grid 布局，不占用画布空间。
 * 通过 renderMaterial slot 覆盖默认样式，适配深色主题。
 */

import React from 'react'
import { Drawer, Tooltip } from 'antd'
import type { DesignMaterialPaletteProps } from '@banyuan/banyan-sdk'
import type { IComponentDefinition, IDragProps } from '@banyuan/banvasgl'
import styles from './index.module.scss'

interface ComponentPaletteProps {
  /** 控制抽屉开关 */
  open: boolean
  onClose: () => void
  /** 抽屉挂载的 DOM 容器（相对定位基准） */
  container: HTMLElement | null
  /**
   * 由 useDesignBanvas 返回的 MaterialPalette 组件
   * 传入时通过 renderMaterial slot 自定义卡片样式
   */
  MaterialPalette: React.FC<DesignMaterialPaletteProps>
}

/** 单个物料卡片（深色主题 grid 项） */
const MaterialItem: React.FC<{
  def: IComponentDefinition
  dragProps: IDragProps
}> = ({ def, dragProps }) => {
  const icon = def.icon
  return (
    <Tooltip title={def.description ?? def.label} placement="right" mouseEnterDelay={0.4}>
      <div className={styles.item} {...dragProps}>
        <span className={styles.itemIcon}>
          {icon.type === 'svg' ? (
            <span dangerouslySetInnerHTML={{ __html: icon.content }} />
          ) : (
            <img src={icon.src} width={18} height={18} alt="" style={{ objectFit: 'contain' }} />
          )}
        </span>
        <span className={styles.itemLabel}>{def.label}</span>
      </div>
    </Tooltip>
  )
}

const ComponentPalette: React.FC<ComponentPaletteProps> = ({
  open,
  onClose,
  container,
  MaterialPalette,
}) => {
  const renderMaterial = (def: IComponentDefinition, dragProps: IDragProps) => (
    <MaterialItem key={def.id} def={def} dragProps={dragProps} />
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
      <MaterialPalette
        className={styles.grid}
        renderMaterial={renderMaterial}
      />
    </Drawer>
  )
}

export default ComponentPalette
