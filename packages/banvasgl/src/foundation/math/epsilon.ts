/**
 * 数值精度常量 —— 叶子文件
 *
 * 从 MathUtils 中抽离，供 Matrix4 等模块直接引用，
 * 避免 Matrix4 → MathUtils → Matrix4 的循环依赖。
 *
 * MathUtils 中的同名静态属性保留，内部引用此文件的值。
 */

/** 几何容差：用于判断点是否在曲线上、两几何量是否视觉相等（像素级） */
export const EPSILON = 1e-2

/** 浮点零判断：用于检测除零、矩阵奇异、向量退化等 */
export const FLOAT_EPSILON = 1e-10

/** 数值微分步长：用于差分求切线、梯度等 */
export const DERIVATIVE_STEP = 1e-6

/** 积分/细分收敛精度：用于自适应 Simpson、递归细分终止 */
export const INTEGRATION_TOLERANCE = 1e-6
