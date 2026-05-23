/**
 * ComponentPalette — 纯物料容器
 *
 * 职责：仅渲染由外部传入的 MaterialPalette 物料区域。
 * 应用级操作（返回、命名、保存、生成应用）已上移至 ApplicationLayout。
 */

import React from 'react'
import styles from './index.module.scss'

interface ComponentPaletteProps {
  /**
   * 物料区域内容
   *
   * 由外部使用 hook 返回的 MaterialPalette 组件渲染后传入：
   * ```tsx
   * <ComponentPalette materialContent={<MaterialPalette />} />
   * ```
   */
  materialContent: React.ReactNode
}

const ComponentPalette: React.FC<ComponentPaletteProps> = ({ materialContent }) => {
  return (
    <div className={styles.palette}>
      <div className={styles.componentsSection}>
        {materialContent}
      </div>
    </div>
  )
}

export default ComponentPalette
