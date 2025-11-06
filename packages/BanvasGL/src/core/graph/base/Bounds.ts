/**
 * 图形边界框类
 * 用于表示图形的包围盒，包含位置和尺寸信息
 */
export default class Bounds {
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
   * 设置边界框
   */
  set(x: number, y: number, width: number, height: number): Bounds {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    return this;
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
   * 获取中心点X坐标
   */
  get centerX(): number {
    return this.x + this.width / 2;
  }

  /**
   * 获取中心点Y坐标
   */
  get centerY(): number {
    return this.y + this.height / 2;
  }

  /**
   * 获取中心点
   */
  get center(): { x: number; y: number } {
    return {
      x: this.centerX,
      y: this.centerY,
    };
  }

  /**
   * 检查点是否在边界框内
   */
  contains(x: number, y: number): boolean {
    return x >= this.x && x <= this.right && y >= this.y && y <= this.bottom;
  }

  /**
   * 检查另一个边界框是否与此边界框相交
   */
  intersects(other: Bounds): boolean {
    return !(this.right < other.x || this.x > other.right || this.bottom < other.y || this.y > other.bottom);
  }

  /**
   * 检查另一个边界框是否完全包含在此边界框内
   */
  containsBounds(other: Bounds): boolean {
    return this.x <= other.x && this.y <= other.y && this.right >= other.right && this.bottom >= other.bottom;
  }

  /**
   * 扩展边界框以包含指定点
   */
  expandToInclude(x: number, y: number): Bounds {
    if (x < this.x) {
      this.width += this.x - x;
      this.x = x;
    } else if (x > this.right) {
      this.width = x - this.x;
    }

    if (y < this.y) {
      this.height += this.y - y;
      this.y = y;
    } else if (y > this.bottom) {
      this.height = y - this.y;
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
    return this.width * this.height;
  }

  /**
   * 检查边界框是否为空（宽度或高度为0）
   */
  get isEmpty(): boolean {
    return this.width <= 0 || this.height <= 0;
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
   */
  static fromPoints(points: Array<{ x: number; y: number }>): Bounds {
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

    return new Bounds(minX, minY, maxX - minX, maxY - minY);
  }

  /**
   * 合并多个边界框
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

  /**
   * 转换为对象格式
   */
  toObject(): { x: number; y: number; width: number; height: number } {
    return {
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
    };
  }

  /**
   * 从对象创建边界框
   */
  static fromObject(obj: { x: number; y: number; width: number; height: number }): Bounds {
    return new Bounds(obj.x, obj.y, obj.width, obj.height);
  }

  /**
   * 字符串表示
   */
  toString(): string {
    return `Bounds(${this.x}, ${this.y}, ${this.width}, ${this.height})`;
  }
}
