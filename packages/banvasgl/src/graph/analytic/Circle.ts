import { GraphType } from "@/foundation/constants";
import Arc from "./Arc";
import { MathUtils, Point3, Vector3 } from "@/foundation/math";
import { Style } from "@/foundation/style";
import type { ICircle } from '@/types/graph/graph'
import type { ISerializable } from '@/types/foundation/serializable'
import type { IDrawingContext } from '@/types/platform/drawing.js'

/**
 * 圆形图形
 *
 * `Circle` 继承自 `Arc`（椭圆弧），通过保持 `xRadius === yRadius` 约束
 * 将椭圆弧特化为圆形。圆是完整闭合的椭圆弧（startAngle=0, endAngle=2π, rotation=0）。
 *
 * **与 Arc 的关键区别：**
 * - `getLength` 重写为 O(1) 精确计算（周长公式 `2πr`），跳过父类的 Simpson 数值积分
 * - `resize` 取两轴缩放比均值保持圆形，而非独立缩放 X/Y 半径
 * - `render` 重写以支持填充（`ctx.fill()`），因为圆形始终闭合
 * - 提供丰富的静态工厂方法，支持从直径、周长、面积、两点、三点创建圆形
 *
 * @example
 * ```typescript
 * const circle = new Circle(new Point3(100, 100, 0), 50);
 * circle.getArea();       // π × 50² ≈ 7853.98
 * circle.getLength(0, 1); // 2π × 50 ≈ 314.16
 *
 * // 工厂方法
 * const fromDiameter = Circle.fromDiameter(100, 100, 100);
 * const fromThreePts = Circle.fromThreePoints(p1, p2, p3);
 * ```
 */
export default class Circle extends Arc implements ICircle, ISerializable {
  /**
   * 图形类型标识，固定为 `GraphType.CIRCLE`
   */
  public type: GraphType = GraphType.CIRCLE;

  /**
   * 创建一个圆形
   *
   * 内部调用父类 `Arc` 构造函数，传入 `xRadius === yRadius === radius`、
   * `rotation = 0`、`startAngle = 0`、`endAngle = 2π`，创建完整闭合圆。
   *
   * @param center - {Point3} 圆心坐标
   * @param radius - {number} 圆的半径，非负值
   * @param style - {Style} 线条/填充样式，默认为 `Style.DEFAULT`
   *
   * @example
   * ```typescript
   * const circle = new Circle(new Point3(100, 100, 0), 50);
   * ```
   */
  constructor(center: Point3, radius: number, _style?: Style) {
    // 调用父类构造函数，创建完整圆（0 到 2π）
    // 对于圆，xRadius 和 yRadius 相等，rotation 为 0
    super(center, radius, radius, 0, 0, 2 * Math.PI, false);
  }

  /**
   * 设置圆的半径（同时维护 xRadius === yRadius 约束）
   *
   * 修改半径后自动重新计算控制点和包围盒。
   *
   * @param radius - {number} 新的半径，负值会被裁为 0
   * @returns {Circle} 返回 `this`，支持链式调用
   *
   * @example
   * ```typescript
   * circle.setRadius(80);
   * ```
   */
  setRadius(radius: number): Circle {
    this.xRadius = Math.max(0, radius);
    this.yRadius = Math.max(0, radius);
    this.controlPoints = this.calculateControlPoints();
    this.bounds = this.updateBounds();
    return this;
  }

  /**
   * 获取圆的直径
   *
   * 计算方式：`2 × xRadius`（圆形的 xRadius === yRadius === radius）。
   *
   * @returns {number} 圆的直径
   *
   * @example
   * ```typescript
   * const circle = new Circle(center, 50);
   * console.log(circle.diameter); // 100
   * ```
   */
  get diameter(): number {
    return 2 * this.xRadius;
  }

