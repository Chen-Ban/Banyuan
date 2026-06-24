/**
 * 样式基础类型别名
 *
 * 实现文件中定义的类型别名统一收拢至此，供样式类（FillStyle / StrokeStyle / Gradient / Image / Video）引用。
 */

import type Color from '@/foundation/style/Color'

/** 填充类型枚举：纯色、三种渐变、图片图案 */
export type FillType = 'color' | 'linearGradient' | 'radialGradient' | 'conicGradient' | 'image'

/** 描边类型枚举：纯色、三种渐变、图片图案 */
export type StrokeType = 'color' | 'linearGradient' | 'radialGradient' | 'conicGradient' | 'image'

/** 渐变色标 */
export type GradientStop = {
    color: Color
    position: number // 0-1
}

/** 图片图案尺寸 */
export interface PatternSize {
    width: number
    height: number
}

/** 视频图案平铺模式 */
export type VideoRepeat = 'repeat' | 'repeat-x' | 'repeat-y' | 'no-repeat'

/** 视频尺寸 */
export interface VideoSize {
    width: number
    height: number
}
