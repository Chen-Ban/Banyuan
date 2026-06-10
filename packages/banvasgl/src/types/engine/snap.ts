// SnapAxis 枚举值定义已迁移至 foundation/constants（打破 barrel 循环依赖），
// 此处仅作为类型引用。
import type { SnapAxis } from '@/foundation/constants'

/** 单轴吸附结果 */
export interface AxisSnap {
  axis: SnapAxis
  /** 需要施加的偏移 */
  offset: number
  /** 对齐线的世界坐标（X轴吸附时为x值，Y轴时为y值） */
  guideCoord: number
}

/** 综合吸附结果 */
export interface SnapResult {
  offsetX: number
  offsetY: number
  guidelines: AxisSnap[]
}
