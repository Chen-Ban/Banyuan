import { GraphType } from "@/foundation/constants";
import AnalyticGraph from "./AnalyticGraph";
import { Point3, Vector3, Matrix4, MathUtils } from "@/foundation/math";
import { Style } from "@/foundation/style";
import Bounds from "@/graph/base/Bounds";
import Graph from "@/graph/base/Graph";
import { intersect } from "@/graph/algorithm/IntersectionUtils";
import type { IArc } from '@/types/graph/graph'
import type { ISerializable } from '@/types/foundation/serializable'
import type { IDrawingContext } from '@/types/platform/context.js'
import { generateId } from "@/foundation/utils";

/**
 * 椭圆弧图形
 *
 * 基于椭圆参数方程的解析式弧线图形，支持完整的椭圆和任意角度范围的弧段。
 * 核心参数包括：圆心 `center`、X 轴半径 `xRadius`、Y 轴半径 `yRadius`、
 * 旋转角 `rotation`、起止角度 `startAngle`/`endAngle`、方向 `clockwise`。
 *
 * 椭圆参数方程（旋转后世界坐标）：
 * ```
 * x(θ) = cx + xRadius·cosθ·cosR - yRadius·sinθ·sinR
 * y(θ) = cy + xRadius·cosθ·sinR + yRadius·sinθ·cosR
 * ```
 *
 * 包围盒通过解析求解极值点（令 dx/dθ = 0 和 dy/dθ = 0）精确计算，
 * 弧长通过自适应 Simpson 积分数值求解。
 *
 * @example
 * ```typescript
 * // 创建一个半圆弧
 * const arc = new Arc(
 *   new Point3(100, 100, 0), // 圆心
 *   50, 50,                   // X/Y 半径（圆形）
 *   0,                        // 无旋转
 *   0, Math.PI,               // 从 0 到 π（上半圆）
 *   false,                    // 逆时针
 * );
 * ```
 */
export default class Arc extends AnalyticGraph implements IArc, ISerializable {
  /**
   * 图形类型标识，固定为 `GraphType.ARC`
   */
  public type: GraphType = GraphType.ARC;

  /**
   * 控制点数组，`[startPoint, endPoint, center]`
   *
   * - `controlPoints[0]`：弧的起始点
   * - `controlPoints[1]`：弧的终止点
   * - `controlPoints[2]`：圆心
   *
   * Arc 的控制点由参数（center/radius/angle）派生，不支持通过 `setControlPoint` 直接编辑。
   */
  public controlPoints: Point3[];

  /**
   * 椭圆弧的轴对齐包围盒（AABB）
   */
  public bounds: Bounds;

  /**
   * 椭圆弧的圆心坐标
   */
  public center: Point3;

  /**
   * X 轴半径（椭圆长轴/短轴之一），非负值
   */
  public xRadius: number;

  /**
   * Y 轴半径（椭圆长轴/短轴之一），非负值
   */
  public yRadius: number;

  /**
   * 椭圆的旋转角度（弧度），表示 X 轴方向相对于水平方向的偏转
   */
  public rotation: number;

  /**
   * 弧的起始角度（弧度），对应椭圆参数方程中的 θ 参数
   */
  public startAngle: number;

  /**
   * 弧的结束角度（弧度），对应椭圆参数方程中的 θ 参数
   */
  public endAngle: number;

  /**
   * 是否顺时针方向绘制，默认 `false`（逆时针）
   */
  public clockwise: boolean;

  /**
   * 判断椭圆弧是否为闭合路径
   *
   * 当起止角度之差的绝对值大于等于 2π 时，弧为完整椭圆，视为闭合路径。
   *
   * @returns {boolean} 弧是否闭合
   *
   * @example
   * ```typescript
   * const fullEllipse = new Arc(center, 50, 50, 0, 0, Math.PI * 2);
   * fullEllipse.isClosed(); // true
   *
   * const halfArc = new Arc(center, 50, 50, 0, 0, Math.PI);
   * halfArc.isClosed(); // false
   * ```
   */
  public isClosed(): boolean {
    return Math.abs(this.endAngle - this.startAngle) >= 2 * Math.PI;
  }

