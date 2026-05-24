import { GraphType } from '@/foundation/constants'
import Bezier from './Bezier'
import { Point3, Vector3 } from '@/foundation/math'
import { Style } from '@/foundation/style'
import { IQuadraticBezier } from '@/types'
import type { ISerializable } from '@/types'
import { generateId } from '@/foundation/utils'

/**
 * 二次贝塞尔曲线
 *
 * 由 3 个控制点定义的二次贝塞尔曲线：起点 P₀、控制点 P₁、终点 P₂。
 * 是最简单的贝塞尔曲线形式，控制点 P₁ 决定曲线的弯曲方向和程度。
 *
 * **核心公式：**
 * - 曲线上的点：`B(t) = (1-t)²P₀ + 2(1-t)tP₁ + t²P₂`，t ∈ [0, 1]
 * - 切线方向：`B'(t) = 2(1-t)(P₁-P₀) + 2t(P₂-P₁)`
 *
 * 二次贝塞尔曲线为开放路径（`isClosed = false`），除非起终点重合。
 *
 * @example
 * ```typescript
 * const quad = new QuadraticBezier(
 *   new Point3(0, 0, 0),     // 起点
 *   new Point3(50, 100, 0),  // 控制点（决定弯曲方向）
 *   new Point3(100, 0, 0),   // 终点
 * );
 * quad.getPointAt(0.5);       // 曲线中点
 * quad.getTangentAt(0.5);     // 中点处切线
 * quad.controlPoint;          // 控制点 P₁
 * ```
 */
export default class QuadraticBezier extends Bezier implements IQuadraticBezier, ISerializable {
  /**
   * 图形类型标识，固定为 `GraphType.QUADRATIC_BEZIER`
   */
  public type: GraphType = GraphType.QUADRATIC_BEZIER

  /**
   * 创建一条二次贝塞尔曲线
   *
   * @param startPoint - {Point3} 起点 P₀
   * @param controlPoint - {Point3} 控制点 P₁（决定弯曲方向和程度）
   * @param endPoint - {Point3} 终点 P₂
   * @param _style - {Style} 已废弃，保留参数以兼容旧调用方
   * @param id - {string | undefined} 可选的唯一标识符，未提供时自动生成
   *
   * @example
   * ```typescript
   * const quad = new QuadraticBezier(
   *   new Point3(0, 0, 0),
   *   new Point3(50, 100, 0),
   *   new Point3(100, 0, 0),
   * );
   * ```
   */
  constructor(
    startPoint: Point3,
    controlPoint: Point3,
    endPoint: Point3,
    _style?: Style,
    id?: string
  ) {
    super([startPoint, controlPoint, endPoint], _style, id)
    if (!id) this.id = generateId(this.type)
  }

  /**
   * 获取控制点 P₁（`controlPoints[1]`）
   *
   * 控制点 P₁ 决定二次贝塞尔曲线的弯曲方向和程度。
   * P₁ 与起点 P₀ 的连线是曲线在 P₀ 处的切线方向，
   * P₁ 与终点 P₂ 的连线是曲线在 P₂ 处的切线方向。
   *
   * @returns {Point3} 控制点 P₁
   *
   * @example
   * ```typescript
   * const quad = new QuadraticBezier(p0, p1, p2);
   * console.log(quad.controlPoint); // p1
   * ```
   */
  get controlPoint(): Point3 {
    return this.controlPoints[1]
  }

  /**
   * 设置控制点 P₁
   *
   * 修改控制点后不自动更新包围盒，如需更新请手动调用 `updateBounds()`。
   *
   * @param controlPoint - {Point3} 新的控制点坐标
   * @returns {QuadraticBezier} 返回 `this`，支持链式调用
   *
   * @example
   * ```typescript
   * quad.setQuadraticControlPoint(new Point3(80, 120, 0));
   * ```
   */
  setQuadraticControlPoint(controlPoint: Point3): QuadraticBezier {
    this.controlPoints[1] = controlPoint
    return this
  }

