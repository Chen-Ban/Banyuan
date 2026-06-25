import { GraphType } from "@/foundation/constants";
import Graph from "@/graph/base/Graph";
import { MathUtils, Point3, Vector3, Matrix4 } from "@/foundation/math";
import Style from "@/foundation/style/Style";
import Bounds from "@/graph/base/Bounds";
import { Line } from "@/graph/analytic";
import type { IDenseTrajectory } from '@/types/graph/graph'
import type { ISerializable } from '@/types/foundation/serializable'
import type { IDrawingContext } from '@/types/platform/context.js'
import type { ITransferable, TransferableData } from '@/types/foundation/transferable'
import { generateId } from "@/foundation/utils";

/**
 * 密集轨迹类。
 *
 * DenseTrajectory 继承自 {@link Graph}，实现 {@link IDenseTrajectory}、{@link ISerializable} 和 {@link ITransferable} 接口，
 * 用于表示由大量离散点组成的折线轨迹。
 *
 * **存储格式**：控制点使用 `Float32Array` 存储，每 **3 个连续分量** 表示一个三维点 `(x, y, z)`，
 * 因此 `controlPoints.length / 3` 即为点的数量。这种紧凑存储格式在 Web Worker 传输时可实现零拷贝。
 *
 * **参数化路径**：
 * - {@link getPointAt}：线性插值，将归一化参数 `t ∈ [0, 1]` 映射到轨迹上的点
 * - {@link getTangentAt}：相邻点差分计算切线向量
 * - {@link getClosestPoint}：逐段遍历的暴力最近点算法
 * - {@link getLength}：逐段累加欧几里得距离
 *
 * **零拷贝传输**：{@link toTransferable} 提取 `Float32Array` 的底层 `ArrayBuffer`，
 * 传输后当前实例的 `controlPoints` 被 detach（不可用）；
 * Worker 处理完毕后通过 {@link fromTransferable} 在传入的 `ArrayBuffer` 上直接创建视图，
 * 绕过构造函数的 `Float32Array.from()` 拷贝，实现真正的零拷贝。
 *
 * @extends Graph
 * @implements IDenseTrajectory
 * @implements ISerializable
 * @implements ITransferable
 *
 * @example
 * ```ts
 * const points = new Float32Array([0, 0, 0, 100, 0, 0, 100, 100, 0]);
 * const traj = new DenseTrajectory(points);
 * traj.getPointAt(0.5);  // 中间点附近
 * traj.getLength(0, 1);  // 总长度 ≈ 200
 * ```
 */