  /**
   * 创建一个椭圆弧
   *
   * @param center - {Point3} 圆心坐标
   * @param xRadius - {number} X 轴半径，非负值（负值会被裁为 0）
   * @param yRadius - {number} Y 轴半径，非负值（负值会被裁为 0）
   * @param rotation - {number} 椭圆旋转角度（弧度）
   * @param startAngle - {number} 起始角度（弧度）
   * @param endAngle - {number} 结束角度（弧度）
   * @param clockwise - {boolean} 是否顺时针方向，默认 `false`
   * @param style - {Style} 线条样式，默认为 `Style.DEFAULT`
   * @param id - {string | undefined} 可选的唯一标识符，未提供时自动生成
   *
   * @example
   * ```typescript
   * // 创建一个完整椭圆
   * const ellipse = new Arc(
   *   new Point3(200, 150, 0),
   *   80, 40,                // 水平方向较长
   *   Math.PI / 4,          // 旋转 45°
   *   0, Math.PI * 2,       // 完整椭圆
   * );
   * ```
   */
  constructor(
    center: Point3,
    xRadius: number,
    yRadius: number,
    rotation: number,
    startAngle: number,
    endAngle: number,
    clockwise: boolean = false,
    _style?: Style,
    id?: string,
  ) {
    super(id);
    this.center = center;
    this.xRadius = Math.max(0, xRadius);
    this.yRadius = Math.max(0, yRadius);
    this.rotation = rotation;
    this.startAngle = startAngle;
    this.endAngle = endAngle;
    this.clockwise = clockwise;

    // 计算控制点（用于边界框计算）
    this.controlPoints = this.calculateControlPoints();

    this.bounds = this.updateBounds();
    if (!id) this.id = generateId(this.type);
  }

  /**
   * 计算椭圆弧的控制点
   *
   * 控制点由弧的参数派生，包括起始点、终止点和圆心。
   * 当弧的参数（center/radius/angle）变更时需重新调用此方法。
   *
   * @returns {Point3[]} 控制点数组 `[startPoint, endPoint, center]`
   *
   * @example
   * ```typescript
   * // 内部调用，通常不需要直接使用
   * const points = this.calculateControlPoints();
   * ```
   */
  protected calculateControlPoints(): Point3[] {
    const points: Point3[] = [];

    // 添加起始点（考虑椭圆和旋转）
    const startPoint = this.getPointAt(0);
    points.push(startPoint);

    // 添加结束点（考虑椭圆和旋转）
    const endPoint = this.getPointAt(1);
    points.push(endPoint);

    // 添加中心点
    points.push(this.center);

    return points;
  }

  /**
   * 设置指定索引的控制点（不支持，no-op）
   *
   * Arc 的控制点由参数（center/radius/angle）派生，不支持通过索引直接编辑。
   * 应使用 `setCenter`、`setXRadius`、`setYRadius` 等参数化接口替代。
   *
   * @param _index - {number} 控制点索引（忽略）
   * @param _point - {Point3} 新位置（忽略）
   */
  public setControlPoint(_index: number, _point: Point3): void {
    // no-op：Arc 顶点编辑应通过 setCenter/setXRadius/setYRadius 等参数化接口实现
  }

  /**
   * 设置圆心坐标
   *
   * 修改圆心后会自动重新计算控制点和包围盒。
   *
   * @param center - {Point3} 新的圆心坐标
   * @returns {Arc} 返回 `this`，支持链式调用
   *
   * @example
   * ```typescript
   * arc.setCenter(new Point3(200, 200, 0));
   * ```
   */
  setCenter(center: Point3): Arc {
    this.center = center;
    this.controlPoints = this.calculateControlPoints();
    this.bounds = this.updateBounds();
    return this;
  }

  /**
   * 设置 X 轴半径
   *
   * 修改后自动重新计算控制点和包围盒。负值会抛出异常。
   *
   * @param xRadius - {number} 新的 X 轴半径，必须非负
   * @returns {Arc} 返回 `this`，支持链式调用
   * @throws {Error} 当 `xRadius` 为负数时抛出
   *
   * @example
   * ```typescript
   * arc.setXRadius(100);
   * ```
   */
  setXRadius(xRadius: number): Arc {
    if (xRadius < 0) throw new Error("x半径不能为负数");
    this.xRadius = xRadius;
    this.controlPoints = this.calculateControlPoints();
    this.bounds = this.updateBounds();
    return this;
  }

