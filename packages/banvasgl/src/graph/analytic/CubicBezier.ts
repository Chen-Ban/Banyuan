import { GraphType } from "@/foundation/constants";
import Bezier from "./Bezier";
import { MathUtils, Point3, Vector3 } from "@/foundation/math";
import { Style } from "@/foundation/style";
import type { ICubicBezier } from '@/types/graph/graph'
import type { ISerializable } from '@/types/foundation/serializable'
import { generateId } from "@/foundation/utils";

/**
 * 三次贝塞尔曲线
 *
 * 由 4 个控制点定义的三次贝塞尔曲线：起点 P₀、控制点1 P₁、控制点2 P₂、终点 P₃。
 * 是图形设计中最常用的贝塞尔曲线形式，两个控制点分别影响曲线的两段弯曲。
 *
 * **核心公式：**
 * - 曲线上的点：`B(t) = (1-t)³P₀ + 3(1-t)²tP₁ + 3(1-t)t²P₂ + t³P₃`，t ∈ [0, 1]
 * - 切线方向：`B'(t) = 3(1-t)²(P₁-P₀) + 6(1-t)t(P₂-P₁) + 3t²(P₃-P₂)`
 *
 * **拐点计算：**
 * 拐点出现在二阶导数为 0 的位置，通过求解 `B''(t) = 0` 得到候选 t 值。
 * 三次贝塞尔曲线最多有 2 个拐点。
 *
 * 三次贝塞尔曲线为开放路径（`isClosed = false`），除非起终点重合。
 *
 * @example
 * ```typescript
 * const cubic = new CubicBezier(
 *   new Point3(0, 0, 0),     // 起点 P₀
 *   new Point3(30, 100, 0),  // 控制点1 P₁（影响前半段弯曲）
 *   new Point3(70, 100, 0),  // 控制点2 P₂（影响后半段弯曲）
 *   new Point3(100, 0, 0),   // 终点 P₃
 * );
 * cubic.getPointAt(0.5);       // 曲线中点
 * cubic.getTangentAt(0.5);     // 中点处切线
 * cubic.controlPoint1;         // 控制点 P₁
 * cubic.controlPoint2;         // 控制点 P₂
 * cubic.getInflectionPoints(); // 拐点列表
 * ```
 */
