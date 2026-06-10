/**
 * MaterialThumbnail — 物料缩略图（共享组件）
 *
 * 统一用 <img> 渲染 thumbnail，不使用 dangerouslySetInnerHTML，避免任何
 * HTML/SVG 注入风险。thumbnail 既可以是普通图片 URL，也可以是
 * data:image/svg+xml Data URL（内置物料即采用此形式）。
 *
 * 无 thumbnail 时 fallback 为名称首字。
 */

import React from 'react'
import type { IMaterial } from '@banyuan/banvasgl'

export interface MaterialThumbnailProps {
  material: IMaterial
  /** 缩略图渲染尺寸（px） */
  size?: number
  className?: string
  style?: React.CSSProperties
}

const MaterialThumbnail: React.FC<MaterialThumbnailProps> = ({
  material,
  size = 20,
  className,
  style,
}) => {
  const { thumbnail, name } = material.meta

  if (thumbnail) {
    return (
      <img
        src={thumbnail}
        width={size}
        height={size}
        alt=""
        className={className}
        style={{ objectFit: 'contain', ...style }}
      />
    )
  }

  // fallback：名称首字
  return (
    <span className={className} style={style}>
      {name.charAt(0)}
    </span>
  )
}

export default MaterialThumbnail