  /**
   * 设置 Y 轴半径
   *
   * 修改后自动重新计算控制点和包围盒。负值会抛出异常。
   *
   * @param yRadius - {number} 新的 Y 轴半径，必须非负
   * @returns {Arc} 返回 `this`，支持链式调用
   * @throws {Error} 当 `yRadius` 为负数时抛出
   *
   * @example
   * ```typescript
   * arc.setYRadius(60);
   * ```
   */
  setYRadius(yRadius: number): Arc {
    if (yRadius < 0) throw new Error("y半径不能为负数");
    this.yRadius = yRadius;
    this.controlPoints = this.calculateControlPoints();
    this.bounds = this.updateBounds();
    return this;
  }

  /**
   * 设置椭圆旋转角度
   *
   * 修改旋转角后自动重新计算控制点和包围盒。
   *
   * @param rotation - {number} 新的旋转角度（弧度）
   * @returns {Arc} 返回 `this`，支持链式调用
   *
   * @example
   * ```typescript
   * arc.setRotation(Math.PI / 4); // 旋转 45°
   * ```
   */
  setRotation(rotation: number): Arc {
    this.rotation = rotation;
    this.controlPoints = this.calculateControlPoints();
    this.bounds = this.updateBounds();
    return this;
  }

  /**
   * 设置弧的起止角度
   *
   * 同时更新起始和结束角度，修改后自动重新计算控制点。
   * 注意：此方法不会自动更新包围盒，如需更新请手动调用 `updateBounds()`。
   *
   * @param startAngle - {number} 新的起始角度（弧度）
   * @param endAngle - {number} 新的结束角度（弧度）
   * @returns {Arc} 返回 `this`，支持链式调用
   *
   * @example
   * ```typescript
   * arc.setAngles(0, Math.PI); // 设为半圆弧
   * ```
   */
  setAngles(startAngle: number, endAngle: number): Arc {
    this.startAngle = startAngle;
    this.endAngle = endAngle;
    this.controlPoints = this.calculateControlPoints();
    return this;
  }

  /**
   * 设置弧的绘制方向
   *
   * @param clockwise - {boolean} 是否顺时针方向
   * @returns {Arc} 返回 `this`，支持链式调用
   *
   * @example
   * ```typescript
   * arc.setClockwise(true); // 改为顺时针
   * ```
   */
  setClockwise(clockwise: boolean): Arc {
    this.clockwise = clockwise;
    return this;
  }

  /**
   * 获取弧的起始点
   *
   * @returns {Point3} 弧的起始点，即 `controlPoints[0]`
   *
   * @example
   * ```typescript
   * const start = arc.startPoint;
   * ```
   */
  get startPoint(): Point3 {
    return this.controlPoints[0];
  }

  /**
   * 获取弧的终止点
   *
   * @returns {Point3} 弧的终止点，即 `controlPoints[1]`
   *
   * @example
   * ```typescript
   * const end = arc.endPoint;
   * ```
   */
  get endPoint(): Point3 {
    return this.controlPoints[1];
  }

  /**
   * 将椭圆弧路径绘制到 Canvas 上下文
   *
   * 使用 Canvas 2D 的 `ellipse()` API 绘制椭圆弧路径，
   * 仅绘制路径，不执行描边或填充。
   *
   * @param ctx - {IDrawingContext} Canvas 2D 渲染上下文
   * @param dependent - {Boolean} 是否由本方法调用 `ctx.beginPath()`；
   *   为 `true` 时先调用 `beginPath()` 再绘制路径，为 `false` 时仅追加路径
   *
   * @example
   * ```typescript
   * arc.renderPath(ctx, true); // 开始新路径并绘制椭圆弧
   * ```
   */
  public renderPath(ctx: IDrawingContext, dependent: Boolean): void {
    dependent && ctx.beginPath();
    ctx.ellipse(
      this.center.x,
      this.center.y,
      this.xRadius,
      this.yRadius,
      this.rotation,
      this.startAngle,
      this.endAngle,
      this.clockwise,
    );
  }