export default class DenseTrajectory
  extends Graph
  implements IDenseTrajectory, ISerializable, ITransferable
{
  /** 图形类型标识 */
  public type: GraphType = GraphType.DENSETRAJECTORY;
  /**
   * 控制点数组。使用 `Float32Array` 存储，每 3 个连续分量表示一个三维点 `(x, y, z)`。
   * 点的数量 = `controlPoints.length / 3`。
   */
  public controlPoints: Float32Array;
  /** 元素包围盒 */
  public bounds: Bounds;

  /**
   * 创建密集轨迹实例。
   *
   * 使用 `Float32Array.from()` 对传入的点数组进行拷贝，确保内部数据独立。
   * 构造时自动计算包围盒和生成唯一 ID。
   *
   * @param {Float32Array} points - 轨迹点数组，每 3 个分量表示一个点 `(x, y, z)`
   * @param {Style} [style=Style.DEFAULT] - 元素样式
   *
   * @example
   * ```ts
   * const points = new Float32Array([0, 0, 0, 100, 50, 0, 200, 0, 0]);
   * const traj = new DenseTrajectory(points);
   * ```
   */
  constructor(points: Float32Array, _style?: Style) {
    super();
    this.controlPoints = Float32Array.from(points);
    this.bounds = this.updateBounds();
    this.id = generateId(this.type);
  }

  /**
   * 判断轨迹是否闭合。
   *
   * 当轨迹至少有 2 个点（6 个分量），且第一个点和最后一个点坐标完全相同时，视为闭合。
   *
   * @returns {boolean} 闭合时返回 `true`，否则返回 `false`
   *
   * @example
   * ```ts
   * const open = new DenseTrajectory(new Float32Array([0,0,0, 100,0,0]));
   * open.isClosed(); // false
   *
   * const closed = new DenseTrajectory(new Float32Array([0,0,0, 100,0,0, 0,0,0]));
   * closed.isClosed(); // true
   * ```
   */
  public isClosed(): boolean {
    const pts = this.controlPoints;
    if (pts.length < 6) return false; // 至少两个点（每点3分量）
    const lastIdx = pts.length - 3;
    return pts[0] === pts[lastIdx] && pts[1] === pts[lastIdx + 1] && pts[2] === pts[lastIdx + 2];
  }

  /**
   * 将密集轨迹的渲染路径绘制到 Canvas 上下文中。
   *
   * 使用 `moveTo` 到第一个点，然后依次 `lineTo` 到后续各点。
   * 当 `dependent` 为 `true` 时先调用 `ctx.beginPath()`。
   *
   * @param {IDrawingContext} ctx - Canvas 2D 渲染上下文
   * @param {Boolean} dependent - 是否开启新路径
   *
   * @example
   * ```ts
   * traj.renderPath(ctx, true);
   * ctx.stroke();
   * ```
   */
  public renderPath(ctx: IDrawingContext, dependent: Boolean): void {
    dependent && ctx.beginPath();
    ctx.moveTo(this.controlPoints[0], this.controlPoints[1]);
    const length = this.controlPoints.length / 3;
    for (let i = 1; i < length; i++) {
      ctx.lineTo(this.controlPoints[i * 3], this.controlPoints[i * 3 + 1]);
    }
  }

  /**
   * 渲染密集轨迹到 Canvas。
   *
   * 应用样式后调用 {@link renderPath} 绘制路径，然后描边。
   *
   * @param {IDrawingContext} ctx - Canvas 2D 渲染上下文
   *
   * @example
   * ```ts
   * traj.render(ctx);
   * ```
   */
  public render(ctx: IDrawingContext, style: Style): void {
    ctx.save();
    style.applyToContext(ctx, Math.abs(this.bounds.width), Math.abs(this.bounds.height));
    this.renderPath(ctx, true);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * 复制密集轨迹。
   *
   * 创建一个新的 {@link DenseTrajectory} 实例，使用 `Float32Array.from()` 拷贝控制点数组，
   * 同时拷贝样式。
   *
   * @returns {this} 新的密集轨迹实例
   *
   * @example
   * ```ts
   * const copy = traj.copy();
   * ```
   */
  public copy(): this {
    return new DenseTrajectory(
      Float32Array.from(this.controlPoints),
    ) as this;
  }

  /**
   * 更新密集轨迹的包围盒。
   *
   * 遍历所有控制点（每 3 个分量一个点），构造 {@link Point3} 数组，
   * 然后通过 {@link Bounds.fromPoints} 计算包围盒。
   *
   * @returns {Bounds} 更新后的包围盒
   *
   * @example
   * ```ts
   * const bounds = traj.updateBounds();
   * bounds.width;  // x 范围
   * bounds.height; // y 范围
   * ```
   */
  public updateBounds(): Bounds {
    let points = [];
    const length = this.controlPoints.length;
    for (let i = 0; i < length - 2; i += 3) {
      points.push(
        new Point3(
          this.controlPoints[i],
          this.controlPoints[i + 1],
          this.controlPoints[i + 2],
        ),
      );
    }
    return Bounds.fromPoints(points);
  }

  /**
   * 判断给定点是否在曲线上。密集轨迹暂不支持曲线判定，始终返回 `false`。
   *
   * @param {Point3} p - 待检测的点
   * @param {number} [tolerance=MathUtils.EPSILON] - 容差距离
   * @returns {boolean} 始终返回 `false`
   *
   * @example
   * ```ts
   * traj.isPointOnCurve(new Point3(50, 0, 0)); // false
   * ```
   */
  public isPointOnCurve(_p: Point3, _tolerance: number = MathUtils.EPSILON): boolean {
    return false;
  }

  /**
   * 获取轨迹上指定参数 `t` 处的点（线性插值）。
   *
   * 将归一化参数 `t ∈ [0, 1]` 映射到轨迹点序列上的连续索引，
   * 取相邻两点的整数索引 `i` 和 `i+1`，按小数部分 `fraction` 进行线性插值。
   *
   * - 0 个点时返回原点
   * - 1 个点时返回该点
   * - `t` 会被 clamp 到 `[0, 1]`
   *
   * @param {number} t - 归一化参数，范围 `[0, 1]`
   * @returns {Point3} 插值后的三维点
   *
   * @example
   * ```ts
   * const pts = new Float32Array([0,0,0, 100,0,0, 100,100,0]);
   * const traj = new DenseTrajectory(pts);
   * traj.getPointAt(0);    // Point3(0, 0, 0)
   * traj.getPointAt(0.5);  // Point3(100, 0, 0)  — 中间点
   * traj.getPointAt(1);    // Point3(100, 100, 0) — 最后一个点
   * ```
   */
  public getPointAt(t: number): Point3 {
    const pointCount = this.controlPoints.length / 3;
    if (pointCount === 0) return new Point3(0, 0, 0);
    if (pointCount === 1) {
      return new Point3(
        this.controlPoints[0],
        this.controlPoints[1],
        this.controlPoints[2],
      );
    }

    const clampedT = Math.max(0, Math.min(1, t));
    const index = clampedT * (pointCount - 1);
    const i = Math.floor(index);
    const fraction = index - i;

    if (i >= pointCount - 1) {
      const lastIdx = (pointCount - 1) * 3;
      return new Point3(
        this.controlPoints[lastIdx],
        this.controlPoints[lastIdx + 1],
        this.controlPoints[lastIdx + 2],
      );
    }

    const idx1 = i * 3;
    const idx2 = (i + 1) * 3;
    return new Point3(
      this.controlPoints[idx1] +
        fraction * (this.controlPoints[idx2] - this.controlPoints[idx1]),
      this.controlPoints[idx1 + 1] +
        fraction *
          (this.controlPoints[idx2 + 1] - this.controlPoints[idx1 + 1]),
      this.controlPoints[idx1 + 2] +
        fraction *
          (this.controlPoints[idx2 + 2] - this.controlPoints[idx1 + 2]),
    );
  }

  /**
   * 获取轨迹上指定参数 `t` 处的切线向量（相邻点差分）。
   *
   * 计算参数 `t` 所在段的相邻两点 `(p[i], p[i+1])`，切线 = `p[i+1] - p[i]`。
   * 末尾段使用倒数第二段到最后一段的差分。
   *
   * - 少于 2 个点时返回 `(1, 0, 0)`
   *
   * @param {number} t - 归一化参数，范围 `[0, 1]`
   * @returns {Vector3} 差分切线向量（未归一化）
   *
   * @example
   * ```ts
   * const pts = new Float32Array([0,0,0, 100,0,0, 100,100,0]);
   * const traj = new DenseTrajectory(pts);
   * traj.getTangentAt(0);   // Vector3(100, 0, 0)  — 第一段向右
   * traj.getTangentAt(0.5); // Vector3(0, 100, 0)   — 第二段向下
   * ```
   */
  public getTangentAt(t: number): Vector3 {
    const pointCount = this.controlPoints.length / 3;
    if (pointCount < 2) return new Vector3(1, 0, 0);

    const clampedT = Math.max(0, Math.min(1, t));
    const index = clampedT * (pointCount - 1);
    const i = Math.floor(index);

    if (i >= pointCount - 1) {
      const idx1 = (pointCount - 2) * 3;
      const idx2 = (pointCount - 1) * 3;
      return new Vector3(
        this.controlPoints[idx2] - this.controlPoints[idx1],
        this.controlPoints[idx2 + 1] - this.controlPoints[idx1 + 1],
        this.controlPoints[idx2 + 2] - this.controlPoints[idx1 + 2],
      );
    }

    const idx1 = i * 3;
    const idx2 = (i + 1) * 3;
    return new Vector3(
      this.controlPoints[idx2] - this.controlPoints[idx1],
      this.controlPoints[idx2 + 1] - this.controlPoints[idx1 + 1],
      this.controlPoints[idx2 + 2] - this.controlPoints[idx1 + 2],
    );
  }

  /**
   * 获取轨迹上指定参数 `t` 处的法向量。
   *
   * 由切线向量逆时针旋转 90° 得到：`normal = (-tangent.y, tangent.x, 0)`。
   *
   * @param {number} t - 归一化参数，范围 `[0, 1]`
   * @returns {Vector3} 法向量
   *
   * @example
   * ```ts
   * const pts = new Float32Array([0,0,0, 100,0,0]);
   * const traj = new DenseTrajectory(pts);
   * traj.getNormalAt(0); // Vector3(0, 100, 0) — 切线(100,0,0)的逆时针90°
   * ```
   */
  public getNormalAt(t: number): Vector3 {
    const tangent = this.getTangentAt(t);
    return new Vector3(-tangent.y, tangent.x, 0);
  }

  /**
   * 计算给定点到轨迹的最近点（逐段遍历的暴力算法）。
   *
   * 对轨迹中每一对相邻点 `(p1, p2)` 构成一条线段，计算 `point` 在该线段上的投影参数 `t`：
   * - `t = dot(point - p1, p2 - p1) / |p2 - p1|²`，clamp 到 `[0, 1]`
   * - 投影点 `closest = p1 + t * (p2 - p1)`
   * - 计算投影距离
   *
   * 遍历所有段后返回距离最小的结果。
   *
   * - 0 个点时返回 `distance = Infinity`
   * - 1 个点时直接计算到该点的距离
   *
   * @param {Point3} point - 待查询的三维点
   * @returns {{ distance: number; closestPoint: Point3; parameter: number }}
   *   - `distance`：点到最近点的欧几里得距离
   *   - `closestPoint`：轨迹上距离最近的点
   *   - `parameter`：最近点对应的归一化参数 `t`，范围 `[0, 1]`
   *
   * @example
   * ```ts
   * const pts = new Float32Array([0,0,0, 100,0,0]);
   * const traj = new DenseTrajectory(pts);
   * const result = traj.getClosestPoint(new Point3(50, 50, 0));
   * // result.closestPoint → Point3(50, 0, 0)
   * // result.distance → 50
   * ```
   */
  public getClosestPoint(point: Point3): {
    distance: number;
    closestPoint: Point3;
    parameter: number;
  } {
    const pointCount = this.controlPoints.length / 3;
    if (pointCount === 0) {
      return {
        distance: Infinity,
        closestPoint: new Point3(0, 0, 0),
        parameter: 0,
      };
    }
    if (pointCount === 1) {
      const p = new Point3(
        this.controlPoints[0],
        this.controlPoints[1],
        this.controlPoints[2],
      );
      return {
        distance: Math.sqrt(
          Math.pow(point.x - p.x, 2) + Math.pow(point.y - p.y, 2),
        ),
        closestPoint: p,
        parameter: 0,
      };
    }

    let minDistance = Infinity;
    let closestPoint = new Point3(0, 0, 0);
    let closestT = 0;

    for (let i = 0; i < pointCount - 1; i++) {
      const idx1 = i * 3;
      const idx2 = (i + 1) * 3;
      const p1 = new Point3(
        this.controlPoints[idx1],
        this.controlPoints[idx1 + 1],
        this.controlPoints[idx1 + 2],
      );
      const p2 = new Point3(
        this.controlPoints[idx2],
        this.controlPoints[idx2 + 1],
        this.controlPoints[idx2 + 2],
      );

      const segmentLength = Math.sqrt(
        Math.pow(p2.x - p1.x, 2) +
          Math.pow(p2.y - p1.y, 2) +
          Math.pow(p2.z - p1.z, 2),
      );
      if (segmentLength === 0) continue;

      const t = Math.max(
        0,
        Math.min(
          1,
          ((point.x - p1.x) * (p2.x - p1.x) +
            (point.y - p1.y) * (p2.y - p1.y) +
            (point.z - p1.z) * (p2.z - p1.z)) /
            (segmentLength * segmentLength),
        ),
      );

      const closest = new Point3(
        p1.x + t * (p2.x - p1.x),
        p1.y + t * (p2.y - p1.y),
        p1.z + t * (p2.z - p1.z),
      );

      const distance = Math.sqrt(
        Math.pow(point.x - closest.x, 2) +
          Math.pow(point.y - closest.y, 2) +
          Math.pow(point.z - closest.z, 2),
      );

      if (distance < minDistance) {
        minDistance = distance;
        closestPoint = closest;
        closestT = (i + t) / (pointCount - 1);
      }
    }

    return { distance: minDistance, closestPoint, parameter: closestT };
  }

  /**
   * 计算轨迹在指定参数范围 `[tStart, tEnd]` 内的弧长（逐段累加）。
   *
   * 将 `tStart`/`tEnd` 映射到点索引，逐段计算相邻点的欧几里得距离并累加。
   *
   * - 少于 2 个点时返回 `0`
   *
   * @param {number} tStart - 起始归一化参数
   * @param {number} tEnd - 结束归一化参数
   * @returns {number} 累计弧长
   *
   * @example
   * ```ts
   * const pts = new Float32Array([0,0,0, 100,0,0, 100,100,0]);
   * const traj = new DenseTrajectory(pts);
   * traj.getLength(0, 1);   // ≈ 200（100 + 100）
   * traj.getLength(0, 0.5); // ≈ 100（第一段）
   * ```
   */
  public getLength(tStart: number, tEnd: number): number {
    const pointCount = this.controlPoints.length / 3;
    if (pointCount < 2) return 0;

    const startIdx = Math.floor(
      Math.max(0, Math.min(1, tStart)) * (pointCount - 1),
    );
    const endIdx = Math.floor(
      Math.max(0, Math.min(1, tEnd)) * (pointCount - 1),
    );

    let length = 0;
    for (let i = startIdx; i < endIdx; i++) {
      const idx1 = i * 3;
      const idx2 = (i + 1) * 3;
      const dx = this.controlPoints[idx2] - this.controlPoints[idx1];
      const dy = this.controlPoints[idx2 + 1] - this.controlPoints[idx1 + 1];
      const dz = this.controlPoints[idx2 + 2] - this.controlPoints[idx1 + 2];
      length += Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    return length;
  }

  /**
   * 计算闭合轨迹的面积（鞋带公式）。
   *
   * 使用鞋带公式（Shoelace formula）计算闭合轨迹围成区域的面积：
   * `area = |Σ(x_i × y_{i+1} - x_{i+1} × y_i)| / 2`
   *
   * @returns {number} 面积值
   * @throws {Error} 当轨迹未闭合时抛出错误
   *
   * @example
   * ```ts
   * const pts = new Float32Array([0,0,0, 100,0,0, 100,100,0, 0,0,0]);
   * const traj = new DenseTrajectory(pts);
   * traj.getArea(); // 5000
   * ```
   */
  public getArea(): number {
    if (!this.isClosed()) {
      throw new Error('DenseTrajectory 未闭合，不具有面积');
    }
    // 使用鞋带公式计算闭合轨迹面积
    const pts = this.controlPoints;
    const n = pts.length / 3;
    let area = 0;
    for (let i = 0; i < n - 1; i++) {
      const x0 = pts[i * 3];
      const y0 = pts[i * 3 + 1];
      const x1 = pts[(i + 1) * 3];
      const y1 = pts[(i + 1) * 3 + 1];
      area += x0 * y1 - x1 * y0;
    }
    return Math.abs(area) / 2;
  }

  /**
   * 计算轨迹的质心（所有点的算术平均值）。
   *
   * @returns {Point3} 质心点；0 个点时返回原点
   *
   * @example
   * ```ts
   * const pts = new Float32Array([0,0,0, 100,0,0, 50,100,0]);
   * const traj = new DenseTrajectory(pts);
   * traj.getCentroid(); // Point3(50, 33.33, 0)
   * ```
   */
  public getCentroid(): Point3 {
    const pointCount = this.controlPoints.length / 3;
    if (pointCount === 0) return new Point3(0, 0, 0);

    let sumX = 0,
      sumY = 0,
      sumZ = 0;
    for (let i = 0; i < pointCount; i++) {
      const idx = i * 3;
      sumX += this.controlPoints[idx];
      sumY += this.controlPoints[idx + 1];
      sumZ += this.controlPoints[idx + 2];
    }

    return new Point3(sumX / pointCount, sumY / pointCount, sumZ / pointCount);
  }

  /**
   * 对密集轨迹应用矩阵变换。
   *
   * 逐点对 `controlPoints` 中的每个三维点应用 `matrix` 乘法，
   * 将变换后的坐标写回 `Float32Array`，然后重新计算包围盒。
   *
   * @param {Matrix4} matrix - 4×4 变换矩阵
   * @returns {Graph} 当前实例
   *
   * @example
   * ```ts
   * const moveMatrix = Matrix4.translation(50, 50, 0);
   * traj.transform(moveMatrix); // 所有点平移 (50, 50, 0)
   * ```
   */
  public transform(matrix: Matrix4): Graph {
    for (let i = 0; i < this.controlPoints.length; i += 3) {
      const point = new Point3(
        this.controlPoints[i],
        this.controlPoints[i + 1],
        this.controlPoints[i + 2],
      );
      const transformed = matrix.multiply(point);
      this.controlPoints[i] = transformed.x;
      this.controlPoints[i + 1] = transformed.y;
      this.controlPoints[i + 2] = transformed.z;
    }
    this.bounds = this.updateBounds();
    return this;
  }

  /**
   * 计算与另一个图形的相交点。
   *
   * 将密集轨迹视为相邻点构成的线段序列，每段构造 {@link Line} 对象，
   * 逐段与目标图形求交，合并所有交点。
   *
   * @param {Graph} other - 另一个图形
   * @returns {Point3[]} 相交点数组
   *
   * @example
   * ```ts
   * const pts = new Float32Array([0,50,0, 200,50,0]);
   * const traj = new DenseTrajectory(pts);
   * const line = new Line(new Point3(100, 0, 0), new Point3(100, 100, 0));
   * traj.intersect(line); // [Point3(100, 50, 0)]
   * ```
   */
  public intersect(other: Graph): Point3[] {
    const points = [];
    for (let i = 0; i < this.controlPoints.length; i += 3) {
      points.push(
        new Point3(
          this.controlPoints[i],
          this.controlPoints[i + 1],
          this.controlPoints[i + 2],
        ),
      );
    }
    const lines: Line[] = [];
    points.reduce((prePoint, curPoint) => {
      lines.push(new Line(prePoint, curPoint));
      return curPoint;
    });
    return lines.map((line) => line.intersect(other)).flat();
  }

  // ── 序列化（JSON，用于持久化存储） ──

  /**
   * 将密集轨迹序列化为 JSON 对象，用于持久化存储。
   *
   * `controlPoints` 通过 `Array.from()` 转为普通数组以便 JSON 序列化。
   *
   * @returns {any} 包含 id、type、controlPoints 和 style 的 JSON 对象
   *
   * @example
   * ```ts
   * const json = traj.toJSON();
   * // { id: '...', type: 9, controlPoints: [0,0,0, 100,0,0], style: {...} }
   * ```
   */
  toJSON(): any {
    return {
      id: this.id,
      type: this.type,
      controlPoints: Array.from(this.controlPoints),
    };
  }

  /**
   * 从 JSON 对象反序列化创建密集轨迹。
   *
   * @param {any} data - 序列化后的 JSON 数据
   * @returns {DenseTrajectory} 恢复的密集轨迹实例
   *
   * @example
   * ```ts
   * const traj = DenseTrajectory.fromJSON(jsonData);
   * ```
   */
  static fromJSON(data: any): DenseTrajectory {
    const points = new Float32Array(data.controlPoints);
    const dt = new DenseTrajectory(points);
    dt.id = data.id;
    return dt;
  }

  // ── Worker 传输（零拷贝，用于 Worker 间数据传输） ──

  /**
   * 提取 controlPoints 的底层 ArrayBuffer 用于零拷贝传输。
   *
   * 调用后当前实例的 `controlPoints` 将被 **detach**（不可用），
   * 因为 `ArrayBuffer` 的所有权已转移给 Worker 传输通道。
   * Worker 处理完毕后应通过 {@link fromTransferable} 归还 buffer。
   *
   * 返回的 {@link TransferableData} 包含：
   * - `meta`：轨迹的元信息（id、type、byteOffset、length、style）
   * - `buffers`：`[ArrayBuffer]` — controlPoints 的底层 buffer
   *
   * @returns {TransferableData} 可传输的数据对象
   *
   * @example
   * ```ts
   * const data = traj.toTransferable();
   * // traj.controlPoints 此时已被 detach，不可再访问
   * worker.postMessage(data, data.buffers);
   * ```
   */
  toTransferable(): TransferableData {
    const buffer = this.controlPoints.buffer;
    return {
      $type: "DenseTrajectory",
      meta: {
        id: this.id,
        type: this.type,
        byteOffset: this.controlPoints.byteOffset,
        length: this.controlPoints.length,
      },
      buffers: [buffer],
    };
  }

  /**
   * 从 TransferableData 重建 DenseTrajectory 实例（零拷贝）。
   *
   * 直接在传入的 `ArrayBuffer` 上创建 `Float32Array` 视图，
   * 绕过构造函数的 `Float32Array.from()` 拷贝，实现真正的零拷贝传输。
   *
   * 使用 `Object.create(DenseTrajectory.prototype)` 绕过构造函数，
   * 手动初始化所有属性。
   *
   * @param {TransferableData} data - Worker 传输回来的数据对象
   * @returns {DenseTrajectory} 重建的密集轨迹实例
   *
   * @example
   * ```ts
   * // 在 Worker 中接收：
   * const traj = DenseTrajectory.fromTransferable(receivedData);
   * // traj.controlPoints 直接引用传入的 ArrayBuffer，无额外拷贝
   * ```
   */
  static fromTransferable(data: TransferableData): DenseTrajectory {
    const { meta, buffers } = data;
    const controlPoints = new Float32Array(
      buffers[0],
      meta.byteOffset,
      meta.length,
    );
    // 绕过构造函数避免 Float32Array.from 的隐式拷贝
    const dt = Object.create(DenseTrajectory.prototype) as DenseTrajectory;
    dt.id = meta.id;
    dt.type = GraphType.DENSETRAJECTORY;
    dt.controlPoints = controlPoints;
    dt.bounds = dt.updateBounds();
    return dt;
  }

  /**
   * 按比例缩放调整密集轨迹的尺寸。
   *
   * 根据固定点（`fixedPoint`）和动态点（`dynamicPoint`）确定的参考矩形，
   * 计算每个控制点到固定点的相对比例，再将 `resizeVector` 按该比例分配给各控制点，
   * 直接修改 `Float32Array` 中的坐标值，然后重新计算包围盒。
   *
   * @param {Point3} fixedPoint - 缩放固定点
   * @param {Point3} dynamicPoint - 缩放动态点
   * @param {Vector3} resizeVector - 缩放方向和幅值向量
   *
   * @example
   * ```ts
   * traj.resize(
   *   new Point3(0, 0, 0),
   *   new Point3(100, 100, 0),
   *   new Vector3(10, 10, 0)
   * );
   * ```
   */
  public resize(
    fixedPoint: Point3,
    dynamicPoint: Point3,
    resizeVector: Vector3,
  ): void {
    const width = Math.abs(fixedPoint.x - dynamicPoint.x) || Infinity;
    const height = Math.abs(fixedPoint.y - dynamicPoint.y) || Infinity;

    for (let i = 0; i < this.controlPoints.length; i += 3) {
      // 变化比例
      const scaleX = Math.abs(this.controlPoints[i] - fixedPoint.x) / width;
      const scaleY =
        Math.abs(this.controlPoints[i + 1] - fixedPoint.y) / height;

      // 带方向并且按照介质尺寸缩放的移动量
      const dx = resizeVector.x * scaleX;
      const dy = resizeVector.y * scaleY;

      this.controlPoints[i] += dx;
      this.controlPoints[i + 1] += dy;
    }
    this.bounds = this.updateBounds();
  }

  /**
   * 设置指定索引的控制点。密集轨迹不支持单点顶点编辑，此方法为空操作。
   *
   * @param {number} _index - 控制点索引（未使用）
   * @param {Point3} _point - 新的控制点位置（未使用）
   *
   * @example
   * ```ts
   * traj.setControlPoint(0, new Point3(10, 10, 0)); // 无效果
   * ```
   */
  public setControlPoint(_index: number, _point: Point3): void {}
}