  /**
   * 计算二次贝塞尔曲线上的点
   *
   * 使用二次贝塞尔曲线公式：
   * `B(t) = (1-t)²P₀ + 2(1-t)tP₁ + t²P₂`
   *
   * 参数 t 会被裁剪到 [0, 1] 范围内。
   *
   * @param t - {number} 参数值，范围 `[0, 1]`，`0` 为起点，`1` 为终点
   * @returns {Point3} 参数 t 对应的曲线上的点
   *
   * @example
   * ```typescript
   * const quad = new QuadraticBezier(p0, p1, p2);
   * quad.getPointAt(0);   // P₀（起点）
   * quad.getPointAt(0.5); // 曲线中点
   * quad.getPointAt(1);   // P₂（终点）
   * ```
   */
  public getPointAt(t: number): Point3 {
    const clampedT = Math.max(0, Math.min(1, t))
    const start = this.controlPoints[0]
    const control = this.controlPoints[1]
    const end = this.controlPoints[2]

    // 二次贝塞尔曲线公式: B(t) = (1-t)²P₀ + 2(1-t)tP₁ + t²P₂
    const oneMinusT = 1 - clampedT
    const oneMinusTSquared = oneMinusT * oneMinusT
    const twoTOneMinusT = 2 * clampedT * oneMinusT
    const tSquared = clampedT * clampedT

    const x =
      oneMinusTSquared * start.x +
      twoTOneMinusT * control.x +
      tSquared * end.x
    const y =
      oneMinusTSquared * start.y +
      twoTOneMinusT * control.y +
      tSquared * end.y
    const z =
      oneMinusTSquared * start.z +
      twoTOneMinusT * control.z +
      tSquared * end.z

    return new Point3(x, y, z)
  }

  /**
   * 计算二次贝塞尔曲线的切线方向
   *
   * 使用二次贝塞尔曲线切线公式：
   * `B'(t) = 2(1-t)(P₁-P₀) + 2t(P₂-P₁)`
   *
   * 返回的切线向量未归一化。
   *
   * @param t - {number} 参数值，范围 `[0, 1]`
   * @returns {Vector3} 切线方向向量（未归一化）
   *
   * @example
   * ```typescript
   * const quad = new QuadraticBezier(p0, p1, p2);
   * const tangent = quad.getTangentAt(0.5);
   * ```
   */
  public getTangentAt(t: number): Vector3 {
    const clampedT = Math.max(0, Math.min(1, t))
    const start = this.controlPoints[0]
    const control = this.controlPoints[1]
    const end = this.controlPoints[2]

    // 切线公式: B'(t) = 2(1-t)(P₁-P₀) + 2t(P₂-P₁)
    const oneMinusT = 1 - clampedT
    const dx =
      2 * oneMinusT * (control.x - start.x) +
      2 * clampedT * (end.x - control.x)
    const dy =
      2 * oneMinusT * (control.y - start.y) +
      2 * clampedT * (end.y - control.y)
    const dz =
      2 * oneMinusT * (control.z - start.z) +
      2 * clampedT * (end.z - control.z)

    return new Vector3(dx, dy, dz)
  }

  // ── 序列化 ──

  /**
   * 将二次贝塞尔曲线序列化为 JSON 对象
   *
   * 输出结构包含 `id`、`type`、`controlPoints`（每个点序列化为对象）和 `style`。
   *
   * @returns {{ id: string; type: GraphType; controlPoints: any[]; style: any }}
   *   可 JSON 化的纯对象
   *
   * @example
   * ```typescript
   * const json = quad.toJSON();
   * // { id: 'quadratic_xxx', type: 5, controlPoints: [...], style: {...} }
   * ```
   */
  toJSON(): any {
    return {
      id: this.id,
      type: this.type,
      controlPoints: this.controlPoints.map(p => p.toJSON()),
    }
  }

  /**
   * 从 JSON 对象反序列化创建二次贝塞尔曲线实例
   *
   * @param data - {any} 序列化数据对象，需包含 `controlPoints`（3 个点）、
   *   `style` 和可选的 `id`
   * @returns {QuadraticBezier} 还原后的二次贝塞尔曲线实例
   *
   * @example
   * ```typescript
   * const quad = QuadraticBezier.fromJSON({
   *   id: 'quadratic_abc',
   *   type: GraphType.QUADRATIC_BEZIER,
   *   controlPoints: [{ x: 0, y: 0, z: 0 }, { x: 50, y: 100, z: 0 }, { x: 100, y: 0, z: 0 }],
   *   style: { strokeColor: '#000' },
   * });
   * ```
   */
  static fromJSON(data: any): QuadraticBezier {
    const points = data.controlPoints.map((p: any) => Point3.fromJSON(p));
    const qb = new QuadraticBezier(points[0], points[1], points[2]);
    qb.id = data.id;
    return qb;
  }

  /**
   * 复制二次贝塞尔曲线
   *
   * 创建当前曲线的深拷贝，包括所有控制点和样式的独立副本。
   *
   * @returns {this} 当前曲线的深拷贝实例
   *
   * @example
   * ```typescript
   * const copied = quad.copy();
   * copied.setQuadraticControlPoint(new Point3(0, 0, 0)); // 不影响原曲线
   * ```
   */
  public copy(): this {
    return new QuadraticBezier(
      this.controlPoints[0].copy(),
      this.controlPoints[1].copy(),
      this.controlPoints[2].copy()
    ) as this
  }

}
