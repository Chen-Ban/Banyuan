import Point3 from "@/foundation/math/Point3";
import { MathType } from "@/foundation/constants";
import type { ISerializable } from "@/types";

/**
 * 轴对齐边界框类（Axis-Aligned Bounding Box）
 *
 * 用于表示图形的包围盒，包含位置（x, y）和尺寸（width, height）信息。
 * 基于本地坐标系定位，是 BanvasGL 图形系统中所有图形包围盒计算的基础数据结构。
 *
 * **宽高正负号的含义（方向感知）：**
 * - `width > 0`：边界框向右扩展（x → x+width）
 * - `width < 0`：边界框向左扩展（x → x+width，x+width < x）
 * - `height > 0`：边界框向下扩展（y → y+height）
 * - `height < 0`：边界框向上扩展（y → y+height，y+height < y）
 *
 * 这种方向感知设计使得边界框可以精确反映图形的扩展方向，
 * 在 `union` 合并和 `expandToInclude` 扩展操作中保持方向一致性。
 *
 * @example
 * ```typescript
 * // 创建向右下扩展的边界框
 * const bounds = new Bounds(10, 20, 100, 50);
 * console.log(bounds.right);   // 110
 * console.log(bounds.bottom);  // 70
 *
 * // 创建向左上扩展的边界框（方向感知）
 * const flipped = new Bounds(110, 70, -100, -50);
 * console.log(flipped.right);  // 10
 * console.log(flipped.bottom); // 20
 * ```
 */
export default class Bounds implements ISerializable {
  /**
   * 类型标识，固定为 `MathType.BOUNDS`
   */
  public readonly type: MathType = MathType.BOUNDS;

  /**
   * 边界框左上角的 x 坐标（当 width > 0 时）或右下角的 x 坐标（当 width < 0 时）
   */
  public x: number;

  /**
   * 边界框左上角的 y 坐标（当 height > 0 时）或右下角的 y 坐标（当 height < 0 时）
   */
  public y: number;

  /**
   * 边界框的宽度。正值表示向右扩展，负值表示向左扩展
   */
  public width: number;

  /**
   * 边界框的高度。正值表示向下扩展，负值表示向上扩展
   */
  public height: number;

  /**
   * 创建一个边界框
   *
   * @param x - {number} 左上角 x 坐标，默认 `0`
   * @param y - {number} 左上角 y 坐标，默认 `0`
   * @param width - {number} 宽度（正=右，负=左），默认 `0`
   * @param height - {number} 高度（正=下，负=上），默认 `0`
   *
   * @example
   * ```typescript
   * const bounds = new Bounds(10, 20, 100, 50);
   * const empty = new Bounds(); // (0, 0, 0, 0)
   * ```
   */
  constructor(
    x: number = 0,
    y: number = 0,
    width: number = 0,
    height: number = 0,
  ) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  /**
   * 设置边界框的位置
   *
   * 仅修改 x、y 坐标，不改变宽高。
   *
   * @param x - {number} 新的 x 坐标
   * @param y - {number} 新的 y 坐标
   * @returns {Bounds} 返回 `this`，支持链式调用
   *
   * @example
   * ```typescript
   * const bounds = new Bounds(0, 0, 100, 50);
   * bounds.setPosition(10, 20); // 移动到 (10, 20)
   * ```
   */
  setPosition(x: number, y: number): Bounds {
    this.x = x;
    this.y = y;
    return this;
  }

  /**
   * 设置边界框的尺寸
   *
   * 仅修改 width、height，不改变位置。正负号决定扩展方向。
   *
   * @param width - {number} 新的宽度（正=右，负=左）
   * @param height - {number} 新的高度（正=下，负=上）
   * @returns {Bounds} 返回 `this`，支持链式调用
   *
   * @example
   * ```typescript
   * const bounds = new Bounds(10, 20, 0, 0);
   * bounds.setSize(100, 50); // 向右下扩展
   * ```
   */
  setSize(width: number, height: number): Bounds {
    this.width = width;
    this.height = height;
    return this;
  }

  /**
   * 获取边界框的右边界 x 坐标
   *
   * 计算方式：`x + width`。当 width < 0 时，right 会小于 x。
   *
   * @returns {number} 右边界的 x 坐标
   *
   * @example
   * ```typescript
   * const bounds = new Bounds(10, 20, 100, 50);
   * console.log(bounds.right); // 110
   *
   * const flipped = new Bounds(110, 20, -100, 50);
   * console.log(flipped.right); // 10
   * ```
   */
  get right(): number {
    return this.x + this.width;
  }

