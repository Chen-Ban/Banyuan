import { GraphType } from "@/foundation/constants";
import Style from "@/foundation/style/Style";
import { Point3 } from "@/foundation/math";
import Polygon from "./Polygon";
import Bounds from "@/graph/base/Bounds";
import { IRectangle, ISerializable } from "@/types";
import { generateId } from "@/foundation/utils";

/**
 * 矩形 —— 轴对齐的四边形，具有宽度和高度约束。
 *
 * Rectangle 继承自 {@link Polygon}，实现了 {@link IRectangle} 和 {@link ISerializable} 接口，
 * 是 BanvasGL 中最常用的基本图形之一。
 *
 * **架构位置**：位于 `graph/combined/Polygon` 层，继承自 Polygon，
 * 与 Quadrilateral（自由四边形）同为四边形的两种实现。
 * Rectangle 额外维护 `width` 和 `height` 属性，保证四顶点始终构成轴对齐矩形。
 *
 * **核心特性**：
 * - 轴对齐约束：四顶点始终构成水平/垂直对齐的矩形
 * - 对角固定策略：拖拽某顶点时，对角顶点固定，相邻顶点各取一个轴跟随
 * - 支持完整的几何计算：面积、周长、对角线、宽高比
 * - 支持多种静态工厂方法：正方形、中心点创建、黄金比例矩形等
 *
 * **控制点布局**（4 个顶点，顺时针）：
 *   0=左上，1=右上，2=右下，3=左下
 *
 * **setControlPoint 联动逻辑**：
 * - 拖 0(左上)：顶点1.y = 新y，顶点3.x = 新x，顶点2(对角)不变
 * - 拖 1(右上)：顶点0.y = 新y，顶点2.x = 新x，顶点3(对角)不变
 * - 拖 2(右下)：顶点3.y = 新y，顶点1.x = 新x，顶点0(对角)不变
 * - 拖 3(左下)：顶点2.y = 新y，顶点0.x = 新x，顶点1(对角)不变
 *
 * @example
 * ```ts
 * const rect = new Rectangle(10, 20, 200, 100, style);
 * console.log(rect.width, rect.height); // 200, 100
 * ```
 */
