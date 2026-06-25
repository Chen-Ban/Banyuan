import { GraphType } from '@/foundation/constants'
import Style from '@/foundation/style/Style'
import { MathUtils, Matrix4, Point3, Vector3 } from '@/foundation/math'
import Bounds from './Bounds'
import type { IGraph } from '@/types/graph/graph'
import type { ISerializable } from '@/types/foundation/serializable'
import type { IDrawingContext } from '@/types/platform/context.js'

/**
 * 图形抽象基类
 *
 * `Graph` 是 BanvasGL 五层架构中 **graph 层** 的核心抽象基类，
 * 所有图形基元（直线、圆弧、贝塞尔曲线等）和组合图形均继承自此类。
 * 五层架构自底向上为：`types`（纯接口契约）→ `foundation`（数学/样式基础）→
 * `graph`（图形基元）→ `view`（视图基类及子类）→ `engine`（App/Scene/Renderer 等）。
 *
 * Graph 定义了所有图形共享的公共接口，包括：
 * - 路径渲染（`renderPath`、`render`）
 * - 参数化几何查询（`getPointAt`、`getTangentAt`、`getNormalAt`）
 * - 弧长与面积计算（`getLength`、`getTotalLength`、`getArea`）
 * - 点拾取（`isPointInPath`、`isPointOnCurve`、`getClosestPoint`）
 * - 变换与编辑（`transform`、`resize`、`setControlPoint`）
 * - 序列化（`toJSON`、`copy`）
 *
 * @example
 * ```typescript
 * // Graph 不可直接实例化，需通过子类使用
 * const line = new Line(startPoint, endPoint);
 * const arc = new Arc(center, xRadius, yRadius, 0, 0, Math.PI);
 * const bezier = new QuadraticBezier(p0, p1, p2);
 * ```
 */
export default abstract class Graph implements IGraph, ISerializable {
  /**
   * 图形唯一标识符
   */
  public id: string

  /**
   * 图形类型标识，由子类实现
   */
  public abstract type: GraphType

  /**
   * 图形控制点数组，由子类实现。
   *
   * 控制点定义了图形的几何形状关键顶点，不同子类有不同语义：
   * - `Line`：`[startPoint, endPoint]`
   * - `Arc`：`[startPoint, endPoint, center]`
   * - `QuadraticBezier`：`[startPoint, controlPoint, endPoint]`
   * - `CubicBezier`：`[startPoint, controlPoint1, controlPoint2, endPoint]`
   */
  public abstract controlPoints: Point3[] | Float32Array

  /**
   * 图形包围盒（轴对齐边界框）
   */
  public abstract bounds: Bounds

  /**
   * 创建一个图形实例
   *
   * @param id - {string | undefined} 可选的唯一标识符，未提供时默认为空字符串
   *
   * @example
   * ```typescript
   * // 通常由子类构造函数调用
   * class MyGraph extends Graph {
   *   constructor(id?: string) {
   *     super(id);
   *   }
   * }
   * ```
   */
  constructor(id?: string) {
    this.id = id ?? ''
  }

  // ── 序列化（子类必须实现） ──

  /**
   * 将图形序列化为 JSON 对象
   *
   * 子类必须实现此方法，输出包含图形所有状态的可 JSON 化纯对象。
   *
   * @returns {any} 可 JSON 化的纯对象
   */
  public abstract toJSON(): any

  /**
   * 描绘路径
   *
   * 将图形的几何路径绘制到 Canvas 2D 上下文中，仅绘制路径（moveTo/lineTo 等），
   * 不执行描边（stroke）或填充（fill），适合用于组合路径或裁剪区域的构建。
   *
   * @param ctx - {IDrawingContext} Canvas 2D 渲染上下文
   * @param dependent - {Boolean} 是否由本方法调用 `ctx.beginPath()`；
   *   为 `true` 时先调用 `beginPath()` 再绘制路径，为 `false` 时仅追加路径
   *
   * @example
   * ```typescript
   * graph.renderPath(ctx, true);  // 开始新路径并绘制
   * graph.renderPath(ctx, false); // 追加到当前路径
   * ```
   */
  public abstract renderPath(ctx: IDrawingContext, dependent: boolean): void

