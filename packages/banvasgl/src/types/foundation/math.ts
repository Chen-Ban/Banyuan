/**
 * 平台无关的数学类型（引擎自有）
 */

/** 2D 仿射变换矩阵初始化对象（等价于 DOMMatrix2DInit） */
export interface Matrix2DInit {
  a?: number
  b?: number
  c?: number
  d?: number
  e?: number
  f?: number
  m11?: number
  m12?: number
  m21?: number
  m22?: number
  m41?: number
  m42?: number
}