  /**
   * 渲染椭圆弧
   *
   * 将椭圆弧以当前样式渲染到 Canvas 上下文中，包括保存/恢复上下文状态、
   * 应用样式、绘制路径和描边。
   *
   * @param ctx - {IDrawingContext} Canvas 2D 渲染上下文
   *
   * @example
   * ```typescript
   * const arc = new Arc(center, 50, 50, 0, 0, Math.PI);
   * arc.render(ctx);
   * ```
   */
  public render(ctx: IDrawingContext, style: Style): void {
    ctx.save();
    const bounds = this.bounds;
    style.applyToContext(
      ctx,
      Math.abs(bounds.width),
      Math.abs(bounds.height),
    );
    this.renderPath(ctx, true);
    ctx.stroke();
    ctx.restore();
  }

  // ── 序列化 ──

  /**
   * 将椭圆弧序列化为 JSON 对象
   *
   * 输出结构包含 `id`、`type`、`center`、`xRadius`、`yRadius`、
   * `rotation`、`startAngle`、`endAngle`、`clockwise` 和 `style`。
   *
   * @returns {{ id: string; type: GraphType; center: any; xRadius: number; yRadius: number; rotation: number; startAngle: number; endAngle: number; clockwise: boolean; style: any }}
   *   可 JSON 化的纯对象
   *
   * @example
   * ```typescript
   * const json = arc.toJSON();
   * // { id: 'arc_xxx', type: 3, center: {...}, xRadius: 50, ... }
   * ```
   */
  toJSON(): any {
    return {
      id: this.id,
      type: this.type,
      center: this.center.toJSON(),
      xRadius: this.xRadius,
      yRadius: this.yRadius,
      rotation: this.rotation,
      startAngle: this.startAngle,
      endAngle: this.endAngle,
      clockwise: this.clockwise,
    };
  }

  /**
   * 从 JSON 对象反序列化创建椭圆弧实例
   *
   * @param data - {any} 序列化数据对象，需包含 `center`、`xRadius`、`yRadius`、
   *   `rotation`、`startAngle`、`endAngle`、`clockwise`、`style` 和可选的 `id`
   * @returns {Arc} 还原后的椭圆弧实例
   *
   * @example
   * ```typescript
   * const arc = Arc.fromJSON({
   *   id: 'arc_abc',
   *   type: GraphType.ARC,
   *   center: { x: 100, y: 100, z: 0 },
   *   xRadius: 50,
   *   yRadius: 30,
   *   rotation: 0,
   *   startAngle: 0,
   *   endAngle: Math.PI,
   *   clockwise: false,
   *   style: { strokeColor: '#000' },
   * });
   * ```
   */
  static fromJSON(data: any): Arc {
    const arc = new Arc(
      Point3.fromJSON(data.center),
      data.xRadius,
      data.yRadius,
      data.rotation,
      data.startAngle,
      data.endAngle,
      data.clockwise,
    );
    arc.id = data.id;
    return arc;
  }

  /**
   * 复制椭圆弧
   *
   * 创建当前椭圆弧的深拷贝，包括圆心坐标和样式的独立副本，
   * 其余参数（半径、角度等）为原始值直接复制。
   *
   * @returns {this} 当前椭圆弧的深拷贝实例
   *
   * @example
   * ```typescript
   * const copied = arc.copy();
   * copied.setCenter(new Point3(0, 0, 0)); // 不影响原弧
   * ```
   */
  public copy(): this {
    return new Arc(
      this.center.copy(),
      this.xRadius,
      this.yRadius,
      this.rotation,
      this.startAngle,
      this.endAngle,
      this.clockwise,
    ) as this;
  }

