import { MathType } from "@/foundation/constants";
import type { ISerializable } from "@/types";

/**
 * 三维向量
 *
 * 表示三维空间中的一个向量（齐次坐标 w=0）。
 * 内部使用 Float32Array(3) 存储，支持加减、缩放、点积、叉积等运算。
 * 通过 Matrix4 变换时仅受旋转/缩放影响，不受平移影响。
 *
 * @example
 * ```ts
 * const v = new Vector3(1, 0, 0);
 * const scaled = v.scale(5); // Vector3(5, 0, 0)
 * const len = v.length; // 1
 * ```
 */
export default class Vector3 implements ISerializable {
  public readonly type: MathType = MathType.VECTOR3;
  private transform: Float32Array;
  /**
   * 构造三维向量
   *
   * 根据给定的 x、y、z 分量创建一个三维向量。
   *
   * @param x - 向量的 x 分量
   * @param y - 向量的 y 分量
   * @param z - 向量的 z 分量
   * @returns 新的 Vector3 实例
   *
   * @example
   * ```ts
   * const v = new Vector3(3, 4, 0);
   * console.log(v.length); // 5
   * ```
   */
  constructor(x: number, y: number, z: number) {
    this.transform = new Float32Array(3);
    this.transform[0] = x;
    this.transform[1] = y;
    this.transform[2] = z;
  }
  /**
   * 获取 x 分量
   *
   * 返回当前向量的 x 分量。
   *
   * @returns x 分量值
   *
   * @example
   * ```ts
   * const v = new Vector3(10, 20, 30);
   * console.log(v.x); // 10
   * ```
   */
  get x(): number {
    return this.transform[0];
  }
  /**
   * 获取 y 分量
   *
   * 返回当前向量的 y 分量。
   *
   * @returns y 分量值
   *
   * @example
   * ```ts
   * const v = new Vector3(10, 20, 30);
   * console.log(v.y); // 20
   * ```
   */
  get y(): number {
    return this.transform[1];
  }
  /**
   * 获取 z 分量
   *
   * 返回当前向量的 z 分量。
   *
   * @returns z 分量值
   *
   * @example
   * ```ts
   * const v = new Vector3(10, 20, 30);
   * console.log(v.z); // 30
   * ```
   */
  get z(): number {
    return this.transform[2];
  }
  /**
   * 获取向量模长
   *
   * 返回向量的模长（欧氏范数），即 sqrt(x² + y² + z²)。
   *
   * @returns 向量的模长
   *
   * @example
   * ```ts
   * const v = new Vector3(3, 4, 0);
   * console.log(v.length); // 5
   * ```
   */
  get length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }
  /**
   * 获取单位向量
   *
   * 返回当前向量单位化后的新向量（模长为 1）。
   * 若当前向量为零向量，则返回 (0, 0, 0)。
   *
   * @returns 单位化后的新 Vector3 实例
   *
   * @example
   * ```ts
   * const v = new Vector3(3, 4, 0);
   * const n = v.normalized;
   * console.log(n.x, n.y, n.z); // 0.6, 0.8, 0
   * console.log(n.length); // 1
   * ```
   */
  get normalized(): Vector3 {
    const length = this.length;
    if (length === 0) return new Vector3(0, 0, 0);
    return new Vector3(this.x / length, this.y / length, this.z / length);
  }
  /**
   * 向量加法
   *
   * 将当前向量与另一个向量相加，返回新的结果向量。
   *
   * @param v - 要相加的向量
   * @returns 两向量之和的新 Vector3 实例
   *
   * @example
   * ```ts
   * const a = new Vector3(1, 2, 3);
   * const b = new Vector3(4, 5, 6);
   * const sum = a.add(b);
   * console.log(sum.x, sum.y, sum.z); // 5, 7, 9
   * ```
   */
  add(v: Vector3): Vector3 {
    return new Vector3(this.x + v.x, this.y + v.y, this.z + v.z);
  }
  /**
   * 标量乘法
   *
   * 将当前向量的各分量乘以标量，返回缩放后的新向量。
   *
   * @param s - 缩放因子
   * @returns 缩放后的新 Vector3 实例
   *
   * @example
   * ```ts
   * const v = new Vector3(1, 2, 3);
   * const scaled = v.scale(2);
   * console.log(scaled.x, scaled.y, scaled.z); // 2, 4, 6
   * ```
   */
  scale(s: number): Vector3 {
    return new Vector3(this.x * s, this.y * s, this.z * s);
  }
  /**
   * 向量减法
   *
   * 用当前向量减去另一个向量，返回差向量。
   *
   * @param v - 被减去的向量
   * @returns 两向量之差的新 Vector3 实例
   *
   * @example
   * ```ts
   * const a = new Vector3(5, 6, 7);
   * const b = new Vector3(1, 2, 3);
   * const diff = a.subtract(b);
   * console.log(diff.x, diff.y, diff.z); // 4, 4, 4
   * ```
   */
  subtract(v: Vector3): Vector3 {
    return new Vector3(this.x - v.x, this.y - v.y, this.z - v.z);
  }
  /**
   * 取反向量
   *
   * 返回当前向量的反向向量，即各分量取负。
   *
   * @returns 反向的新 Vector3 实例
   *
   * @example
   * ```ts
   * const v = new Vector3(1, -2, 3);
   * const inv = v.inverse();
   * console.log(inv.x, inv.y, inv.z); // -1, 2, -3
   * ```
   */
  inverse(): Vector3 {
    return new Vector3(-this.x, -this.y, -this.z);
  }
  /**
   * 点积（内积）
   *
   * 计算当前向量与另一个向量的点积。结果为标量，
   * 几何意义为两向量模长之积乘以夹角余弦值。
   *
   * @param v - 另一个向量
   * @returns 两向量的点积值
   *
   * @example
   * ```ts
   * const a = new Vector3(1, 0, 0);
   * const b = new Vector3(0, 1, 0);
   * console.log(a.dot(b)); // 0（正交）
   *
   * const c = new Vector3(2, 3, 4);
   * const d = new Vector3(1, 1, 1);
   * console.log(c.dot(d)); // 9
   * ```
   */
  dot(v: Vector3): number {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }
  /**
   * 叉积（外积）
   *
   * 计算当前向量与另一个向量的叉积，返回垂直于两向量所在平面的新向量。
   * 结果向量的方向遵循右手定则，模长等于两向量张成的平行四边形面积。
   *
   * @param v - 另一个向量
   * @returns 垂直于两向量的新 Vector3 实例
   *
   * @example
   * ```ts
   * const a = new Vector3(1, 0, 0);
   * const b = new Vector3(0, 1, 0);
   * const c = a.cross(b);
   * console.log(c.x, c.y, c.z); // 0, 0, 1
   * ```
   */
  cross(v: Vector3): Vector3 {
    return new Vector3(
      this.y * v.z - this.z * v.y,
      this.z * v.x - this.x * v.z,
      this.x * v.y - this.y * v.x,
    );
  }
  /**
   * 序列化为 JSON
   *
   * 将当前向量转换为包含 x、y、z 属性的普通对象，用于持久化或传输。
   *
   * @returns 包含 x、y、z 分量的 JSON 对象
   *
   * @example
   * ```ts
   * const v = new Vector3(1, 2, 3);
   * const json = v.toJSON();
   * console.log(json); // { x: 1, y: 2, z: 3 }
   * ```
   */
  toJSON(): { x: number; y: number; z: number } {
    return { x: this.x, y: this.y, z: this.z };
  }
  /**
   * 从 JSON 反序列化
   *
   * 从包含 x、y、z 属性的 JSON 对象创建 Vector3 实例。
   *
   * @param data - 包含 x、y、z 分量的 JSON 对象
   * @returns 反序列化后的 Vector3 实例
   *
   * @example
   * ```ts
   * const v = Vector3.fromJSON({ x: 1, y: 2, z: 3 });
   * console.log(v.x, v.y, v.z); // 1, 2, 3
   * ```
   */
  static fromJSON(data: { x: number; y: number; z: number }): Vector3 {
    return new Vector3(data.x, data.y, data.z);
  }

  /**
   * 深拷贝
   *
   * 创建当前向量的深拷贝，返回一个分量相同但引用独立的新 Vector3 实例。
   *
   * @returns 当前向量的深拷贝
   *
   * @example
   * ```ts
   * const v = new Vector3(1, 2, 3);
   * const clone = v.copy();
   * console.log(clone.x === v.x); // true
   * console.log(clone === v); // false
   * ```
   */
  copy(): Vector3 {
    return new Vector3(this.x, this.y, this.z);
  }
}