  /**
   * 渲染图形
   *
   * 将图形以传入的样式完整渲染到 Canvas 上下文中，包括保存/恢复上下文状态、
   * 应用样式、绘制路径和描边/填充。
   *
   * Graph 不再持有 style 属性，样式由 View 层在渲染时传入。
   * 合并逻辑：computedStyle 覆盖 defaultStyle（来自 DefaultStyleRegistry）。
   *
   * @param ctx - {IDrawingContext} Canvas 2D 渲染上下文
   * @param style - {Style} 渲染时使用的样式
   *
   * @example
   * ```typescript
   * graph.render(ctx, style);
   * ```
   */
  public abstract render(ctx: IDrawingContext, style: Style): void

  /**
   * 复制图形
   *
   * 创建当前图形的深拷贝，包括所有控制点和样式的独立副本。
   *
   * @returns {this} 当前图形的深拷贝实例
   *
   * @example
   * ```typescript
   * const copy = graph.copy();
   * ```
   */
  public abstract copy(): this

  /**
   * 更新图形包围盒
   *
   * 根据当前控制点重新计算轴对齐包围盒（AABB），应在控制点变更后调用。
   *
   * @returns {Bounds} 更新后的包围盒
   *
   * @example
   * ```typescript
   * graph.setControlPoint(0, newPoint);
   * const bounds = graph.updateBounds();
   * ```
   */
  public abstract updateBounds(): Bounds

  /**
   * 约束布局（可选重写）
   *
   * 子类可重写此方法以实现约束布局逻辑。默认实现为空操作。
   * 当图形需要根据约束边界和测量上下文调整自身尺寸时，
   * 应重写此方法并返回调整后的图形实例。
   *
   * @param _constraintBounds - {Bounds | undefined} 约束边界，表示可用空间
   * @param _measureCtx - {IDrawingContext | undefined} 测量上下文，用于文本测量等
   * @returns {Graph | void} 调整后的图形实例，或无返回值
   *
   * @example
   * ```typescript
   * // 子类重写示例
   * class MyGraph extends Graph {
   *   layout(constraintBounds?: Bounds, measureCtx?: IDrawingContext): Graph | void {
   *     // 根据约束调整自身尺寸
   *     this.bounds = constraintBounds ?? this.bounds;
   *     return this;
   *   }
   * }
   * ```
   */
  public layout(_constraintBounds?: Bounds, _measureCtx?: IDrawingContext): Graph | void {}

  /**
   * 判断图形是否为严格封闭图形（首尾相连的闭合路径）
   *
   * @returns {boolean} 图形是否闭合
   *
   * @example
   * ```typescript
   * circle.isClosed(); // true
   * line.isClosed();   // false
   * ```
   */
  public abstract isClosed(): boolean

  /**
   * 判断点是否在图形内部
   *
   * 使用 Canvas 2D 的 `isPointInPath` API 进行判断，采用 nonzero 填充规则。
   * 必须传入 `bufferCtx`（离屏缓冲区上下文）以避免依赖全局 CanvasContext，
   * 这样可以在多画布场景下安全使用。
   *
   * @param p - {Point3} 本地坐标系下的目标点
   * @param bufferCtx - {IDrawingContext | null | undefined} 离屏缓冲区上下文，
   *   必须传入，否则抛出异常
   * @returns {Boolean} 点是否在图形路径内部
   * @throws {Error} 当未传入 `bufferCtx` 时抛出
   *
   * @example
   * ```typescript
   * const bufferCanvas = document.createElement('canvas');
   * const bufferCtx = bufferCanvas.getContext('2d')!;
   * const isIn = graph.isPointInPath(new Point3(50, 50, 0), bufferCtx);
   * ```
   */
  public isPointInPath(p: Point3, bufferCtx?: IDrawingContext | null): boolean {
    const ctx = bufferCtx
    if (!ctx) throw new Error('isPointInPath: 需要传入 bufferCtx')
    ctx.save()
    this.renderPath(ctx, true)
    const isIn = ctx.isPointInPath(p.x, p.y, 'nonzero')
    ctx.strokeStyle = '#F00'
    ctx.stroke()
    ctx.restore()
    return isIn
  }