  /**
   * 计算椭圆弧的包围盒（解析求解极值点）
   *
   * 旋转椭圆参数方程：
   * ```
   * x(θ) = cx + a·cosθ·cosR - b·sinθ·sinR
   * y(θ) = cy + a·cosθ·sinR + b·sinθ·cosR
   * ```
   *
   * 令 dx/dθ = 0 → tanθ = -(b·sinR)/(a·cosR) → θ_x = atan2(-b·sin, a·cos)
   * 令 dy/dθ = 0 → tanθ = (b·cosR)/(a·sinR)  → θ_y = atan2(b·cos, a·sin)
   *
   * 极值候选角度：两个 x 极值 + 两个 y 极值。
   * 只保留落在弧范围内的极值点，再加上起止点，最终由所有候选点确定包围盒。
   *
   * @returns {Bounds} 椭圆弧的精确轴对齐包围盒
   *
   * @example
   * ```typescript
   * const arc = new Arc(new Point3(100, 100, 0), 50, 30, 0, 0, Math.PI);
   * const bounds = arc.updateBounds();
   * console.log(bounds.width, bounds.height);
   * ```
   */
  public updateBounds(): Bounds {
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    const a = this.xRadius;
    const b = this.yRadius;

    const thetaX = Math.atan2(-b * sin, a * cos);
    const thetaY = Math.atan2(b * cos, a * sin);

    // 极值候选角度：两个 x 极值 + 两个 y 极值
    const candidates: number[] = [
      thetaX, thetaX + Math.PI,
      thetaY, thetaY + Math.PI,
    ];

    // 归一化角度到 [0, 2π)
    const TWO_PI = MathUtils.TWO_PI;
    const normalize = (angle: number): number => ((angle % TWO_PI) + TWO_PI) % TWO_PI;

    const normStart = normalize(this.startAngle);
    const normEnd = normalize(this.endAngle);

    // 计算椭圆上角度 θ 对应的世界坐标点
    const pointAtTheta = (theta: number): Point3 => {
      const ct = Math.cos(theta);
      const st = Math.sin(theta);
      return new Point3(
        this.center.x + a * ct * cos - b * st * sin,
        this.center.y + a * ct * sin + b * st * cos,
        0,
      );
    };

    // 起止点必须包含
    const points: Point3[] = [
      pointAtTheta(this.startAngle),
      pointAtTheta(this.endAngle),
    ];

    // 只添加落在弧范围内的极值点
    for (const theta of candidates) {
      const normTheta = normalize(theta);
      if (MathUtils.isAngleInArcRange(normTheta, normStart, normEnd, this.clockwise)) {
        points.push(pointAtTheta(theta));
      }
    }

    return Bounds.fromPoints(points);
  }

  // ========== 椭圆极坐标计算 ==========

  /**
   * 通过笛卡尔极坐标角 φ 计算椭圆上的点（局部坐标系，未旋转）
   *
   * 椭圆极坐标方程（中心为原点）：
   * ```
   * r(φ) = (a · b) / √((b·cosφ)² + (a·sinφ)²)
   * x = r·cosφ, y = r·sinφ
   * ```
   *
   * 当分母小于浮点精度阈值时（退化情况），返回原点。
   *
   * @param angle - {number} 极坐标角度 φ（弧度）
   * @returns {Point3} 局部坐标系中的椭圆上的点（z=0）
   *
   * @example
   * ```typescript
   * // 内部方法，通常不直接调用
   * const localPoint = this.getLocalPointAtAngle(Math.PI / 4);
   * ```
   */
  private getLocalPointAtAngle(angle: number): Point3 {
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const a = this.xRadius;
    const b = this.yRadius;
    const denom = Math.sqrt((b * cosA) ** 2 + (a * sinA) ** 2);
    if (denom < MathUtils.FLOAT_EPSILON) {
      return new Point3(0, 0, 0);
    }
    const r = (a * b) / denom;
    return new Point3(r * cosA, r * sinA, 0);
  }

  // ========== AnalyticGraph 抽象方法实现 ==========

  /**
   * 获取椭圆弧上指定参数 t 处的点
   *
   * 参数 `t` 在 `[0, 1]` 范围内线性映射到 `[startAngle, endAngle]`，
   * 然后通过椭圆极坐标方程计算局部坐标，最后应用旋转和平移变换到世界坐标。
   *
   * @param t - {number} 参数值，范围 `[0, 1]`，`0` 为起始角，`1` 为终止角
   * @returns {Point3} 参数 t 对应的椭圆弧上的世界坐标点
   *
   * @example
   * ```typescript
   * const arc = new Arc(new Point3(100, 100, 0), 50, 50, 0, 0, Math.PI);
   * arc.getPointAt(0);   // 弧的起始点
   * arc.getPointAt(0.5); // 弧的中点
   * arc.getPointAt(1);   // 弧的终止点
   * ```
   */
  public getPointAt(t: number): Point3 {
    const angle = this.startAngle + t * (this.endAngle - this.startAngle);
    const localPoint = this.getLocalPointAtAngle(angle);

    // 应用旋转和平移
    const rotated = Matrix4.identity()
      .rotateZ(this.rotation)
      .multiply(localPoint);
    return rotated.add(
      new Vector3(this.center.x, this.center.y, this.center.z),
    );
  }

