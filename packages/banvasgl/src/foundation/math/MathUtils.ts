import type Vector3 from './Vector3'
import Matrix4 from './Matrix4'

// ── 动画相关类型（从全局类型重导出，供本模块内部使用） ──────────────────────────

import type { EasingFunction, AnimatableValue, Interpolator, ResolvedKeyframeSegment } from '@/types'

// ── 插值器相关导出 ─────────────────────────────────────────────────────────────

/**
 * 数学工具类
 *
 * 提供线性代数、数值分析、几何计算、缓动函数、插值器等工具函数。
 */
export class MathUtils {
  /**
   * 数值精度常量
   */
  /** 几何容差：用于判断点是否在曲线上、两几何量是否视觉相等（像素级） */
  public static readonly EPSILON = 1e-2
  /** 浮点零判断：用于检测除零、矩阵奇异、向量退化等 */
  public static readonly FLOAT_EPSILON = 1e-10
  /** 数值微分步长：用于差分求切线、梯度等 */
  public static readonly DERIVATIVE_STEP = 1e-6
  /** 积分/细分收敛精度：用于自适应 Simpson、递归细分终止 */
  public static readonly INTEGRATION_TOLERANCE = 1e-6

  public static readonly PI = Math.PI
  public static readonly TWO_PI = 2 * Math.PI
  public static readonly HALF_PI = Math.PI / 2

  /**
   * 浮点近似相等判断
   *
   * 检查两个数是否相等，通过比较二者差值的绝对值是否小于给定精度阈值来判断，
   * 适用于浮点数比较场景，避免直接使用 `===` 导致的精度问题。
   *
   * @param a - 第一个数值
   * @param b - 第二个数值
   * @param epsilon - 精度阈值，默认为 MathUtils.EPSILON
   * @returns 如果两数差值绝对值小于 epsilon 则返回 true，否则返回 false
   *
   * @example
   * ```ts
   * MathUtils.isEqual(0.1 + 0.2, 0.3); // true
   * MathUtils.isEqual(1.0, 1.05, 0.01); // false
   * ```
   */
  public static isEqual(a: number, b: number, epsilon: number = MathUtils.EPSILON): boolean {
    return Math.abs(a - b) < epsilon
  }

  /**
   * 浮点近似为零判断
   *
   * 检查一个数值是否足够接近零，通过判断其绝对值是否小于给定精度阈值来确定。
   *
   * @param value - 待检查的数值
   * @param epsilon - 精度阈值，默认为 MathUtils.EPSILON
   * @returns 如果数值绝对值小于 epsilon 则返回 true，否则返回 false
   *
   * @example
   * ```ts
   * MathUtils.isZero(0.001); // true（默认 EPSILON = 0.01）
   * MathUtils.isZero(0.05);  // false
   * ```
   */
  public static isZero(value: number, epsilon: number = MathUtils.EPSILON): boolean {
    return Math.abs(value) < epsilon
  }

  /**
   * 计算标准化角度
   *
   * 根据给定的 x、y 坐标计算 atan2 角度，并将结果标准化到指定范围内。
   * 默认范围为 [0, 2π]，适用于需要将角度限制在特定区间的场景。
   *
   * @param x - 坐标的 x 分量
   * @param y - 坐标的 y 分量
   * @param range - 角度范围元组 [最小值, 最大值]，默认为 [0, 2π]
   * @returns 标准化后的角度（弧度）
   *
   * @example
   * ```ts
   * MathUtils.calculateAngle(1, 0);         // 0
   * MathUtils.calculateAngle(0, 1);         // Math.PI / 2
   * MathUtils.calculateAngle(-1, 0);        // Math.PI
   * MathUtils.calculateAngle(1, 1, [-Math.PI, Math.PI]); // Math.PI / 4
   * ```
   */
  public static calculateAngle(
    x: number,
    y: number,
    range: [number, number] = [0, MathUtils.TWO_PI],
  ): number {
    const angle = Math.atan2(y, x)
    const rangeNum = Math.abs(range[1] - range[0])
    const normalizedAngle = angle % rangeNum
    if (normalizedAngle < Math.min(...range)) {
      return normalizedAngle + rangeNum
    }
    return normalizedAngle
  }