  /**
   * 获取图形上指定参数 t 处的点
   *
   * 参数 `t` 通常在 `[0, 1]` 范围内，`t=0` 对应图形起点，`t=1` 对应图形终点。
   * 不同子类有不同的参数化方式：
   * - `Line`：线性插值
   * - `Arc`：角度参数映射
   * - `Bezier`：De Casteljau 算法
   *
   * @param t - {number} 参数值，通常在 `[0, 1]` 范围内
   * @returns {Point3} 参数 t 对应的图形上的点
   *
   * @example
   * ```typescript
   * const point = graph.getPointAt(0.5); // 图形中点
   * ```
   */
  public abstract getPointAt(t: number): Point3

  /**
   * 获取图形上指定参数 t 处的切线向量
   *
   * @param t - {number} 参数值，范围 `[0, 1]`
   * @returns {Vector3} 切线方向向量（子类决定是否归一化）
   *
   * @example
   * ```typescript
   * const tangent = graph.getTangentAt(0.5);
   * ```
   */
  public abstract getTangentAt(t: number): Vector3

  /**
   * 获取图形上指定参数 t 处的法向量
   *
   * 法向量垂直于切线方向，具体旋转方向由子类决定。
   *
   * @param t - {number} 参数值，范围 `[0, 1]`
   * @returns {Vector3} 法向量
   *
   * @example
   * ```typescript
   * const normal = graph.getNormalAt(0.5);
   * ```
   */
  public abstract getNormalAt(t: number): Vector3

  /**
   * 计算点到图形的最短距离，并返回最近点信息
   *
   * @param point - {Point3} 目标点
   * @returns {{ distance: number; closestPoint: Point3; parameter: number }}
   *   - `distance`：目标点到最近点的欧氏距离
   *   - `closestPoint`：图形上距离目标点最近的点
   *   - `parameter`：最近点对应的参数 t，范围 `[0, 1]`
   *
   * @example
   * ```typescript
   * const result = graph.getClosestPoint(new Point3(50, 50, 0));
   * console.log(result.distance, result.parameter);
   * ```
   */
  public abstract getClosestPoint(point: Point3): {
    distance: number
    closestPoint: Point3
    parameter: number
  }

  /**
   * 计算图形在指定参数范围内的弧长
   *
   * @param tStart - {number} 起始参数，范围 `[0, 1]`
   * @param tEnd - {number} 结束参数，范围 `[0, 1]`
   * @returns {number} 指定参数范围内的弧长
   *
   * @example
   * ```typescript
   * const length = graph.getLength(0, 0.5); // 前半段弧长
   * ```
   */
  public abstract getLength(tStart: number, tEnd: number): number

  /**
   * 计算图形的总长度
   *
   * 这是对 `getLength(0, 1)` 的便捷封装，返回图形从起点到终点的完整弧长。
   *
   * @returns {number} 图形的总长度
   *
   * @example
   * ```typescript
   * const totalLength = graph.getTotalLength();
   * // 等价于 graph.getLength(0, 1)
   * ```
   */
  public getTotalLength(): number {
    return this.getLength(0, 1)
  }

