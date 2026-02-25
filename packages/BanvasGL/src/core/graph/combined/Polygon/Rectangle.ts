import { GRAPHTYPE } from "@/core/constants";
import Style from "@/core/style/Style";
import { Point3 } from "@/core/math";
import Polygon from "./Polygon";
import Bounds from "../../base/Bounds";

/**
 * Rectangle类 - 矩形
 * 继承自Polygon，专门用于创建和管理矩形
 */
export default class Rectangle extends Polygon {
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

// 类型守卫函数
export function isRectangle(graph: any): graph is Rectangle {
  return graph !== null && graph !== undefined && graph.type === GRAPHTYPE.RECTANGLE;
}