  /**
   * 角度短弧插值
   *
   * 将角度差归一化到 [-π, π] 范围，确保走最短弧线路径进行线性插值。
   * 适用于旋转动画中避免绕远路的场景。
   *
   * @param from - 起始角度（弧度）
   * @param to - 目标角度（弧度）
   * @param t - 插值进度，范围 0~1（0 为起始角度，1 为目标角度）
   * @returns 插值后的角度（弧度）
   *
   * @example
   * ```ts
   * MathUtils.lerpAngle(0, Math.PI, 0.5);           // Math.PI / 2
   * MathUtils.lerpAngle(0.1, MathUtils.TWO_PI - 0.1, 0.5); // 走短弧，约为 0 或 2π 附近
   * ```
   */
  public static lerpAngle(from: number, to: number, t: number): number {
    let delta = to - from
    // O(1) 归一化到 [-π, π]，走短弧
    delta = ((((delta + Math.PI) % MathUtils.TWO_PI) + MathUtils.TWO_PI) % MathUtils.TWO_PI) - Math.PI
    return from + delta * t
  }

  /**
   * 判断角度是否在圆弧范围内
   *
   * 根据起始角度、结束角度和旋转方向，判断一个标准化角度是否位于指定圆弧覆盖的范围内。
   * 支持顺时针和逆时针两种方向，并正确处理跨越 0 度的情况。
   *
   * @param angle - 已标准化的角度，范围 [0, 2π)
   * @param startAngle - 圆弧起始角度
   * @param endAngle - 圆弧结束角度
   * @param clockwise - 是否为顺时针方向
   * @returns 如果角度在圆弧范围内返回 true，否则返回 false
   *
   * @example
   * ```ts
   * // 顺时针从 π 到 0，角度 π/2 在范围内
   * MathUtils.isAngleInArcRange(Math.PI / 2, Math.PI, 0, true); // true
   * // 逆时针从 0 到 π，角度 π/2 在范围内
   * MathUtils.isAngleInArcRange(Math.PI / 2, 0, Math.PI, false); // true
   * ```
   */
  public static isAngleInArcRange(
    angle: number,
    startAngle: number,
    endAngle: number,
    clockwise: boolean,
  ): boolean {
    if (clockwise) {
      // 顺时针：从 startAngle 到 endAngle（可能跨越0度）
      if (startAngle > endAngle) {
        return angle <= startAngle && angle >= endAngle
      } else {
        return angle <= startAngle || angle >= endAngle
      }
    } else {
      // 逆时针：从 startAngle 到 endAngle（可能跨越0度）
      if (startAngle < endAngle) {
        return angle >= startAngle && angle <= endAngle
      } else {
        return angle >= startAngle || angle <= endAngle
      }
    }
  }
  /**
   * 判断两个向量是否平行
   *
   * 通过叉积模长判断：若单位化后的叉积模长接近 0，则认为平行。
   * 若任一向量为零向量（模长接近 0），返回 false。
   *
   * @param a - 第一个向量
   * @param b - 第二个向量
   * @param tolerance - 容差，默认为 MathUtils.EPSILON
   * @returns 两向量平行返回 true，否则返回 false
   *
   * @example
   * ```ts
   * const v1 = new Vector3(2, 4, 0);
   * const v2 = new Vector3(1, 2, 0);
   * MathUtils.isParallel(v1, v2); // true
   * ```
   */
  public static isParallel(a: Vector3, b: Vector3, tolerance: number = MathUtils.EPSILON): boolean {
    if (a.length < MathUtils.FLOAT_EPSILON || b.length < MathUtils.FLOAT_EPSILON) return false
    const na = a.normalized
    const nb = b.normalized
    return na.cross(nb).length < tolerance
  }