  /**
   * 检查点是否在图形上（基于最近点距离判断）
   *
   * 通过 `getClosestPoint` 计算目标点到图形的最短距离，
   * 当距离小于等于容差 `tolerance` 时，认为点在图形上。
   *
   * @param point - {Point3} 目标点
   * @param tolerance - {number} 容差，默认为 `MathUtils.EPSILON`
   * @returns {boolean} 点是否在图形上（距离在容差范围内）
   *
   * @example
   * ```typescript
   * const line = new Line(new Point3(0, 0, 0), new Point3(100, 0, 0));
   * line.isPointOnCurve(new Point3(50, 0, 0));      // true
   * line.isPointOnCurve(new Point3(50, 0.001, 0));  // true（在容差内）
   * line.isPointOnCurve(new Point3(50, 10, 0));     // false
   * ```
   */
  public isPointOnCurve(point: Point3, tolerance: number = MathUtils.EPSILON): boolean {
    const { distance } = this.getClosestPoint(point)
    return distance <= tolerance
  }

  /**
   * 计算图形的面积
   *
   * 仅对封闭图形有意义，开放路径调用此方法通常抛出异常。
   *
   * @returns {number} 图形的面积
   * @throws {Error} 当图形为开放路径时抛出
   *
   * @example
   * ```typescript
   * circle.getArea(); // π × r²
   * line.getArea();   // 抛出 Error
   * ```
   */
  public abstract getArea(): number

  /**
   * 计算图形的质心
   *
   * @returns {Point3} 图形的质心坐标
   *
   * @example
   * ```typescript
   * const centroid = graph.getCentroid();
   * ```
   */
  public abstract getCentroid(): Point3

  /**
   * 应用变换矩阵到图形
   *
   * 将变换矩阵作用于图形的控制点，就地修改图形的几何形状，
   * 并重新计算包围盒。
   *
   * @param matrix - {Matrix4} 4×4 变换矩阵
   * @returns {Graph} 返回变换后的图形
   *
   * @example
   * ```typescript
   * const matrix = Matrix4.identity().translate(new Vector3(50, 0, 0));
   * graph.transform(matrix); // 图形向右平移 50
   * ```
   */
  public abstract transform(matrix: Matrix4): Graph

  /**
   * 计算与另一个图形的相交点
   *
   * @param other - {Graph} 另一个图形
   * @returns {Point3[]} 相交点数组，无交点时返回空数组
   *
   * @example
   * ```typescript
   * const intersections = graph1.intersect(graph2);
   * ```
   */
  public abstract intersect(other: Graph): Point3[]

  /**
   * 按比例缩放调整图形尺寸
   *
   * 以 `fixedPoint` 为锚点，根据 `dynamicPoint` 与 `fixedPoint` 构成的参考尺寸
   * 和 `resizeVector` 指定的增量，对图形控制点按距离比例进行缩放位移。
   *
   * @param fixedPoint - {Point3} 缩放锚点（固定不动的参考点）
   * @param dynamicPoint - {Point3} 动态参考点（与锚点共同确定原始尺寸）
   * @param resizeVector - {Vector3} 缩放增量向量（宽高方向的变化量）
   *
   * @example
   * ```typescript
   * graph.resize(
   *   new Point3(0, 0, 0),    // 锚点
   *   new Point3(100, 50, 0), // 原始对角点
   *   new Vector3(20, 10, 0), // 宽增20、高增10
   * );
   * ```
   */
  public abstract resize(fixedPoint: Point3, dynamicPoint: Point3, resizeVector: Vector3): void

  /**
   * 设置指定索引的控制点，并触发图形内部状态更新
   *
   * 各子类根据自身约束实现（如矩形需联动其他顶点保持直角）。
   * 修改后自动重新计算包围盒。
   *
   * @param index - {number} 控制点索引
   * @param point - {Point3} 新的控制点坐标（局部坐标系，内部会复制一份）
   *
   * @example
   * ```typescript
   * graph.setControlPoint(0, new Point3(10, 20, 0)); // 设置第一个控制点
   * ```
   */
  public abstract setControlPoint(index: number, point: Point3): void
}