export default class Rectangle
  extends Polygon
  implements IRectangle, ISerializable
{
  /** 图形类型标识 */
  public type: GraphType = GraphType.RECTANGLE;

  /** 矩形宽度 */
  public width: number;

  /** 矩形高度 */
  public height: number;

  /**
   * 创建一个矩形实例。
   *
   * @param {number} x - 左上角 x 坐标
   * @param {number} y - 左上角 y 坐标
   * @param {number} width - 宽度
   * @param {number} height - 高度
   * @param {Style} [style] - 图形样式
   *
   * @example
   * ```ts
   * const rect = new Rectangle(10, 20, 200, 100, style);
   * ```
   */
  constructor(
    x: number,
    y: number,
    width: number,
    height: number,
    _style?: Style,
  ) {
    const points = [
      new Point3(x, y, 0),
      new Point3(x + width, y, 0),
      new Point3(x + width, y + height, 0),
      new Point3(x, y + height, 0),
    ];
    super(points, undefined, true);
    this.width = width;
    this.height = height;
    this.id = generateId(this.type);
  }

  /**
   * 获取矩形的左上角坐标。
   *
   * @returns {Point3} 左上角坐标的拷贝
   *
   * @example
   * ```ts
   * const topLeft = rect.getTopLeft();
   * console.log(topLeft.x, topLeft.y); // 10, 20
   * ```
   */
  public getTopLeft(): Point3 {
    return this.controlPoints[0].copy();
  }

  /**
   * 获取矩形的右下角坐标。
   *
   * @returns {Point3} 右下角坐标的拷贝
   *
   * @example
   * ```ts
   * const bottomRight = rect.getBottomRight();
   * ```
   */
  public getBottomRight(): Point3 {
    return this.controlPoints[2].copy();
  }

  /**
   * 获取矩形的几何中心点。
   *
   * @returns {Point3} 中心点坐标
   *
   * @example
   * ```ts
   * const center = rect.getCenter();
   * ```
   */
  public getCenter(): Point3 {
    const topLeft = this.getTopLeft();
    return new Point3(
      topLeft.x + this.width / 2,
      topLeft.y + this.height / 2,
      topLeft.z,
    );
  }

  /**
   * 设置矩形的位置（左上角坐标）。
   *
   * 保持宽高不变，移动到新的位置。
   *
   * @param {number} x - 新的左上角 x 坐标
   * @param {number} y - 新的左上角 y 坐标
   * @returns {Rectangle} 当前实例（支持链式调用）
   *
   * @example
   * ```ts
   * rect.setPosition(50, 30);
   * ```
   */
  public setPosition(x: number, y: number): Rectangle {
    this.controlPoints = [
      new Point3(x, y, 0),
      new Point3(x + this.width, y, 0),
      new Point3(x + this.width, y + this.height, 0),
      new Point3(x, y + this.height, 0),
    ];
    this.rebuildEdges();
    return this;
  }

  /**
   * 设置矩形的尺寸。
   *
   * 保持左上角位置不变，更新宽高并重建边线。
   *
   * @param {number} width - 新的宽度
   * @param {number} height - 新的高度
   * @returns {Rectangle} 当前实例（支持链式调用）
   *
   * @example
   * ```ts
   * rect.setSize(300, 200);
   * ```
   */
  public setSize(width: number, height: number): Rectangle {
    this.width = width;
    this.height = height;
    const { x, y } = this.controlPoints[0];
    this.controlPoints = [
      new Point3(x, y, 0),
      new Point3(x + this.width, y, 0),
      new Point3(x + this.width, y + this.height, 0),
      new Point3(x, y + this.height, 0),
    ];

    this.rebuildEdges();
    this.bounds = this.updateBounds();

    return this;
  }

  /**
   * 移动矩形（相对偏移）。
   *
   * @param {number} dx - x 方向偏移量
   * @param {number} dy - y 方向偏移量
   * @returns {Rectangle} 当前实例（支持链式调用）
   *
   * @example
   * ```ts
   * rect.move(10, 20); // 右移 10，下移 20
   * ```
   */
  public move(dx: number, dy: number): Rectangle {
    const topLeft = this.getTopLeft();
    this.setPosition(topLeft.x + dx, topLeft.y + dy);
    return this;
  }

  /**
   * 计算矩形的面积。
   *
   * @returns {number} 面积 = width × height
   *
   * @example
   * ```ts
   * const area = rect.getArea();
   * console.log(area); // 200 * 100 = 20000
   * ```
   */
  public getArea(): number {
    return this.width * this.height;
  }

  /**
   * 计算矩形的周长。
   *
   * @returns {number} 周长 = 2 × (width + height)
   *
   * @example
   * ```ts
   * const perimeter = rect.getPerimeter();
   * ```
   */
  public getPerimeter(): number {
    return 2 * (this.width + this.height);
  }

  /**
   * 计算矩形的对角线长度。
   *
   * 使用勾股定理：\( d = \sqrt{w^2 + h^2} \)
   *
   * @returns {number} 对角线长度
   *
   * @example
   * ```ts
   * const diagonal = rect.getDiagonal();
   * ```
   */
  public getDiagonal(): number {
    return Math.sqrt(this.width * this.width + this.height * this.height);
  }

  /**
   * 获取矩形的宽高比。
   *
   * @returns {number} 宽高比 = width / height
   *
   * @example
   * ```ts
   * const ratio = rect.getAspectRatio();
   * ```
   */
  public getAspectRatio(): number {
    return this.width / this.height;
  }

  /**
   * 设置指定索引的控制点，联动更新其他顶点以保持矩形约束。
   *
   * 采用「对角固定」策略：拖拽某顶点时，对角顶点保持不变，
   * 相邻两个顶点各取一个轴跟随新位置，确保四顶点始终构成轴对齐矩形。
   *
   * 顶点布局：0=左上，1=右上，2=右下，3=左下
   * - 拖 0(左上)：顶点1.y = 新y，顶点3.x = 新x，顶点2(对角)不变
   * - 拖 1(右上)：顶点0.y = 新y，顶点2.x = 新x，顶点3(对角)不变
   * - 拖 2(右下)：顶点3.y = 新y，顶点1.x = 新x，顶点0(对角)不变
   * - 拖 3(左下)：顶点2.y = 新y，顶点0.x = 新x，顶点1(对角)不变
   *
   * @param {number} index - 控制点索引（0-3）
   * @param {Point3} point - 新的控制点坐标
   *
   * @example
   * ```ts
   * // 拖拽左上角到新位置
   * rect.setControlPoint(0, new Point3(5, 10, 0));
   * ```
   */
  public override setControlPoint(index: number, point: Point3): void {
    if (index < 0 || index >= 4) return;

    const v = this.controlPoints;
    switch (index) {
      case 0: // 左上 → 对角是右下(2)
        this.controlPoints = [
          new Point3(point.x, point.y, 0),
          new Point3(v[2].x, point.y, 0),
          new Point3(v[2].x, v[2].y, 0),
          new Point3(point.x, v[2].y, 0),
        ];
        break;
      case 1: // 右上 → 对角是左下(3)
        this.controlPoints = [
          new Point3(v[3].x, point.y, 0),
          new Point3(point.x, point.y, 0),
          new Point3(point.x, v[3].y, 0),
          new Point3(v[3].x, v[3].y, 0),
        ];
        break;
      case 2: // 右下 → 对角是左上(0)
        this.controlPoints = [
          new Point3(v[0].x, v[0].y, 0),
          new Point3(point.x, v[0].y, 0),
          new Point3(point.x, point.y, 0),
          new Point3(v[0].x, point.y, 0),
        ];
        break;
      case 3: // 左下 → 对角是右上(1)
        this.controlPoints = [
          new Point3(point.x, v[1].y, 0),
          new Point3(v[1].x, v[1].y, 0),
          new Point3(v[1].x, point.y, 0),
          new Point3(point.x, point.y, 0),
        ];
        break;
    }

    // 重新计算 width/height（允许负值翻转后取绝对值）
    this.width = Math.abs(this.controlPoints[2].x - this.controlPoints[0].x);
    this.height = Math.abs(this.controlPoints[2].y - this.controlPoints[0].y);
    this.rebuildEdges();
    this.bounds = this.updateBounds();
  }

  // ── 序列化 ──

  /**
   * 将矩形序列化为 JSON 对象。
   *
   * 以左上角坐标 + 宽高格式存储，比存储四个顶点更紧凑。
   *
   * @returns {any} 包含 id、type、x、y、width、height、style 的 JSON 对象
   *
   * @example
   * ```ts
   * const json = rect.toJSON();
   * // json = { id: '...', type: GraphType.RECTANGLE, x: 10, y: 20, width: 200, height: 100, style: {...} }
   * ```
   */
  public toJSON(): any {
    const topLeft = this.getTopLeft();
    return {
      id: this.id,
      type: this.type,
      x: topLeft.x,
      y: topLeft.y,
      width: this.width,
      height: this.height,
    };
  }

  /**
   * 从 JSON 数据重建 Rectangle 实例。
   *
   * @param {any} data - 序列化数据，需包含 x、y、width、height、style
   * @returns {Rectangle} 重建的矩形实例
   *
   * @example
   * ```ts
   * const rect = Rectangle.fromJSON({ id: '...', type: 0, x: 10, y: 20, width: 200, height: 100, style: {...} });
   * ```
   */
  public static fromJSON(data: any): Rectangle {
    const rect = new Rectangle(
      data.x,
      data.y,
      data.width,
      data.height,
      undefined,
    );
    rect.id = data.id;
    return rect;
  }

  /**
   * 复制矩形，返回一个深拷贝的新实例。
   *
   * @returns {this} 复制后的矩形实例
   *
   * @example
   * ```ts
   * const copy = rect.copy();
   * ```
   */
  public copy(): this {
    const topLeft = this.getTopLeft();
    return new Rectangle(
      topLeft.x,
      topLeft.y,
      this.width,
      this.height,
      undefined,
    ) as this;
  }

  /**
   * 创建正方形（静态工厂方法）。
   *
   * @param {number} x - 左上角 x 坐标
   * @param {number} y - 左上角 y 坐标
   * @param {number} size - 边长
   * @param {Style} [style] - 图形样式
   * @returns {Rectangle} 正方形实例
   *
   * @example
   * ```ts
   * const square = Rectangle.createSquare(0, 0, 100, style);
   * ```
   */
  public static createSquare(
    x: number,
    y: number,
    size: number,
    _style?: Style,
  ): Rectangle {
    return new Rectangle(x, y, size, size, undefined);
  }

  /**
   * 从中心点创建矩形（静态工厂方法）。
   *
   * @param {number} centerX - 中心点 x 坐标
   * @param {number} centerY - 中心点 y 坐标
   * @param {number} width - 宽度
   * @param {number} height - 高度
   * @param {Style} [style] - 图形样式
   * @returns {Rectangle} 矩形实例
   *
   * @example
   * ```ts
   * const rect = Rectangle.createFromCenter(150, 100, 200, 100, style);
   * ```
   */
  public static createFromCenter(
    centerX: number,
    centerY: number,
    width: number,
    height: number,
    _style?: Style,
  ): Rectangle {
    return new Rectangle(
      centerX - width / 2,
      centerY - height / 2,
      width,
      height,
      undefined,
    );
  }

  /**
   * 创建黄金比例矩形（静态工厂方法）。
   *
   * 黄金比例 φ = (1 + √5) / 2 ≈ 1.618，高度 = 宽度 / φ。
   *
   * @param {number} x - 左上角 x 坐标
   * @param {number} y - 左上角 y 坐标
   * @param {number} width - 宽度
   * @param {Style} [style] - 图形样式
   * @returns {Rectangle} 黄金比例矩形实例
   *
   * @example
   * ```ts
   * const golden = Rectangle.createGoldenRatio(0, 0, 200, style);
   * ```
   */
  public static createGoldenRatio(
    x: number,
    y: number,
    width: number,
    _style?: Style,
  ): Rectangle {
    const goldenRatio = (1 + Math.sqrt(5)) / 2;
    const height = width / goldenRatio;
    return new Rectangle(x, y, width, height, undefined);
  }

  /**
   * 从 Bounds 对象创建矩形（静态工厂方法）。
   *
   * @param {Bounds} bounds - 边界框对象
   * @param {Style} [style] - 图形样式
   * @returns {Rectangle} 对应的矩形实例
   *
   * @example
   * ```ts
   * const rect = Rectangle.fromBounds(someGraph.bounds, style);
   * ```
   */
  public static fromBounds(bounds: Bounds, _style?: Style): Rectangle {
    return new Rectangle(
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      undefined,
    );
  }
}