export default class CubicBezier
  extends Bezier
  implements ICubicBezier, ISerializable
{
  /**
   * 图形类型标识，固定为 `GraphType.CUBIC_BEZIER`
   */
  public type: GraphType = GraphType.CUBIC_BEZIER;

  /**
   * 创建一条三次贝塞尔曲线
   *
   * @param startPoint - {Point3} 起点 P₀
   * @param controlPoint1 - {Point3} 控制点1 P₁（影响前半段弯曲方向）
   * @param controlPoint2 - {Point3} 控制点2 P₂（影响后半段弯曲方向）
   * @param endPoint - {Point3} 终点 P₃
   * @param _style - {Style} 已废弃，保留参数以兼容旧调用方
   * @param id - {string | undefined} 可选的唯一标识符，未提供时自动生成
   *
   * @example
   * ```typescript
   * const cubic = new CubicBezier(
   *   new Point3(0, 0, 0),
   *   new Point3(30, 100, 0),
   *   new Point3(70, 100, 0),
   *   new Point3(100, 0, 0),
   * );
   * ```
   */
  constructor(
    startPoint: Point3,
    controlPoint1: Point3,
    controlPoint2: Point3,
    endPoint: Point3,
    _style?: Style,
    id?: string,
  ) {
    super([startPoint, controlPoint1, controlPoint2, endPoint], _style, id);
    if (!id) this.id = generateId(this.type);
  }

  /**
   * 获取控制点1 P₁（`controlPoints[1]`）
   *
   * P₁ 与起点 P₀ 的连线是曲线在 P₀ 处的切线方向。
   * P₁ 影响曲线前半段的弯曲方向和程度。
   *
   * @returns {Point3} 控制点1 P₁
   *
   * @example
   * ```typescript
   * const cubic = new CubicBezier(p0, p1, p2, p3);
   * console.log(cubic.controlPoint1); // p1
   * ```
   */
  get controlPoint1(): Point3 {
    return this.controlPoints[1];
  }

  /**
   * 获取控制点2 P₂（`controlPoints[2]`）
   *
   * P₂ 与终点 P₃ 的连线是曲线在 P₃ 处的切线方向。
   * P₂ 影响曲线后半段的弯曲方向和程度。
   *
   * @returns {Point3} 控制点2 P₂
   *
   * @example
   * ```typescript
   * const cubic = new CubicBezier(p0, p1, p2, p3);
   * console.log(cubic.controlPoint2); // p2
   * ```
   */
  get controlPoint2(): Point3 {
    return this.controlPoints[2];
  }

  /**
   * 设置控制点1 P₁
   *
   * 修改控制点1后不自动更新包围盒，如需更新请手动调用 `updateBounds()`。
   *
   * @param controlPoint1 - {Point3} 新的控制点1坐标
   * @returns {CubicBezier} 返回 `this`，支持链式调用
   *
   * @example
   * ```typescript
   * cubic.setControlPoint1(new Point3(50, 120, 0));
   * ```
   */
  setControlPoint1(controlPoint1: Point3): CubicBezier {
    this.controlPoints[1] = controlPoint1;
    return this;
  }

  /**
   * 设置控制点2 P₂
   *
   * 修改控制点2后不自动更新包围盒，如需更新请手动调用 `updateBounds()`。
   *
   * @param controlPoint2 - {Point3} 新的控制点2坐标
   * @returns {CubicBezier} 返回 `this`，支持链式调用
   *
   * @example
   * ```typescript
   * cubic.setControlPoint2(new Point3(80, 120, 0));
   * ```
   */
  setControlPoint2(controlPoint2: Point3): CubicBezier {
    this.controlPoints[2] = controlPoint2;
    return this;
  }

  /**
   * 设置指定索引的控制点（重写基类方法）
   *
   * 修改后自动重新计算包围盒。索引越界时不执行任何操作。
   *
   * @param index - {number} 控制点索引（0=起点，1=控制点1，2=控制点2，3=终点）
   * @param point - {Point3} 新的控制点位置（内部会复制一份）
   *
   * @example
   * ```typescript
   * cubic.setControlPoint(1, new Point3(50, 50, 0)); // 设置控制点1
   * cubic.setControlPoint(2, new Point3(80, 50, 0)); // 设置控制点2
   * ```
   */
  public override setControlPoint(index: number, point: Point3): void {
    if (index >= 0 && index < this.controlPoints.length) {
      this.controlPoints[index] = point.copy();
    }
    this.bounds = this.updateBounds();
  }

  /**
   * 计算三次贝塞尔曲线上的点
   *
   * 使用三次贝塞尔曲线公式：
   * `B(t) = (1-t)³P₀ + 3(1-t)²tP₁ + 3(1-t)t²P₂ + t³P₃`
   *
   * 参数 t 会被裁剪到 [0, 1] 范围内。
   *
   * @param t - {number} 参数值，范围 `[0, 1]`，`0` 为起点，`1` 为终点
   * @returns {Point3} 参数 t 对应的曲线上的点
   *
   * @example
   * ```typescript
   * const cubic = new CubicBezier(p0, p1, p2, p3);
   * cubic.getPointAt(0);   // P₀（起点）
   * cubic.getPointAt(0.5); // 曲线中点
   * cubic.getPointAt(1);   // P₃（终点）
   * ```
   */
  public getPointAt(t: number): Point3 {
    const clampedT = Math.max(0, Math.min(1, t));
    const start = this.controlPoints[0];
    const control1 = this.controlPoints[1];
    const control2 = this.controlPoints[2];
    const end = this.controlPoints[3];

    // 三次贝塞尔曲线公式: B(t) = (1-t)³P₀ + 3(1-t)²tP₁ + 3(1-t)t²P₂ + t³P₃
    const oneMinusT = 1 - clampedT;
    const oneMinusTCubed = oneMinusT * oneMinusT * oneMinusT;
    const threeOneMinusTSquaredT = 3 * oneMinusT * oneMinusT * clampedT;
    const threeOneMinusTTsquared = 3 * oneMinusT * clampedT * clampedT;
    const tCubed = clampedT * clampedT * clampedT;

    const x =
      oneMinusTCubed * start.x +
      threeOneMinusTSquaredT * control1.x +
      threeOneMinusTTsquared * control2.x +
      tCubed * end.x;
    const y =
      oneMinusTCubed * start.y +
      threeOneMinusTSquaredT * control1.y +
      threeOneMinusTTsquared * control2.y +
      tCubed * end.y;
    const z =
      oneMinusTCubed * start.z +
      threeOneMinusTSquaredT * control1.z +
      threeOneMinusTTsquared * control2.z +
      tCubed * end.z;

    return new Point3(x, y, z);
  }

  /**
   * 计算三次贝塞尔曲线的切线方向
   *
   * 使用三次贝塞尔曲线切线公式：
   * `B'(t) = 3(1-t)²(P₁-P₀) + 6(1-t)t(P₂-P₁) + 3t²(P₃-P₂)`
   *
   * 返回的切线向量未归一化。
   *
   * @param t - {number} 参数值，范围 `[0, 1]`
   * @returns {Vector3} 切线方向向量（未归一化）
   *
   * @example
   * ```typescript
   * const cubic = new CubicBezier(p0, p1, p2, p3);
   * const tangent = cubic.getTangentAt(0.5);
   * ```
   */
  public getTangentAt(t: number): Vector3 {
    const clampedT = Math.max(0, Math.min(1, t));
    const start = this.controlPoints[0];
    const control1 = this.controlPoints[1];
    const control2 = this.controlPoints[2];
    const end = this.controlPoints[3];

    // 切线公式: B'(t) = 3(1-t)²(P₁-P₀) + 6(1-t)t(P₂-P₁) + 3t²(P₃-P₂)
    const oneMinusT = 1 - clampedT;
    const threeOneMinusTSquared = 3 * oneMinusT * oneMinusT;
    const sixOneMinusTT = 6 * oneMinusT * clampedT;
    const threeTSquared = 3 * clampedT * clampedT;

    const dx =
      threeOneMinusTSquared * (control1.x - start.x) +
      sixOneMinusTT * (control2.x - control1.x) +
      threeTSquared * (end.x - control2.x);
    const dy =
      threeOneMinusTSquared * (control1.y - start.y) +
      sixOneMinusTT * (control2.y - control1.y) +
      threeTSquared * (end.y - control2.y);
    const dz =
      threeOneMinusTSquared * (control1.z - start.z) +
      sixOneMinusTT * (control2.z - control1.z) +
      threeTSquared * (end.z - control2.z);

    return new Vector3(dx, dy, dz);
  }

  /**
   * 计算三次贝塞尔曲线的拐点（二阶导数为 0 的点）
   *
   * 拐点是曲率方向发生改变的点，即二阶导数 `B''(t) = 0` 的位置。
   * 三次贝塞尔曲线最多有 2 个拐点。
   *
   * 计算方法：将 x 分量的二阶导数展开为关于 t 的二次/三次方程，
   * 求解判别式判断实根个数，只保留 t ∈ [0, 1] 范围内的有效根，
   * 然后通过 `getPointAt(t)` 计算对应的曲线点。
   *
   * @returns {Point3[]} 拐点数组，最多 2 个点
   *
   * @example
   * ```typescript
   * const cubic = new CubicBezier(
   *   new Point3(0, 0, 0),
   *   new Point3(30, 100, 0),
   *   new Point3(70, -50, 0),
   *   new Point3(100, 0, 0),
   * );
   * const inflections = cubic.getInflectionPoints();
   * // 可能有 0~2 个拐点
   * ```
   */
  getInflectionPoints(): Point3[] {
    const start = this.controlPoints[0];
    const control1 = this.controlPoints[1];
    const control2 = this.controlPoints[2];
    const end = this.controlPoints[3];

    // 计算拐点的t值
    // 拐点出现在二阶导数为0的地方
    const a = end.x - 3 * control2.x + 3 * control1.x - start.x;
    const b = 3 * (control2.x - 2 * control1.x + start.x);
    const c = 3 * (control1.x - start.x);

    const inflectionPoints: Point3[] = [];

    if (Math.abs(a) < MathUtils.FLOAT_EPSILON) {
      // 二次方程情况
      if (Math.abs(b) > MathUtils.FLOAT_EPSILON) {
        const t = -c / b;
        if (t >= 0 && t <= 1) {
          inflectionPoints.push(this.getPointAt(t));
        }
      }
    } else {
      // 三次方程情况
      const discriminant = b * b - 4 * a * c;
      if (discriminant >= 0) {
        const sqrtDiscriminant = Math.sqrt(discriminant);
        const t1 = (-b + sqrtDiscriminant) / (2 * a);
        const t2 = (-b - sqrtDiscriminant) / (2 * a);

        if (t1 >= 0 && t1 <= 1) {
          inflectionPoints.push(this.getPointAt(t1));
        }
        if (t2 >= 0 && t2 <= 1) {
          inflectionPoints.push(this.getPointAt(t2));
        }
      }
    }

    return inflectionPoints;
  }

  // ── 序列化 ──

  /**
   * 将三次贝塞尔曲线序列化为 JSON 对象
   *
   * 输出结构包含 `id`、`type`、`controlPoints`（4 个点的序列化数组）和 `style`。
   *
   * @returns {{ id: string; type: GraphType; controlPoints: any[]; style: any }}
   *   可 JSON 化的纯对象
   *
   * @example
   * ```typescript
   * const json = cubic.toJSON();
   * // { id: 'cubic_xxx', type: 6, controlPoints: [...], style: {...} }
   * ```
   */
  toJSON(): any {
    return {
      id: this.id,
      type: this.type,
      controlPoints: this.controlPoints.map((p) => p.toJSON()),
    };
  }

  /**
   * 从 JSON 对象反序列化创建三次贝塞尔曲线实例
   *
   * @param data - {any} 序列化数据对象，需包含 `controlPoints`（4 个点）、
   *   `style` 和可选的 `id`
   * @returns {CubicBezier} 还原后的三次贝塞尔曲线实例
   *
   * @example
   * ```typescript
   * const cubic = CubicBezier.fromJSON({
   *   id: 'cubic_abc',
   *   type: GraphType.CUBIC_BEZIER,
   *   controlPoints: [
   *     { x: 0, y: 0, z: 0 },
   *     { x: 30, y: 100, z: 0 },
   *     { x: 70, y: 100, z: 0 },
   *     { x: 100, y: 0, z: 0 },
   *   ],
   *   style: { strokeColor: '#000' },
   * });
   * ```
   */
  static fromJSON(data: any): CubicBezier {
    const points = data.controlPoints.map((p: any) => Point3.fromJSON(p));
    const cb = new CubicBezier(
      points[0],
      points[1],
      points[2],
      points[3],
    );
    cb.id = data.id;
    return cb;
  }

  /**
   * 复制三次贝塞尔曲线
   *
   * 创建当前曲线的深拷贝，包括所有控制点和样式的独立副本。
   *
   * @returns {this} 当前曲线的深拷贝实例
   *
   * @example
   * ```typescript
   * const copied = cubic.copy();
   * copied.setControlPoint1(new Point3(0, 0, 0)); // 不影响原曲线
   * ```
   */
  public copy(): this {
    return new CubicBezier(
      this.controlPoints[0].copy(),
      this.controlPoints[1].copy(),
      this.controlPoints[2].copy(),
      this.controlPoints[3].copy(),
    ) as this;
  }
}
