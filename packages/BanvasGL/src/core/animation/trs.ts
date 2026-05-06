/**
 * TRS 工具模块（薄代理层）
 *
 * 底层实现已迁移到通用数学模块：
 * - extractTranslation2D / extractRotationZ → Matrix4 实例方法
 * - lerpAngle → MathUtils.lerpAngle
 *
 * 本模块保留原有 API 签名，在动画系统内部提供便捷调用。
 */

import type Matrix4 from '@/core/math/Matrix4'
import { MathUtils } from '@/core/math/MathUtils'

/**
 * 从 Matrix4 中提取 2D 平移分量
 */
export function extractTranslation(m: Matrix4): { x: number; y: number } {
    return m.extractTranslation2D()
}

/**
 * 从 Matrix4 中提取 Z 轴旋转角度（弧度）
 */
export function extractRotationZ(m: Matrix4): number {
    return m.extractRotationZ()
}

/**
 * 角度短弧插值
 *
 * @param from 起始角度（弧度）
 * @param to 目标角度（弧度）
 * @param t 进度 0-1
 */
export function lerpAngle(from: number, to: number, t: number): number {
    return MathUtils.lerpAngle(from, to, t)
}
