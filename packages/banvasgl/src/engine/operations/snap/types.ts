/** 吸附方向 */
export const enum SnapAxis {
  X = 0,
  Y = 1,
}

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