  /**
   * 获取椭圆弧上指定参数 t 处的切线向量
   *
   * 使用中心差分法数值求解切线方向：取 `t ± dt` 两点之差作为近似切线，
   * 然后归一化。当差分长度小于浮点精度阈值时返回零向量。
   *
   * @param t - {number} 参数值，范围 `[0, 1]`
   * @returns {Vector3} 归一化的切线方向向量
   *
   * @example
   * ```typescript
   * const arc = new Arc(center, 50, 50, 0, 0, Math.PI);
   * const tangent = arc.getTangentAt(0.5);
   * ```
   */
  public getTangentAt(t: number): Vector3 {
    // 用微小差分求切线方向
    const dt = MathUtils.DERIVATIVE_STEP;
    const p0 = this.getPointAt(Math.max(0, t - dt));
    const p1 = this.getPointAt(Math.min(1, t + dt));
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;

    // 归一化
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length < MathUtils.FLOAT_EPSILON) {
      return new Vector3(0, 0, 0);
    }
    return new Vector3(dx / length, dy / length, 0);
  }

  /**
   * 获取椭圆弧上指定参数 t 处的法向量
   *
   * 法向量是切线向量顺时针旋转 90° 的结果。
   * 与 `Line` 的法线方向相反（Line 为逆时针旋转 90°），
   * 使得法向量指向弧线的外侧。
   *
   * @param t - {number} 参数值，范围 `[0, 1]`
   * @returns {Vector3} 归一化的法向量
   *
   * @example
   * ```typescript
   * const arc = new Arc(center, 50, 50, 0, 0, Math.PI);
   * const normal = arc.getNormalAt(0.5);
   * ```
   */
  public getNormalAt(t: number): Vector3 {
    const tangent = this.getTangentAt(t);
    // 法线垂直于切线（顺时针旋转 90°）
    return new Vector3(tangent.y, -tangent.x, 0);
  }

  /**
   * 计算点到椭圆弧的最短距离，并返回最近点信息
   *
   * 使用数值采样方法：在弧上均匀采样 100 个点，
   * 找到距离目标点最近的采样点作为近似最近点。
   * 适用于精度要求一般的场景，如拾取判断。
   *
   * @param point - {Point3} 目标点
   * @returns {{ distance: number; closestPoint: Point3; parameter: number }}
   *   - `distance`：目标点到最近点的欧氏距离
   *   - `closestPoint`：弧上最近的点
   *   - `parameter`：最近点对应的参数 t，范围 `[0, 1]`
   *
   * @example
   * ```typescript
   * const arc = new Arc(new Point3(100, 100, 0), 50, 50, 0, 0, Math.PI);
   * const result = arc.getClosestPoint(new Point3(150, 100, 0));
   * // { distance: 0, closestPoint: Point3(150, 100, 0), parameter: 0.5 }
   * ```
   */
  public getClosestPoint(point: Point3): {
    distance: number;
    closestPoint: Point3;
    parameter: number;
  } {
    // 在局部坐标系中计算最近点（使用数值方法）
    let closestT = 0;
    let minDistance = Infinity;
    const numSamples = 100;

    for (let i = 0; i <= numSamples; i++) {
      const t = i / numSamples;
      const arcPoint = this.getPointAt(t);
      const distance = point.distance(arcPoint);
      if (distance < minDistance) {
        minDistance = distance;
        closestT = t;
      }
    }

    const closestPoint = this.getPointAt(closestT);
    const distance = point.distance(closestPoint);

    return { distance, closestPoint, parameter: closestT };
  }

  /**
   * 计算椭圆弧在指定参数范围内的弧长
   *
   * 使用自适应 Simpson 积分法数值求解弧长。
   * 被积函数为参数曲线速度向量的模 `ds/dt = |dP/dt|`。
   * 递归细分直至达到精度阈值或最大递归深度（12 层）。
   *
   * @param tStart - {number} 起始参数，范围 `[0, 1]`
   * @param tEnd - {number} 终止参数，范围 `[0, 1]`
   * @returns {number} 指定参数范围内的弧长
   *
   * @example
   * ```typescript
   * const arc = new Arc(center, 50, 50, 0, 0, Math.PI);
   * arc.getLength(0, 1);   // 半圆弧长 ≈ π × 50 ≈ 157.08
   * arc.getLength(0, 0.5); // 四分之一弧长 ≈ 78.54
   * ```
   */
  public getLength(tStart: number, tEnd: number): number {
    // 自适应 Simpson 积分求弧长
    // 被积函数 ds/dt = |dP/dt|，即参数曲线速度向量的模
    const speed = (t: number): number => {
      const dt = MathUtils.DERIVATIVE_STEP * 0.1;
      const t0 = Math.max(tStart, t - dt);
      const t1 = Math.min(tEnd, t + dt);
      const p0 = this.getPointAt(t0);
      const p1 = this.getPointAt(t1);
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      return Math.sqrt(dx * dx + dy * dy) / (t1 - t0);
    };

    // Simpson 公式：∫[a,b] f(x)dx ≈ (b-a)/6 · [f(a) + 4f(m) + f(b)]
    const simpson = (a: number, b: number, fa: number, fm: number, fb: number): number => {
      return ((b - a) / 6) * (fa + 4 * fm + fb);
    };

    // 自适应递归：比较整段 Simpson 与两半段之和，差异超阈值则继续细分
    const adaptiveSimpson = (
      a: number, b: number,
      fa: number, fm: number, fb: number,
      whole: number, eps: number, depth: number,
    ): number => {
      const m = (a + b) / 2;
      const lm = (a + m) / 2;
      const rm = (m + b) / 2;
      const flm = speed(lm);
      const frm = speed(rm);
      const left = simpson(a, m, fa, flm, fm);
      const right = simpson(m, b, fm, frm, fb);
      const refined = left + right;
      // 达到精度或最大深度则停止
      if (depth <= 0 || Math.abs(refined - whole) <= 15 * eps) {
        return refined + (refined - whole) / 15;
      }
      return (
        adaptiveSimpson(a, m, fa, flm, fm, left, eps / 2, depth - 1) +
        adaptiveSimpson(m, b, fm, frm, fb, right, eps / 2, depth - 1)
      );
    };

    const fa = speed(tStart);
    const fb = speed(tEnd);
    const fm = speed((tStart + tEnd) / 2);
    const whole = simpson(tStart, tEnd, fa, fm, fb);

    return adaptiveSimpson(tStart, tEnd, fa, fm, fb, whole, MathUtils.INTEGRATION_TOLERANCE, 12);
  }

  /**
   * 计算椭圆弧的面积
   *
   * 仅当弧为闭合路径（完整椭圆）时可计算面积，
   * 公式为 `π × xRadius × yRadius`。
   * 未闭合的弧调用此方法将抛出异常。
   *
   * @returns {number} 完整椭圆的面积
   * @throws {Error} 当弧未闭合时抛出 "Arc 未闭合，不具有面积"
   *
   * @example
   * ```typescript
   * const fullEllipse = new Arc(center, 50, 30, 0, 0, Math.PI * 2);
   * fullEllipse.getArea(); // π × 50 × 30 ≈ 4712.39
   * ```
   */
  public getArea(): number {
    if (!this.isClosed()) {
      throw new Error("Arc 未闭合，不具有面积");
    }
    // 完整椭圆面积 = π · a · b
    return Math.PI * this.xRadius * this.yRadius;
  }

  /**
   * 计算椭圆弧的质心
   *
   * 返回椭圆弧的圆心坐标，即 `controlPoints[2]`。
   * 对于完整椭圆，圆心即为其几何中心。
   *
   * @returns {Point3} 圆心坐标
   *
   * @example
   * ```typescript
   * const arc = new Arc(new Point3(100, 100, 0), 50, 50, 0, 0, Math.PI);
   * arc.getCentroid(); // Point3(100, 100, 0)
   * ```
   */
  public getCentroid(): Point3 {
    return this.controlPoints[2];
  }

  /**
   * 应用变换矩阵到椭圆弧
   *
   * 将变换矩阵作用于圆心坐标，然后重新计算控制点和包围盒。
   * 注意：此方法仅变换圆心位置，不改变半径和旋转角度，
   * 适用于平移变换；对于包含缩放/旋转的变换，半径和角度可能需要额外调整。
   *
   * @param matrix - {Matrix4} 4×4 变换矩阵
   * @returns {AnalyticGraph} 返回 `this`，支持链式调用
   *
   * @example
   * ```typescript
   * const matrix = Matrix4.identity().translate(new Vector3(50, 0, 0));
   * arc.transform(matrix); // 圆心向右平移 50
   * ```
   */
  public transform(matrix: Matrix4): AnalyticGraph {
    this.center = matrix.multiply(this.center);
    this.controlPoints = this.calculateControlPoints();
    this.bounds = this.updateBounds();
    return this;
  }

  /**
   * 计算与另一个图形的相交点
   *
   * 如果另一个图形也是 `AnalyticGraph`，则使用精确的解析求交算法；
   * 否则委托给对方图形的 `intersect` 方法处理。
   *
   * @param other - {Graph} 另一个图形
   * @returns {Point3[]} 相交点数组，无交点时返回空数组
   *
   * @example
   * ```typescript
   * const arc = new Arc(center, 50, 50, 0, 0, Math.PI);
   * const line = new Line(start, end);
   * const intersections = arc.intersect(line);
   * ```
   */
  public intersect(other: Graph): Point3[] {
    // 如果另一个图形也是可分析图形，使用精确的相交计算方法
    if (other instanceof AnalyticGraph) {
      return intersect(this, other);
    }
    // 对于其他类型的图形，使用其他图形的相交计算方法
    return other.intersect(this);
  }

  /**
   * 按比例缩放调整椭圆弧尺寸
   *
   * 以 `fixedPoint` 为锚点，根据 `dynamicPoint` 与 `fixedPoint` 构成的参考尺寸
   * 和 `resizeVector` 指定的增量，对圆心按距离比例进行缩放位移，
   * 同时按整体宽高缩放比例调整 X/Y 半径。
   *
   * @param fixedPoint - {Point3} 缩放锚点（固定不动的参考点）
   * @param dynamicPoint - {Point3} 动态参考点（与锚点共同确定原始尺寸）
   * @param resizeVector - {Vector3} 缩放增量向量（宽高方向的变化量）
   *
   * @example
   * ```typescript
   * arc.resize(
   *   new Point3(0, 0, 0),    // 锚点
   *   new Point3(100, 100, 0), // 原始对角点
   *   new Vector3(20, 10, 0),  // 宽增20、高增10
   * );
   * ```
   */
  public resize(
    fixedPoint: Point3,
    dynamicPoint: Point3,
    resizeVector: Vector3,
  ): void {
    const referenceVector = dynamicPoint.subtract(fixedPoint);
    const width = Math.abs(referenceVector.x) || Infinity;
    const height = Math.abs(referenceVector.y) || Infinity;

    // center 按其到 fixedPoint 的距离比例缩放
    const scaleX = Math.abs(this.center.x - fixedPoint.x) / width;
    const scaleY = Math.abs(this.center.y - fixedPoint.y) / height;

    this.center = new Point3(
      this.center.x + resizeVector.x * scaleX,
      this.center.y + resizeVector.y * scaleY,
      this.center.z,
    );

    // 半径按整体缩放比例调整
    const newWidth = width + resizeVector.x * Math.sign(referenceVector.x);
    const newHeight = height + resizeVector.y * Math.sign(referenceVector.y);
    const ratioX = Math.abs(newWidth / width);
    const ratioY = Math.abs(newHeight / height);

    this.xRadius = Math.max(0, this.xRadius * ratioX);
    this.yRadius = Math.max(0, this.yRadius * ratioY);

    this.controlPoints = this.calculateControlPoints();
    this.bounds = this.updateBounds();
  }
}