  /**
   * 判断两个向量是否垂直
   *
   * 通过单位化后的点积判断：若点积绝对值接近 0，则认为垂直。
   * 若任一向量为零向量（模长接近 0），返回 false。
   *
   * @param a - 第一个向量
   * @param b - 第二个向量
   * @param tolerance - 容差，默认为 MathUtils.EPSILON
   * @returns 两向量垂直返回 true，否则返回 false
   *
   * @example
   * ```ts
   * const v1 = new Vector3(1, 0, 0);
   * const v2 = new Vector3(0, 3, 0);
   * MathUtils.isPerpendicular(v1, v2); // true
   * ```
   */
  public static isPerpendicular(a: Vector3, b: Vector3, tolerance: number = MathUtils.EPSILON): boolean {
    if (a.length < MathUtils.FLOAT_EPSILON || b.length < MathUtils.FLOAT_EPSILON) return false
    const na = a.normalized
    const nb = b.normalized
    return Math.abs(na.dot(nb)) < tolerance
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // ── 缓动函数（Easings） ────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════════

  /** 内置缓动函数集合 */
  public static readonly Easings = {
    /** 线性 */
    linear: ((t: number) => t) as EasingFunction,
    /** 二次方缓入 */
    easeInQuad: ((t: number) => t * t) as EasingFunction,
    /** 二次方缓出 */
    easeOutQuad: ((t: number) => t * (2 - t)) as EasingFunction,
    /** 二次方缓入缓出 */
    easeInOutQuad: ((t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t)) as EasingFunction,
    /** 三次方缓入 */
    easeInCubic: ((t: number) => t * t * t) as EasingFunction,
    /** 三次方缓出 */
    easeOutCubic: ((t: number) => {
      const t1 = t - 1
      return t1 * t1 * t1 + 1
    }) as EasingFunction,
    /** 三次方缓入缓出 */
    easeInOutCubic: ((t: number) =>
      t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1) as EasingFunction,
    /** 四次方缓入 */
    easeInQuart: ((t: number) => t * t * t * t) as EasingFunction,
    /** 四次方缓出 */
    easeOutQuart: ((t: number) => {
      const t1 = t - 1
      return 1 - t1 * t1 * t1 * t1
    }) as EasingFunction,
    /** 四次方缓入缓出 */
    easeInOutQuart: ((t: number) => {
      const t1 = t - 1
      return t < 0.5 ? 8 * t * t * t * t : 1 - 8 * t1 * t1 * t1 * t1
    }) as EasingFunction,
    /** 正弦缓入 */
    easeInSine: ((t: number) => 1 - Math.cos((t * Math.PI) / 2)) as EasingFunction,
    /** 正弦缓出 */
    easeOutSine: ((t: number) => Math.sin((t * Math.PI) / 2)) as EasingFunction,
    /** 正弦缓入缓出 */
    easeInOutSine: ((t: number) => -(Math.cos(Math.PI * t) - 1) / 2) as EasingFunction,
    /** 指数缓入 */
    easeInExpo: ((t: number) => (t === 0 ? 0 : Math.pow(2, 10 * (t - 1)))) as EasingFunction,
    /** 指数缓出 */
    easeOutExpo: ((t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t))) as EasingFunction,
    /** 指数缓入缓出 */
    easeInOutExpo: ((t: number) => {
      if (t === 0) return 0
      if (t === 1) return 1
      return t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2
    }) as EasingFunction,
    /** 回弹缓入 */
    easeInBack: ((t: number) => {
      const c = 1.70158
      return (c + 1) * t * t * t - c * t * t
    }) as EasingFunction,
    /** 回弹缓出 */
    easeOutBack: ((t: number) => {
      const c = 1.70158
      const t1 = t - 1
      return 1 + (c + 1) * t1 * t1 * t1 + c * t1 * t1
    }) as EasingFunction,
    /** 回弹缓入缓出 */
    easeInOutBack: ((t: number) => {
      const c = 1.70158 * 1.525
      return t < 0.5
        ? (Math.pow(2 * t, 2) * ((c + 1) * 2 * t - c)) / 2
        : (Math.pow(2 * t - 2, 2) * ((c + 1) * (t * 2 - 2) + c) + 2) / 2
    }) as EasingFunction,
  } as const