  /**
   * 计算圆形在指定参数范围内的弧长（O(1) 精确计算）
   *
   * 重写父类 `Arc.getLength` 的 Simpson 数值积分，使用周长公式直接计算。
   * 圆的弧长与参数 t 呈线性关系：`L = 2πr × |tEnd - tStart|`。
   *
   * @param tStart - {number} 起始参数，范围 `[0, 1]`
   * @param tEnd - {number} 终止参数，范围 `[0, 1]`
   * @returns {number} 指定参数范围内的弧长
   *
   * @example
   * ```typescript
   * const circle = new Circle(center, 50);
   * circle.getLength(0, 1);   // 2π × 50 ≈ 314.16（完整周长）
   * circle.getLength(0, 0.5); // π × 50 ≈ 157.08（半圆弧长）
   * ```
   */
  public getLength(tStart: number, tEnd: number): number {
    return 2 * Math.PI * this.xRadius * Math.abs(tEnd - tStart);
  }

  /**
   * 按比例缩放调整圆形尺寸（保持 xRadius === yRadius 的圆形约束）
   *
   * 重写父类 `Arc.resize`，取两轴缩放比的均值作为统一缩放比，
   * 确保缩放后仍为圆形（xRadius === yRadius）。
   *
   * @param fixedPoint - {Point3} 缩放锚点（固定不动的参考点）
   * @param dynamicPoint - {Point3} 动态参考点（与锚点共同确定原始尺寸）
   * @param resizeVector - {Vector3} 缩放增量向量（宽高方向的变化量）
   *
   * @example
   * ```typescript
   * circle.resize(
   *   new Point3(0, 0, 0),    // 锚点
   *   new Point3(100, 100, 0), // 原始对角点
   *   new Vector3(20, 20, 0),  // 等比增量，保持圆形
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

    // 半径取两轴缩放比的均值，保持圆形
    const newWidth = width + resizeVector.x * Math.sign(referenceVector.x);
    const newHeight = height + resizeVector.y * Math.sign(referenceVector.y);
    const ratioX = Math.abs(newWidth / width);
    const ratioY = Math.abs(newHeight / height);
    const ratio = (ratioX + ratioY) / 2;

    const newRadius = Math.max(0, this.xRadius * ratio);
    this.xRadius = newRadius;
    this.yRadius = newRadius;

    this.controlPoints = this.calculateControlPoints();
    this.bounds = this.updateBounds();
  }

  /**
   * 渲染圆形（重写父类方法以支持填充）
   *
   * 与 `Arc.render` 不同，圆形始终为闭合路径，因此同时执行 `fill()` 和 `stroke()`。
   *
   * @param ctx - {IDrawingContext} Canvas 2D 渲染上下文
   *
   * @example
   * ```typescript
   * const circle = new Circle(center, 50, new Style({ fillColor: '#ff0000' }));
   * circle.render(ctx); // 填充 + 描边
   * ```
   */
  public render(ctx: IDrawingContext, style: Style): void {
    ctx.save();
    const bounds = this.bounds;
    style.applyToContext(ctx, Math.abs(bounds.width), Math.abs(bounds.height));

    ctx.beginPath();
    this.renderPath(ctx, true);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // ── 序列化 ──

  /**
   * 将圆形序列化为 JSON 对象
   *
   * 输出结构包含 `id`、`type`、`center`、`radius` 和 `style`。
   *
   * @returns {{ id: string; type: GraphType; center: any; radius: number; style: any }}
   *   可 JSON 化的纯对象
   *
   * @example
   * ```typescript
   * const json = circle.toJSON();
   * // { id: 'circle_xxx', type: 4, center: {...}, radius: 50, style: {...} }
   * ```
   */
  toJSON(): any {
    return {
      id: this.id,
      type: this.type,
      center: this.center.toJSON(),
      radius: this.xRadius,
    }
  }

  /**
   * 从 JSON 对象反序列化创建圆形实例
   *
   * 兼容 `radius` 和 `xRadius` 两种字段名（`data.radius ?? data.xRadius`）。
   *
   * @param data - {any} 序列化数据对象，需包含 `center`、`radius`（或 `xRadius`）、
   *   `style` 和可选的 `id`
   * @returns {Circle} 还原后的圆形实例
   *
   * @example
   * ```typescript
   * const circle = Circle.fromJSON({
   *   id: 'circle_abc',
   *   type: GraphType.CIRCLE,
   *   center: { x: 100, y: 100, z: 0 },
   *   radius: 50,
   *   style: { strokeColor: '#000' },
   * });
   * ```
   */
  static fromJSON(data: any): Circle {
    const circle = new Circle(
      Point3.fromJSON(data.center),
      data.radius ?? data.xRadius,
    );
    circle.id = data.id;
    return circle;
  }

  /**
   * 复制圆形
   *
   * 创建当前圆形的深拷贝，包括圆心坐标和样式的独立副本。
   *
   * @returns {this} 当前圆形的深拷贝实例
   *
   * @example
   * ```typescript
   * const copied = circle.copy();
   * copied.setRadius(100); // 不影响原圆形
   * ```
   */
  public copy(): this {
    return new Circle(this.center.copy(), this.xRadius) as this;
  }

  // ── 静态工厂方法 ──

  /**
   * 从圆心坐标和半径创建圆形
   *
   * @param centerX - {number} 圆心 x 坐标
   * @param centerY - {number} 圆心 y 坐标
   * @param radius - {number} 半径
   * @param style - {Style} 样式，默认 `Style.DEFAULT`
   * @returns {Circle} 新的圆形实例
   *
   * @example
   * ```typescript
   * const circle = Circle.fromCenterAndRadius(100, 100, 50);
   * ```
   */
  static fromCenterAndRadius(
    centerX: number,
    centerY: number,
    radius: number,
  ): Circle {
    return new Circle(new Point3(centerX, centerY, 0), radius);
  }

  /**
   * 从圆心坐标和直径创建圆形
   *
   * @param centerX - {number} 圆心 x 坐标
   * @param centerY - {number} 圆心 y 坐标
   * @param diameter - {number} 直径（半径 = diameter / 2）
   * @param style - {Style} 样式，默认 `Style.DEFAULT`
   * @returns {Circle} 新的圆形实例
   *
   * @example
   * ```typescript
   * const circle = Circle.fromDiameter(100, 100, 100); // 半径 50
   * ```
   */
  static fromDiameter(centerX: number, centerY: number, diameter: number): Circle {
    return new Circle(new Point3(centerX, centerY, 0), diameter / 2);
  }

  /**
   * 从圆心坐标和周长创建圆形
   *
   * 半径 = circumference / (2π)
   *
   * @param centerX - {number} 圆心 x 坐标
   * @param centerY - {number} 圆心 y 坐标
   * @param circumference - {number} 周长
   * @param style - {Style} 样式，默认 `Style.DEFAULT`
   * @returns {Circle} 新的圆形实例
   *
   * @example
   * ```typescript
   * const circle = Circle.fromCircumference(100, 100, 314.16); // 半径 ≈ 50
   * ```
   */
  static fromCircumference(
    centerX: number,
    centerY: number,
    circumference: number,
  ): Circle {
    const radius = circumference / (2 * Math.PI);
    return new Circle(new Point3(centerX, centerY, 0), radius);
  }

  /**
   * 从圆心坐标和面积创建圆形
   *
   * 半径 = √(area / π)
   *
   * @param centerX - {number} 圆心 x 坐标
   * @param centerY - {number} 圆心 y 坐标
   * @param area - {number} 面积
   * @param style - {Style} 样式，默认 `Style.DEFAULT`
   * @returns {Circle} 新的圆形实例
   *
   * @example
   * ```typescript
   * const circle = Circle.fromArea(100, 100, 7853.98); // 半径 ≈ 50
   * ```
   */
  static fromArea(centerX: number, centerY: number, area: number): Circle {
    const radius = Math.sqrt(area / Math.PI);
    return new Circle(new Point3(centerX, centerY, 0), radius);
  }

  /**
   * 从两点创建圆形（两点连线为直径）
   *
   * 圆心为两点连线的中点，半径为两点距离的一半。
   *
   * @param point1 - {Point3} 直径的第一个端点
   * @param point2 - {Point3} 直径的第二个端点
   * @param style - {Style} 样式，默认 `Style.DEFAULT`
   * @returns {Circle} 新的圆形实例
   *
   * @example
   * ```typescript
   * const circle = Circle.fromTwoPoints(
   *   new Point3(50, 100, 0),
   *   new Point3(150, 100, 0),
   * ); // 圆心 (100, 100)，半径 50
   * ```
   */
  static fromTwoPoints(point1: Point3, point2: Point3): Circle {
    const center = new Point3((point1.x + point2.x) / 2, (point1.y + point2.y) / 2, (point1.z + point2.z) / 2);
    const radius = Math.sqrt(Math.pow(point2.x - point1.x, 2) + Math.pow(point2.y - point1.y, 2)) / 2;
    return new Circle(center, radius);
  }

  /**
   * 从三点创建圆形（外接圆）
   *
   * 根据三点确定唯一外接圆。使用行列式方法计算圆心和半径：
   * - 圆心通过解三点外接圆方程得到
   * - 半径为圆心到任一点的距离
   * - 三点共线时（行列式为 0），返回一个极小圆（半径 0.1）
   *
   * @param point1 - {Point3} 第一个点
   * @param point2 - {Point3} 第二个点
   * @param point3 - {Point3} 第三个点
   * @param style - {Style} 样式，默认 `Style.DEFAULT`
   * @returns {Circle} 新的圆形实例（三点共线时返回极小圆）
   *
   * @example
   * ```typescript
   * const circle = Circle.fromThreePoints(
   *   new Point3(0, 0, 0),
   *   new Point3(100, 0, 0),
   *   new Point3(50, 50, 0),
   * );
   * ```
   */
  static fromThreePoints(point1: Point3, point2: Point3, point3: Point3): Circle {
    // 计算三点确定的圆的中心点和半径
    const x1 = point1.x,
      y1 = point1.y;
    const x2 = point2.x,
      y2 = point2.y;
    const x3 = point3.x,
      y3 = point3.y;

    const a = x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2);
    const b = (x1 * x1 + y1 * y1) * (y3 - y2) + (x2 * x2 + y2 * y2) * (y1 - y3) + (x3 * x3 + y3 * y3) * (y2 - y1);
    const c = (x1 * x1 + y1 * y1) * (x2 - x3) + (x2 * x2 + y2 * y2) * (x3 - x1) + (x3 * x3 + y3 * y3) * (x1 - x2);

    if (Math.abs(a) < MathUtils.FLOAT_EPSILON) {
      // 三点共线，返回一个很小的圆
      return new Circle(new Point3(0, 0, 0), 0.1);
    }

    const centerX = -b / (2 * a);
    const centerY = -c / (2 * a);
    const radius = Math.sqrt(Math.pow(x1 - centerX, 2) + Math.pow(y1 - centerY, 2));

    return new Circle(new Point3(centerX, centerY, 0), radius);
  }

  // ── 预定义圆形 ──

  /**
   * 单位圆：圆心在原点，半径为 1
   *
   * @example
   * ```typescript
   * const unit = Circle.UNIT_CIRCLE;
   * unit.xRadius; // 1
   * ```
   */
  static readonly UNIT_CIRCLE = new Circle(new Point3(0, 0, 0), 1);

  /**
   * 空圆：圆心在原点，半径为 0
   *
   * @example
   * ```typescript
   * const empty = Circle.EMPTY_CIRCLE;
   * empty.xRadius; // 0
   * ```
   */
  static readonly EMPTY_CIRCLE = new Circle(new Point3(0, 0, 0), 0);
}
