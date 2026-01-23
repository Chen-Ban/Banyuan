import Graph from "../base/Graph";
import { Point3, Vector3, Matrix4 } from "@/core/math";
import { Style } from "@/core/style";
import Bounds from "../base/Bounds";
import { Rectangle } from "../combined";

/**
 * MediaElement 抽象基类 - 媒体元素基类
 * 用于图片和视频等媒体元素的共同功能
 */
export default abstract class MediaElement extends Graph {
  public controlPoints: Point3[];
  public style: Style;
  public bounds: Bounds;
  public transfromOrigin: Point3;

  // 媒体相关属性
  public x: number;
  public y: number;
  public width: number = 100;
  public height: number = 100;
  public actualWidth: number = 0;
  public actualHeight: number = 0;
  public opacity: number = 1; // 透明度
  public loaded: boolean = false;
  public src: string = ''

  constructor(src: string, x: number, y: number, style: Style = Style.DEFAULT) {
    super();
    this.src = src
    this.x = x;
    this.y = y;
    this.style = style;

    // 初始化控制点（裁剪区域的八个点）
    this.controlPoints = this.calculateControlPoints();

    this.bounds = this.updateBounds(true, true)
    this.transfromOrigin = new Point3(this.x + this.width / 2, this.y + this.height / 2, 0)
  }

  public updateBounds(orientationX?: boolean, orientationY?: boolean): Bounds {
    const points = [
      new Point3(this.x, this.y, 0),
      new Point3(this.x + this.width, this.y, 0),
      new Point3(this.x + this.width, this.y + this.height, 0),
      new Point3(this.x, this.y + this.height, 0),
    ]
    return Bounds.fromPoints(points, orientationX ?? this.bounds?.width > 0, orientationY ?? this.bounds.height > 0)
  }

  /**
   * 加载媒体资源（由子类实现）
   */
  protected abstract loadMedia(): Promise<void>;

  /**
   * 设置位置
   */
  setPosition(x: number, y: number): this {
    this.x = x;
    this.y = y;
    this.updateControlPoints();
    return this;
  }

  /**
   * 设置大小
   */
  setSize(width: number, height: number): this {
    this.width = width;
    this.height = height;
    this.updateControlPoints();
    return this;
  }

  /**
   * 设置透明度
   */
  setOpacity(opacity: number): this {
    this.opacity = Math.max(0, Math.min(1, opacity));
    return this;
  }

  /**
   * 检查点是否在曲线上
   */
  isPointOnCurve(point: Point3, tolerance: number): boolean {
    return false;
  }

  /**
   * 计算裁剪区域的控制点（八个点）
   */
  protected calculateControlPoints(): Point3[] {
    if (!this.loaded) {
      // 如果媒体未加载，返回默认控制点
      return [new Point3(this.x, this.y, 0)];
    }

    const actualX = this.x;
    const actualY = this.y;
    const displayWidth = this.width;
    const displayHeight = this.height;

    // 返回裁剪区域的八个控制点
    return [
      new Point3(actualX, actualY, 0), // 左上角
      new Point3(actualX + displayWidth, actualY, 0), // 右上角
      new Point3(actualX + displayWidth, actualY + displayHeight, 0), // 右下角
      new Point3(actualX, actualY + displayHeight, 0), // 左下角
    ];
  }

  /**
   * 更新控制点
   */
  protected updateControlPoints(): void {
    this.controlPoints = this.calculateControlPoints();
    this.bounds = this.updateBounds()
  }