  /**
   * 创建三次贝塞尔缓动函数
   * 与 CSS cubic-bezier() 一致
   */
  public static cubicBezier(x1: number, y1: number, x2: number, y2: number): EasingFunction {
    const sampleCurveX = (t: number) => (((1 - 3 * x2 + 3 * x1) * t + (3 * x2 - 6 * x1)) * t + 3 * x1) * t
    const sampleCurveY = (t: number) => (((1 - 3 * y2 + 3 * y1) * t + (3 * y2 - 6 * y1)) * t + 3 * y1) * t
    const sampleCurveDerivativeX = (t: number) =>
      (3 * (1 - 3 * x2 + 3 * x1) * t + 2 * (3 * x2 - 6 * x1)) * t + 3 * x1

    function solveCurveX(x: number): number {
      let t = x
      for (let i = 0; i < 8; i++) {
        const currentX = sampleCurveX(t) - x
        if (Math.abs(currentX) < MathUtils.INTEGRATION_TOLERANCE) return t
        const derivative = sampleCurveDerivativeX(t)
        if (Math.abs(derivative) < MathUtils.INTEGRATION_TOLERANCE) break
        t -= currentX / derivative
      }
      let lo = 0,
        hi = 1
      t = x
      while (lo < hi) {
        const mid = sampleCurveX(t)
        if (Math.abs(mid - x) < MathUtils.INTEGRATION_TOLERANCE) return t
        if (x > mid) lo = t
        else hi = t
        t = (lo + hi) / 2
      }
      return t
    }

    return (x: number) => sampleCurveY(solveCurveX(x))
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // ── 插值器（Interpolators） ────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════════

  /** 数值插值器 */
  public static readonly numberInterpolator: Interpolator<number> = (from, to, progress) => {
    return from + (to - from) * progress
  }

  /** Matrix4 插值器（逐元素线性插值） */
  public static readonly matrix4Interpolator: Interpolator<Matrix4> = (from, to, progress) => {
    const fromData = from.transform
    const toData = to.transform
    const result = new Float32Array(16)
    for (let i = 0; i < 16; i++) {
      result[i] = fromData[i] + (toData[i] - fromData[i]) * progress
    }
    return new Matrix4(result)
  }

  /** 根据值类型自动选择插值器 */
  public static getInterpolator(value: AnimatableValue): Interpolator<any> {
    if (typeof value === 'number') {
      return MathUtils.numberInterpolator
    }
    if (value instanceof Matrix4) {
      return MathUtils.matrix4Interpolator
    }
    return MathUtils.numberInterpolator
  }

  /** 通用插值函数（双值） */
  public static interpolate(from: AnimatableValue, to: AnimatableValue, progress: number): AnimatableValue {
    const interpolator = MathUtils.getInterpolator(from)
    return interpolator(from, to, progress)
  }

  /**
   * 多关键帧分段插值
   * 根据 progress (0-1) 找到所在的关键帧段，进行局部插值
   */
  public static interpolateKeyframes(segments: ResolvedKeyframeSegment[], progress: number): AnimatableValue {
    if (segments.length === 0) {
      throw new Error('No keyframe segments provided')
    }

    if (progress <= segments[0].startOffset) {
      return segments[0].startValue
    }

    const lastSeg = segments[segments.length - 1]
    if (progress >= lastSeg.endOffset) {
      return lastSeg.endValue
    }

    for (const seg of segments) {
      if (progress >= seg.startOffset && progress <= seg.endOffset) {
        const segDuration = seg.endOffset - seg.startOffset
        if (segDuration === 0) return seg.endValue

        let localProgress = (progress - seg.startOffset) / segDuration
        if (seg.easing) {
          localProgress = seg.easing(localProgress)
        }
        return MathUtils.interpolate(seg.startValue, seg.endValue, localProgress)
      }
    }

    return lastSeg.endValue
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // ── TRS 工具（矩阵分解便捷方法） ──────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════════

  /** 从 Matrix4 中提取 2D 平移分量 */
  public static extractTranslation(m: Matrix4): { x: number; y: number } {
    return m.extractTranslation2D()
  }

  /** 从 Matrix4 中提取 Z 轴旋转角度（弧度） */
  public static extractRotationZ(m: Matrix4): number {
    return m.extractRotationZ()
  }
}

export default MathUtils
