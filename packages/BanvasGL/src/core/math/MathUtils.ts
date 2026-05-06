/**
 * 数学工具类
 * 提供线性代数、数值分析、几何计算等工具函数
 */
export class MathUtils {
  /**
   * 数值精度常量
   */
  public static readonly EPSILON = 1e-2;
  public static readonly PI = Math.PI;
  public static readonly TWO_PI = 2 * Math.PI;
  public static readonly HALF_PI = Math.PI / 2;

  /**
   * 检查两个数是否相等（考虑浮点精度）
   */
  public static isEqual(a: number, b: number, epsilon: number = MathUtils.EPSILON): boolean {
    return Math.abs(a - b) < epsilon;
  }

  /**
   * 检查数是否为零
   */
  public static isZero(value: number, epsilon: number = MathUtils.EPSILON): boolean {
    return Math.abs(value) < epsilon;
  }

  /**
   * 计算角度
   * @param x
   * @param y
   * @param range 角度范围，默认为[0,2π]
   * @returns 标准化后的角度
   */
  public static calculateAngle(x: number, y: number, range: [number, number] = [0, MathUtils.TWO_PI]): number {
    const angle = Math.atan2(y, x);
    const rangeNum = Math.abs(range[1] - range[0]);
    const normalizedAngle = angle % rangeNum;
    if (normalizedAngle < Math.min(...range)) {
      return normalizedAngle + rangeNum;
    }
    return normalizedAngle;
  }

  /**
   * 角度短弧插值
   *
   * 将角度差归一化到 [-π, π] 范围，确保走最短弧线路径。
   *
   * @param from 起始角度（弧度）
   * @param to 目标角度（弧度）
   * @param t 进度 0-1
   */
  public static lerpAngle(from: number, to: number, t: number): number {
    let delta = to - from
    // O(1) 归一化到 [-π, π]，走短弧
    delta = ((delta + Math.PI) % MathUtils.TWO_PI + MathUtils.TWO_PI) % MathUtils.TWO_PI - Math.PI
    return from + delta * t
  }

  /**
   * 判断角度是否在圆弧范围内
   * @param angle 已标准化的角度 [0, 2π)
   * @param startAngle 起始角度
   * @param endAngle 结束角度
   * @param clockwise 是否顺时针
   * @returns 如果角度在圆弧范围内返回true，否则返回false
   */
  public static isAngleInArcRange(angle: number, startAngle: number, endAngle: number, clockwise: boolean): boolean {
    if (clockwise) {
      // 顺时针：从 startAngle 到 endAngle（可能跨越0度）
      if (startAngle > endAngle) {
        return angle <= startAngle && angle >= endAngle;
      } else {
        return angle <= startAngle || angle >= endAngle;
      }
    } else {
      // 逆时针：从 startAngle 到 endAngle（可能跨越0度）
      if (startAngle < endAngle) {
        return angle >= startAngle && angle <= endAngle;
      } else {
        return angle >= startAngle || angle <= endAngle;
      }
    }
  }
}

export default MathUtils;
