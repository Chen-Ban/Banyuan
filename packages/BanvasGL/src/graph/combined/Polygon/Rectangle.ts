import { GRAPHTYPE } from "@/foundation/constants";
import Style from "@/foundation/style/Style";
import { Point3 } from "@/foundation/math";
import Polygon from "./Polygon";
import Bounds from "@/graph/base/Bounds";
import { IRectangle, ISerializable } from '@/types';
import { generateId } from '@/foundation/utils';

/**
 * Rectangle类 - 矩形
 * 继承自Polygon，专门用于创建和管理矩形
 */
export default class Rectangle extends Polygon implements IRectangle, ISerializable {
  public type: GRAPHTYPE = GRAPHTYPE.RECTANGLE;
  public width: number;
  public height: number;

  constructor(x: number, y: number, width: number, height: number, style?: Style) {
    const vertices = [
      new Point3(x, y, 0),
      new Point3(x + width, y, 0),
      new Point3(x + width, y + height, 0),
      new Point3(x, y + height, 0),
    ];
    super(vertices, style, true);
    this.width = width;
    this.height = height;
    this.id = generateId(this.type)
  }

  /**
   * 获取矩形的左上角坐标
   */
  public getTopLeft(): Point3 {
    return this.vertices[0].copy();
  }

  /**
   * 获取矩形的右下角坐标
   */
  public getBottomRight(): Point3 {
    return this.vertices[2].copy();
  }

  /**
   * 获取矩形的中心点
   */
  public getCenter(): Point3 {
    const topLeft = this.getTopLeft();
    return new Point3(topLeft.x + this.width / 2, topLeft.y + this.height / 2, topLeft.z);
  }

  /**
   * 设置矩形位置
   */
  public setPosition(x: number, y: number): Rectangle {
    this.vertices = [
      new Point3(x, y, 0),
      new Point3(x + this.width, y, 0),
      new Point3(x + this.width, y + this.height, 0),
      new Point3(x, y + this.height, 0),
    ];
    this.buildPolygonFromVertices();
    this.updateBounds()
    return this;
  }

  /**
   * 设置矩形大小
   */
  public setSize(width: number, height: number): Rectangle {
    this.width = width;
    this.height = height;
    const { x, y } = this.controlPoints[0]
    this.vertices = [
      new Point3(x, y, 0),
      new Point3(x + this.width, y, 0),
      new Point3(x + this.width, y + this.height, 0),
      new Point3(x, y + this.height, 0),
    ];

    this.buildPolygonFromVertices(width > 0, height > 0);
    this.updateBounds(width > 0, height > 0)

    return this;
  }

  /**
   * 移动矩形
   */
  public move(dx: number, dy: number): Rectangle {
    const topLeft = this.getTopLeft();
    this.setPosition(topLeft.x + dx, topLeft.y + dy);
    return this;
  }

  /**
   * 检查点是否在矩形内
   */
  public containsPoint(point: Point3): boolean {
    const topLeft = this.getTopLeft();
    return (
      point.x >= topLeft.x &&
      point.x <= topLeft.x + this.width &&
      point.y >= topLeft.y &&
      point.y <= topLeft.y + this.height
    );
  }

  /**
   * 检查矩形是否与另一个矩形相交
   */
  public intersects(other: Rectangle): boolean {
    const thisTopLeft = this.getTopLeft();
    const otherTopLeft = other.getTopLeft();

    return !(
      thisTopLeft.x + this.width < otherTopLeft.x ||
      otherTopLeft.x + other.width < thisTopLeft.x ||
      thisTopLeft.y + this.height < otherTopLeft.y ||
      otherTopLeft.y + other.height < thisTopLeft.y
    );
  }

  /**
   * 获取矩形的面积
   */
  public getArea(): number {
    return this.width * this.height;
  }

  /**
   * 获取矩形的周长
   */
  public getPerimeter(): number {
    return 2 * (this.width + this.height);
  }

  /**
   * 获取矩形的对角线长度
   */
  public getDiagonal(): number {
    return Math.sqrt(this.width * this.width + this.height * this.height);
  }

  /**
   * 获取矩形的宽高比
   */
  public getAspectRatio(): number {
    return this.width / this.height;
  }

