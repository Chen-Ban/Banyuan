import MathUtils from "./MathUtils";
import Vector3 from "./Vector3";
import { MATHTYPE } from "@/foundation/constants";
import type { ISerializable } from "@/types";

/**
 * 三维空间点
 *
 * 表示三维空间中的一个点（齐次坐标 w=1）。
 * 内部使用 Float32Array(3) 存储 x/y/z 坐标。
 * 支持与 Vector3 的加减运算以及 Matrix4 变换。
 *
 * @example
 * ```ts
 * const p = new Point3(1, 2, 3);
 * const moved = p.add(new Vector3(1, 0, 0)); // Point3(2, 2, 3)
 * ```
 */
export default class Point3 implements ISerializable {
  public readonly type: MATHTYPE = MATHTYPE.POINT3;
  private transform: Float32Array;
  /**
   * 构造三维点
   *
   * 根据给定的 x、y、z 坐标创建一个三维空间中的点。
   *
   * @param x - 点的 x 坐标分量
   * @param y - 点的 y 坐标分量
   * @param z - 点的 z 坐标分量
   * @returns 新的 Point3 实例
   *
   * @example
   * ```ts
   * const point = new Point3(3, 4, 5);
   * console.log(point.x, point.y, point.z); // 3, 4, 5
   * ```
   */
  constructor(x: number, y: number, z: number) {
    this.transform = new Float32Array(3);
    this.transform[0] = x;
    this.transform[1] = y;
    this.transform[2] = z;
  }
  /**
   * 获取 x 坐标
   *
   * 返回当前点的 x 坐标分量。
   *
   * @returns x 坐标值
   *
   * @example
   * ```ts
   * const p = new Point3(10, 20, 30);
   * console.log(p.x); // 10
   * ```
   */
  get x(): number {
    return this.transform[0];
  }
  /**
   * 获取 y 坐标
   *
   * 返回当前点的 y 坐标分量。
   *
   * @returns y 坐标值
   *
   * @example
   * ```ts
   * const p = new Point3(10, 20, 30);
   * console.log(p.y); // 20
   * ```
   */
  get y(): number {
    return this.transform[1];
  }
  /**
   * 获取 z 坐标
   *
   * 返回当前点的 z 坐标分量。
   *
   * @returns z 坐标值
   *
   * @example
   * ```ts
   * const p = new Point3(10, 20, 30);
   * console.log(p.z); // 30
   * ```
   */
  get z(): number {
    return this.transform[2];
  }
  /**
   * 获取原点
   *
   * 返回坐标为 (0, 0, 0) 的原点实例。
   *
   * @returns 原点 Point3 实例
   *
   * @example
   * ```ts
   * const origin = Point3.origin;
   * console.log(origin.x, origin.y, origin.z); // 0, 0, 0
   * ```
   */
  static get origin() {
    return new Point3(0, 0, 0);
  }
  /**
   * 点加向量（平移）
   *
   * 将当前点沿给定向量方向平移，返回新的点。等价于 点 + 向量 = 新点。
   *
   * @param v - 用于平移的三维向量
   * @returns 平移后的新 Point3 实例
   *
   * @example
   * ```ts
   * const p = new Point3(1, 2, 3);
   * const v = new Vector3(10, 0, 0);
   * const result = p.add(v);
   * console.log(result.x, result.y, result.z); // 11, 2, 3
   * ```
   */
  add(v: Vector3): Point3 {
    return new Point3(this.x + v.x, this.y + v.y, this.z + v.z);
  }
  /**
   * 点减点（求位移向量）
   *
   * 计算从另一个点到当前点的位移向量。等价于 点 - 点 = 向量。
   *
   * @param p - 被减去的目标点
   * @returns 从 p 指向当前点的位移向量
   *
   * @example
   * ```ts
   * const a = new Point3(5, 6, 7);
   * const b = new Point3(1, 2, 3);
   * const displacement = a.subtract(b);
   * console.log(displacement.x, displacement.y, displacement.z); // 4, 4, 4
   * ```
   */
  subtract(p: Point3): Vector3 {
    return new Vector3(this.x - p.x, this.y - p.y, this.z - p.z);
  }
  /**
   * 序列化为 JSON
   *
   * 将当前点转换为包含 x、y、z 属性的普通对象，用于持久化或传输。
   *
   * @returns 包含 x、y、z 坐标的 JSON 对象
   *
   * @example
   * ```ts
   * const p = new Point3(1, 2, 3);
   * const json = p.toJSON();
   * console.log(json); // { x: 1, y: 2, z: 3 }
   * ```
   */
  toJSON(): { x: number; y: number; z: number } {
    return { x: this.x, y: this.y, z: this.z };
  }
  /**
   * 从 JSON 反序列化
   *
   * 从包含 x、y、z 属性的 JSON 对象创建 Point3 实例。
   *
   * @param data - 包含 x、y、z 坐标的 JSON 对象
   * @returns 反序列化后的 Point3 实例
   *
   * @example
   * ```ts
   * const p = Point3.fromJSON({ x: 1, y: 2, z: 3 });
   * console.log(p.x, p.y, p.z); // 1, 2, 3
   * ```
   */
  static fromJSON(data: { x: number; y: number; z: number }): Point3 {
    return new Point3(data.x, data.y, data.z);
  }