  /**
   * 渲染路径
   */
  public renderPath(ctx: CanvasRenderingContext2D, dependent: Boolean): void {
    dependent && ctx.beginPath();
    const x = this.x;
    const y = this.y;
    const width = this.width;
    const height = this.height;
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y);
    ctx.lineTo(x + width, y + height);
    ctx.lineTo(x, y + height);
    ctx.lineTo(x, y);
  }

  /**
   * 渲染占位符（当媒体未加载时，由子类实现）
   */
  protected abstract renderPlaceholder(ctx: CanvasRenderingContext2D): void;

  /**
   * 获取像素数据（由子类实现）
   */
  public abstract getImageData(): ImageData | null;

  /**
   * 获取图形上指定参数t处的点
   */
  public getPointAt(t: number): Point3 {
    // 对于矩形媒体元素，按矩形边界计算
    const perimeter = 2 * (this.width + this.height);
    let currentLength = 0;

    // 上边
    if (t * perimeter <= this.width) {
      return new Point3(this.x + t * perimeter, this.y, 0);
    }
    currentLength += this.width;

    // 右边
    if (t * perimeter <= currentLength + this.height) {
      return new Point3(this.x + this.width, this.y + (t * perimeter - currentLength), 0);
    }
    currentLength += this.height;

    // 下边
    if (t * perimeter <= currentLength + this.width) {
      return new Point3(this.x + this.width - (t * perimeter - currentLength), this.y + this.height, 0);
    }
    currentLength += this.width;

    // 左边
    return new Point3(this.x, this.y + this.height - (t * perimeter - currentLength), 0);
  }

  /**
   * 获取图形上指定参数t处的切线向量
   */
  public getTangentAt(t: number): Vector3 {
    const perimeter = 2 * (this.width + this.height);
    let currentLength = 0;

    // 上边：向右
    if (t * perimeter <= this.width) {
      return new Vector3(1, 0, 0);
    }
    currentLength += this.width;

    // 右边：向下
    if (t * perimeter <= currentLength + this.height) {
      return new Vector3(0, 1, 0);
    }
    currentLength += this.height;

    // 下边：向左
    if (t * perimeter <= currentLength + this.width) {
      return new Vector3(-1, 0, 0);
    }

    // 左边：向上
    return new Vector3(0, -1, 0);
  }

  /**
   * 获取图形上指定参数t处的法向量
   */
  public getNormalAt(t: number): Vector3 {
    const tangent = this.getTangentAt(t);
    return new Vector3(-tangent.y, tangent.x, 0);
  }

  /**
   * 计算点到图形的最短距离，并返回最近点
   */
  public getClosestPoint(point: Point3): {
    distance: number;
    closestPoint: Point3;
    parameter: number;
  } {
    // 计算点到矩形边界的最短距离
    const closestX = Math.max(this.x, Math.min(point.x, this.x + this.width));
    const closestY = Math.max(this.y, Math.min(point.y, this.y + this.height));
    const closestPoint = new Point3(closestX, closestY, 0);
    const distance = Math.sqrt(Math.pow(point.x - closestPoint.x, 2) + Math.pow(point.y - closestPoint.y, 2));

    // 计算参数t（简化版本，基于最近点在矩形边界上的位置）
    const perimeter = 2 * (this.width + this.height);
    let t = 0;

    if (closestX === this.x) {
      // 左边
      t = (this.y + this.height - closestY) / perimeter;
    } else if (closestX === this.x + this.width) {
      // 右边
      t = (this.width + this.height + closestY - this.y) / perimeter;
    } else if (closestY === this.y) {
      // 上边
      t = (closestX - this.x) / perimeter;
    } else {
      // 下边
      t = (this.width + this.height + this.width - (closestX - this.x)) / perimeter;
    }

    return { distance, closestPoint, parameter: Math.max(0, Math.min(1, t)) };
  }

  /**
   * 计算图形在指定参数范围内的长度
   */
  public getLength(tStart: number, tEnd: number): number {
    const perimeter = 2 * (this.width + this.height);
    return Math.abs(tEnd - tStart) * perimeter;
  }

  /**
   * 计算图形的面积
   */
  public getArea(): number {
    return this.width * this.height;
  }

  /**
   * 计算图形的质心
   */
  public getCentroid(): Point3 {
    return new Point3(this.x + this.width / 2, this.y + this.height / 2, 0);
  }

  /**
   * 应用变换矩阵到图形
   */
  public transform(matrix: Matrix4): Graph {
    // 变换左上角点作为新的位置
    const topLeft = matrix.multiply(new Point3(this.x, this.y, 0));
    this.x = topLeft.x;
    this.y = topLeft.y;

    // 变换宽度和高度向量以支持旋转和拉伸
    const widthVector = matrix.multiply(new Vector3(this.width, 0, 0));
    const heightVector = matrix.multiply(new Vector3(0, this.height, 0));

    // 计算变换后的宽度和高度（向量的长度）
    this.width = Math.sqrt(widthVector.x * widthVector.x + widthVector.y * widthVector.y);
    this.height = Math.sqrt(heightVector.x * heightVector.x + heightVector.y * heightVector.y);

    this.updateControlPoints();
    return this;
  }

  /**
   * 计算与另一个图形的相交点
   * @param other 另一个图形
   * @returns 相交点数组
   */
  public intersect(other: Graph): Point3[] {
    return Rectangle.fromBounds(this.bounds ?? this.updateBounds()).intersect(other);
  }

  public resize(fixedPoint: Point3, dynamicPoint: Point3, resizeVector: Vector3): void {

    const width = Math.abs(fixedPoint.x - dynamicPoint.x) || Infinity;
    const height = Math.abs(fixedPoint.y - dynamicPoint.y) || Infinity;

    for (const p of this.controlPoints) {
      // 变化比例
      const scaleX = Math.abs(p.x - fixedPoint.x) / width;
      const scaleY = Math.abs(p.y - fixedPoint.y) / height;

      // 带方向并且按照介质尺寸缩放的移动量
      const dx = resizeVector.x * scaleX;
      const dy = resizeVector.y * scaleY;

      p.add(new Vector3(dx, dy, 0))
    }
    const referenceVector = dynamicPoint.subtract(fixedPoint)
    this.updateBounds(referenceVector.x - resizeVector.x > 0, referenceVector.y - resizeVector.y > 0)
  }
}