  /**
   * 获取边界框的下边界 y 坐标
   *
   * 计算方式：`y + height`。当 height < 0 时，bottom 会小于 y。
   *
   * @returns {number} 下边界的 y 坐标
   *
   * @example
   * ```typescript
   * const bounds = new Bounds(10, 20, 100, 50);
   * console.log(bounds.bottom); // 70
   *
   * const flipped = new Bounds(10, 70, 100, -50);
   * console.log(flipped.bottom); // 20
   * ```
   */
  get bottom(): number {
    return this.y + this.height;
  }

  /**
   * 获取边界框的水平中点 x 坐标
   *
   * 计算方式：`x + width / 2`。方向感知，负宽高时中点仍正确。
   *
   * @returns {number} 水平中点的 x 坐标
   *
   * @example
   * ```typescript
   * const bounds = new Bounds(10, 20, 100, 50);
   * console.log(bounds.midX); // 60
   * ```
   */
  get midX(): number {
    return this.x + this.width / 2;
  }

  /**
   * 获取边界框的垂直中点 y 坐标
   *
   * 计算方式：`y + height / 2`。方向感知，负宽高时中点仍正确。
   *
   * @returns {number} 垂直中点的 y 坐标
   *
   * @example
   * ```typescript
   * const bounds = new Bounds(10, 20, 100, 50);
   * console.log(bounds.midY); // 45
   * ```
   */
  get midY(): number {
    return this.y + this.height / 2;
  }

  /**
   * 扩展边界框以包含指定点（保持方向感知的扩展逻辑）
   *
   * 根据当前边界框的扩展方向（width/height 的正负）决定扩展方式：
   * - 当 `x < right`（向右扩展）时，扩展后仍保持向右
   * - 当 `x >= right`（向左扩展）时，扩展后仍保持向左
   * - Y 方向同理
   *
   * 这确保了扩展操作不会意外翻转边界框的方向。
   *
   * @param x - {number} 目标点的 x 坐标
   * @param y - {number} 目标点的 y 坐标
   * @returns {Bounds} 返回 `this`，支持链式调用
   *
   * @example
   * ```typescript
   * const bounds = new Bounds(10, 20, 100, 50);
   * bounds.expandToInclude(150, 100);
   * // 边界框扩展至包含 (150, 100)
   *
   * // 方向感知：向左扩展的边界框扩展后仍保持向左
   * const flipped = new Bounds(110, 70, -100, -50);
   * flipped.expandToInclude(0, 0);
   * // 宽度变大（更负），方向不变
   * ```
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
   *
   * 通过将另一个边界框的两个对角点分别纳入当前边界框实现合并。
   * 方向感知由 `expandToInclude` 保证。
   *
   * @param other - {Bounds} 要包含的另一个边界框
   * @returns {Bounds} 返回 `this`，支持链式调用
   *
   * @example
   * ```typescript
   * const a = new Bounds(0, 0, 100, 100);
   * const b = new Bounds(50, 50, 100, 100);
   * a.expandToIncludeBounds(b);
   * // a 现在包含 (0,0) 到 (150,150)
   * ```
   */
  expandToIncludeBounds(other: Bounds): Bounds {
    this.expandToInclude(other.x, other.y);
    this.expandToInclude(other.right, other.bottom);
    return this;
  }

  /**
   * 获取边界框的面积
   *
   * 使用绝对值计算，无论扩展方向如何均返回正数面积。
   *
   * @returns {number} 边界框面积（始终为非负数）
   *
   * @example
   * ```typescript
   * const bounds = new Bounds(0, 0, 100, 50);
   * console.log(bounds.area); // 5000
   *
   * const flipped = new Bounds(100, 50, -100, -50);
   * console.log(flipped.area); // 5000（绝对值）
   * ```
   */
  get area(): number {
    return Math.abs(this.width * this.height);
  }

  /**
   * 检查边界框是否为空
   *
   * 当宽度或高度为 0 时，边界框不具有有效面积，视为空。
   *
   * @returns {boolean} 宽度或高度为 0 时返回 `true`
   *
   * @example
   * ```typescript
   * new Bounds(0, 0, 0, 0).isEmpty;   // true
   * new Bounds(0, 0, 100, 0).isEmpty;  // true
   * new Bounds(0, 0, 100, 50).isEmpty; // false
   * ```
   */
  get isEmpty(): boolean {
    return this.width === 0 || this.height === 0;
  }

  // ── 序列化 ──

  /**
   * 将边界框序列化为 JSON 对象
   *
   * @returns {{ x: number; y: number; width: number; height: number }} 可 JSON 化的纯对象
   *
   * @example
   * ```typescript
   * const bounds = new Bounds(10, 20, 100, 50);
   * bounds.toJSON(); // { x: 10, y: 20, width: 100, height: 50 }
   * ```
   */
  toJSON(): { x: number; y: number; width: number; height: number } {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  }