  /**
   * 深拷贝
   *
   * 创建当前点的深拷贝，返回一个坐标相同但引用独立的新 Point3 实例。
   *
   * @returns 当前点的深拷贝
   *
   * @example
   * ```ts
   * const p = new Point3(1, 2, 3);
   * const clone = p.copy();
   * console.log(clone.x === p.x); // true
   * console.log(clone === p); // false
   * ```
   */
  copy(): Point3 {
    return new Point3(this.x, this.y, this.z);
  }
  /**
   * 计算两点间距离
   *
   * 计算当前点与另一点之间的欧氏距离（直线距离）。
   *
   * @param p - 目标点
   * @returns 两点之间的欧氏距离
   *
   * @example
   * ```ts
   * const a = new Point3(0, 0, 0);
   * const b = new Point3(3, 4, 0);
   * console.log(a.distance(b)); // 5
   * ```
   */
  distance(p: Point3): number {
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const dz = p.z - this.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  /**
   * 判断两点是否相同
   *
   * 使用 MathUtils.isEqual 进行浮点精度比较，判断当前点与目标点各分量是否相等。
   *
   * @param p - 要比较的目标点
   * @returns 如果两点在浮点精度范围内相同则返回 true，否则返回 false
   *
   * @example
   * ```ts
   * const a = new Point3(1, 2, 3);
   * const b = new Point3(1, 2, 3.0000001);
   * console.log(a.isSame(b)); // true（浮点精度范围内）
   * ```
   */
  isSame(p: Point3): boolean {
    return (
      MathUtils.isEqual(this.x, p.x) &&
      MathUtils.isEqual(this.y, p.y) &&
      MathUtils.isEqual(this.z, p.z)
    );
  }
  /**
   * 从扁平数组批量创建点
   *
   * 从扁平数组中按每 3 个元素一组（x/y/z）批量创建 Point3 数组。
   * 若数组长度不是 3 的整倍数，尾部不足 3 个元素的部分将被忽略。
   *
   * @param points - 包含坐标数据的扁平数组（Float32Array 或普通数组）
   * @returns Point3 实例数组
   *
   * @example
   * ```ts
   * const data = [1, 2, 3, 4, 5, 6];
   * const points = Point3.fromArray(data);
   * console.log(points.length); // 2
   * console.log(points[0].toJSON()); // { x: 1, y: 2, z: 3 }
   * console.log(points[1].toJSON()); // { x: 4, y: 5, z: 6 }
   * ```
   */
  static fromArray(points: Float32Array | Array<number>): Point3[] {
    const res = [];
    const len = points.length;
    for (let i = 0; i + 2 < len; i += 3) {
      res.push(new Point3(points[i], points[i + 1], points[i + 2]));
    }
    return res;
  }
}