  /**
   * 设置指定索引的控制点，联动更新其他顶点以保持矩形约束
   *
   * 顶点布局：0=左上，1=右上，2=右下，3=左下
   * 拖拽某顶点时，对角顶点固定，相邻顶点各取一个轴跟随：
   *   拖 0(左上)：顶点1.y = 新y，顶点3.x = 新x，顶点2 不变
   *   拖 1(右上)：顶点0.y = 新y，顶点2.x = 新x，顶点3 不变
   *   拖 2(右下)：顶点3.y = 新y，顶点1.x = 新x，顶点0 不变
   *   拖 3(左下)：顶点2.y = 新y，顶点0.x = 新x，顶点1 不变
   */
  public override setControlPoint(index: number, point: Point3): void {
    if (index < 0 || index >= 4) return

    const v = this.vertices
    switch (index) {
      case 0: // 左上 → 对角是右下(2)
        this.vertices = [
          new Point3(point.x, point.y, 0),
          new Point3(v[2].x,  point.y, 0),
          new Point3(v[2].x,  v[2].y,  0),
          new Point3(point.x, v[2].y,  0),
        ]
        break
      case 1: // 右上 → 对角是左下(3)
        this.vertices = [
          new Point3(v[3].x,  point.y, 0),
          new Point3(point.x, point.y, 0),
          new Point3(point.x, v[3].y,  0),
          new Point3(v[3].x,  v[3].y,  0),
        ]
        break
      case 2: // 右下 → 对角是左上(0)
        this.vertices = [
          new Point3(v[0].x,  v[0].y,  0),
          new Point3(point.x, v[0].y,  0),
          new Point3(point.x, point.y, 0),
          new Point3(v[0].x,  point.y, 0),
        ]
        break
      case 3: // 左下 → 对角是右上(1)
        this.vertices = [
          new Point3(point.x, v[1].y,  0),
          new Point3(v[1].x,  v[1].y,  0),
          new Point3(v[1].x,  point.y, 0),
          new Point3(point.x, point.y, 0),
        ]
        break
    }

    // 重新计算 width/height（允许负值翻转后取绝对值）
    this.width  = Math.abs(this.vertices[2].x - this.vertices[0].x)
    this.height = Math.abs(this.vertices[2].y - this.vertices[0].y)
    this.buildPolygonFromVertices(this.width > 0, this.height > 0)
    this.bounds = this.updateBounds(this.width > 0, this.height > 0)
  }

  // ── 序列化 ──
  public toJSON(): any {
    const topLeft = this.getTopLeft()
    return {
      id: this.id,
      type: this.type,
      x: topLeft.x,
      y: topLeft.y,
      width: this.width,
      height: this.height,
      style: this.style.toJSON(),
    }
  }

  public static fromJSON(data: any): Rectangle {
    const style = Style.fromJSON(data.style)
    const rect = new Rectangle(data.x, data.y, data.width, data.height, style)
    rect.id = data.id
    return rect
  }

  /**
   * 复制矩形
   */
  public copy(): this {
    const topLeft = this.getTopLeft();
    return new Rectangle(topLeft.x, topLeft.y, this.width, this.height, this.style.copy()) as this;
  }

  /**
   * 创建正方形
   */
  public static createSquare(x: number, y: number, size: number, style?: Style): Rectangle {
    return new Rectangle(x, y, size, size, style);
  }

  /**
   * 从中心点创建矩形
   */
  public static createFromCenter(
    centerX: number,
    centerY: number,
    width: number,
    height: number,
    style?: Style
  ): Rectangle {
    return new Rectangle(centerX - width / 2, centerY - height / 2, width, height, style);
  }

  /**
   * 创建黄金比例矩形
   */
  public static createGoldenRatio(x: number, y: number, width: number, style?: Style): Rectangle {
    const goldenRatio = (1 + Math.sqrt(5)) / 2;
    const height = width / goldenRatio;
    return new Rectangle(x, y, width, height, style);
  }

  /**
   * 从Bounds对象创建矩形
   * @param bounds 边界框对象
   * @param style 可选的样式对象
   * @returns 对应的Rectangle对象
   */
  public static fromBounds(bounds: Bounds, style?: Style): Rectangle {
    return new Rectangle(bounds.x, bounds.y, bounds.width, bounds.height, style);
  }
}