  /**
   * 从 JSON 对象反序列化创建边界框实例
   *
   * @param data - {{ x: number; y: number; width: number; height: number }} 序列化数据对象
   * @returns {Bounds} 还原后的边界框实例
   *
   * @example
   * ```typescript
   * const bounds = Bounds.fromJSON({ x: 10, y: 20, width: 100, height: 50 });
   * ```
   */
  static fromJSON(data: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): Bounds {
    return new Bounds(data.x, data.y, data.width, data.height);
  }

  /**
   * 复制边界框
   *
   * 创建当前边界框的独立副本，修改副本不影响原始对象。
   *
   * @returns {Bounds} 当前边界框的深拷贝实例
   *
   * @example
   * ```typescript
   * const original = new Bounds(10, 20, 100, 50);
   * const copy = original.copy();
   * copy.width = 200; // 不影响 original
   * ```
   */
  copy(): Bounds {
    return new Bounds(this.x, this.y, this.width, this.height);
  }

  /**
   * 创建空边界框
   *
   * 空边界框的位置和尺寸均为 0，`isEmpty` 返回 `true`。
   *
   * @returns {Bounds} 空边界框实例 `(0, 0, 0, 0)`
   *
   * @example
   * ```typescript
   * const empty = Bounds.empty();
   * console.log(empty.isEmpty); // true
   * ```
   */
  static empty(): Bounds {
    return new Bounds(0, 0, 0, 0);
  }

  /**
   * 从点集合创建边界框
   *
   * 计算包含所有点的最小边界框。通过 `orientationX` 和 `orientationY` 参数
   * 控制边界框的扩展方向：
   * - `orientationX = true`（默认）：宽度为正，向右扩展
   * - `orientationX = false`：宽度为负，向左扩展
   * - `orientationY = true`（默认）：高度为正，向下扩展
   * - `orientationY = false`：高度为负，向上扩展
   *
   * @param points - {Point3[]} 点集合，空数组时返回空边界框
   * @param orientationX - {boolean} X 轴方向，`true` 为向右（正宽度），默认 `true`
   * @param orientationY - {boolean} Y 轴方向，`true` 为向下（正高度），默认 `true`
   * @returns {Bounds} 包含所有点的最小边界框
   *
   * @example
   * ```typescript
   * const points = [new Point3(10, 20, 0), new Point3(100, 80, 0)];
   *
   * // 默认向右下扩展
   * const bounds = Bounds.fromPoints(points);
   * // { x: 10, y: 20, width: 90, height: 60 }
   *
   * // 向左上扩展
   * const flipped = Bounds.fromPoints(points, false, false);
   * // { x: 100, y: 80, width: -90, height: -60 }
   * ```
   */
  static fromPoints(
    points: Point3[],
    orientationX: boolean = true,
    orientationY: boolean = true,
  ): Bounds {
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
    let x = minX;
    let y = minY;
    let width = maxX - minX;
    let height = maxY - minY;
    if (!orientationX) {
      x = maxX;
      width = -width;
    }
    if (!orientationY) {
      y = maxY;
      height = -height;
    }

    return new Bounds(x, y, width, height);
  }

  /**
   * 合并多个边界框（基于第一个 bounds 扩展方向的合并策略）
   *
   * 创建一个包含所有输入边界框的最小边界框。合并策略如下：
   * 1. 以第一个边界框为基础副本（保留其方向信息）
   * 2. 逐个调用 `expandToIncludeBounds` 将后续边界框纳入
   * 3. `expandToInclude` 保持方向感知，确保合并后的宽高正负号
   *    与第一个边界框的扩展方向一致
   *
   * 无参数时返回空边界框。
   *
   * @param bounds - {Bounds[]} 要合并的边界框列表
   * @returns {Bounds} 包含所有输入边界框的最小合并边界框
   *
   * @example
   * ```typescript
   * const a = new Bounds(0, 0, 100, 100);
   * const b = new Bounds(50, 50, 100, 100);
   * const merged = Bounds.union(a, b);
   * // { x: 0, y: 0, width: 150, height: 150 }
   *
   * // 第一个边界框方向决定合并结果方向
   * const leftWard = new Bounds(100, 100, -100, -100);
   * const rightWard = new Bounds(0, 0, 200, 200);
   * const merged2 = Bounds.union(leftWard, rightWard);
   * // 结果保持 leftWard 的方向（宽高为负）
   * ```
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
