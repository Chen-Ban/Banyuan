import Point3 from '@/foundation/math/Point3'
import { MATHTYPE } from '@/foundation/constants'
import type { ISerializable } from '@/types'
/**
 * 边界框类
 * @description 用于表示图形的包围盒，包含位置和尺寸信息。基于本地坐标系定位。
 * @description 边界框的宽高带正负，表示边界框的扩展方向。正：右\下；负：左\上。
 */
export default class Bounds implements ISerializable {
  public readonly type: MATHTYPE = MATHTYPE.BOUNDS;
  public x: number;
  public y: number;
  public width: number;
  public height: number;

  constructor(x: number = 0, y: number = 0, width: number = 0, height: number = 0) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }


  /**
   * 设置位置
   */
  setPosition(x: number, y: number): Bounds {
    this.x = x;
    this.y = y;
    return this;
  }

  /**
   * 设置尺寸
   */
  setSize(width: number, height: number): Bounds {
    this.width = width;
    this.height = height;
    return this;
  }

  /**
   * 获取右边界
   */
  get right(): number {
    return this.x + this.width;
  }

  /**
   * 获取下边界
   */
  get bottom(): number {
    return this.y + this.height;
  }

  /**
   * 获取水平中点
   */
  get midX(): number {
    return this.x + this.width / 2;
  }

  /**
   * 获取垂直中点
   */
  get midY(): number {
    return this.y + this.height / 2;
  }

  /**
   * 扩展边界框以包含指定点
   */
  expandToInclude(x: number, y: number): Bounds {
    const minX = Math.min(this.x, this.right, x);
    const maxX = Math.max(this.x, this.right, x);
    const minY = Math.min(this.y, this.bottom, y);
    const maxY = Math.max(this.y, this.bottom, y);

    if (this.x < this.right) {
      this.x = minX;
      this.width = maxX - minX;
    } else {
      this.x = maxX;
      this.width = minX - maxX;
    }

    if (this.y < this.bottom) {
      this.y = minY;
      this.height = maxY - minY;
    } else {
      this.y = maxY;
      this.height = minY - maxY;
    }

    return this;
  }

  /**
   * 扩展边界框以包含另一个边界框
   */
  expandToIncludeBounds(other: Bounds): Bounds {
    this.expandToInclude(other.x, other.y);
    this.expandToInclude(other.right, other.bottom);
    return this;
  }

  /**
   * 获取边界框的面积
   */
  get area(): number {
    return Math.abs(this.width * this.height);
  }

  /**
   * 检查边界框是否为空（宽度或高度为0）
   */
  get isEmpty(): boolean {
    return this.width <= 0 || this.height <= 0;
  }

  // ── 序列化 ──
  toJSON(): { x: number; y: number; width: number; height: number } {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  }
  static fromJSON(data: { x: number; y: number; width: number; height: number }): Bounds {
    return new Bounds(data.x, data.y, data.width, data.height);
  }

  /**
  * 复制边界框
  */
  copy(): Bounds {
    return new Bounds(this.x, this.y, this.width, this.height);
  }

  /**
   * 创建空边界框
   */
  static empty(): Bounds {
    return new Bounds(0, 0, 0, 0);
  }

  /**
   * 从点集合创建边界框
   * @description 从点集合创建边界框，返回一个包含所有点集的最小边界框。
   * @description 默认为向右下扩展。
   */
  static fromPoints(points: Point3[], orientationX: boolean = true, orientationY: boolean = true): Bounds {
    if (points.length === 0) {
      return Bounds.empty();
    }

    let minX = points[0].x;
    let maxX = points[0].x;
    let minY = points[0].y;
    let maxY = points[0].y;

    for (const point of points) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
    let x = minX
    let y = minY
    let width = maxX - minX
    let height = maxY - minY
    if (!orientationX) {
      x = maxX
      width = -width
    }
    if (!orientationY) {
      y = maxY
      height = -height
    }

    return new Bounds(x, y, width, height);
  }

  /**
   * 合并多个边界框
   * @description 合并多个边界框，返回一个包含所有边界框的最小边界框。
   * @description 合并时，会根据第一个边界框的扩展方向，决定合并后的边界框的宽高正负。
   */
  static union(...bounds: Bounds[]): Bounds {
    if (bounds.length === 0) {
      return Bounds.empty();
    }

    const result = bounds[0].copy();
    for (let i = 1; i < bounds.length; i++) {
      result.expandToIncludeBounds(bounds[i]);
    }

    return result;
  }
}
