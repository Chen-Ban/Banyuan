import Point3 from "./Point3";
import Vector3 from "./Vector3";
import { MathUtils } from "./MathUtils";
import { MATHTYPE } from '@/foundation/constants';
import type { ISerializable } from '@/types';

/**
 * 4×4 仿射变换矩阵（行主序）
 *
 * 内部使用 Float32Array(16) 存储，支持平移、旋转、缩放以及矩阵乘法。
 * 可作用于 Point3（齐次 w=1）和 Vector3（齐次 w=0）。
 *
 * @example
 * ```ts
 * const m = Matrix4.identity().translate(100, 50, 0).rotateZ(Math.PI / 4)
 * const transformed = m.multiply(new Point3(10, 20, 0))
 * ```
 */
export default class Matrix4 implements ISerializable {
  public readonly type: MATHTYPE = MATHTYPE.MATRIX4;
  private data: Float32Array;

  /**
   * 构造矩阵
   *
   * 创建一个 4×4 矩阵实例。若提供初始数据则使用该数据填充，否则创建全零矩阵。
   *
   * @param data - 可选初始数据：二维数组（4×4）或 Float32Array(16)，行主序排列
   * @returns 新的 Matrix4 实例
   *
   * @example
   * ```ts
   * // 创建全零矩阵
   * const zero = new Matrix4();
   * // 从二维数组创建
   * const m = new Matrix4([[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]]);
   * // 从 Float32Array 创建
   * const m2 = new Matrix4(new Float32Array(16));
   * ```
   */
  constructor(data?: number[][] | Float32Array) {
    this.data = new Float32Array(16);
    if (data) {
      if (data instanceof Float32Array) {
        this.data.set(data);
      } else {
        this.data.set(data.flat());
      }
    }
  }

  /**
   * 获取元素
   *
   * 获取矩阵中指定行列位置的元素值，使用行主序索引计算。
   *
   * @param row - 行索引（0~3）
   * @param col - 列索引（0~3）
   * @returns 指定位置的元素值
   *
   * @example
   * ```ts
   * const m = Matrix4.identity();
   * const val = m.get(0, 0); // 1
   * const val2 = m.get(0, 1); // 0
   * ```
   */
  get(row: number, col: number): number {
    return this.data[row * 4 + col];
  }

  /**
   * 设置元素
   *
   * 设置矩阵中指定行列位置的元素值，使用行主序索引计算。
   *
   * @param row - 行索引（0~3）
   * @param col - 列索引（0~3）
   * @param value - 要设置的数值
   * @returns 无返回值
   *
   * @example
   * ```ts
   * const m = Matrix4.identity();
   * m.set(0, 3, 100); // 设置平移分量 tx = 100
   * ```
   */
  set(row: number, col: number, value: number): void {
    this.data[row * 4 + col] = value;
  }

  /**
   * 获取变换数组
   *
   * 获取矩阵内部数据的普通数组副本，包含 16 个元素，按行主序排列。
   *
   * @returns 包含 16 个数字元素的数组副本
   *
   * @example
   * ```ts
   * const m = Matrix4.identity();
   * const arr = m.transform; // [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
   * ```
   */
  get transform(): number[] {
    return Array.from(this.data);
  }

  /**
   * 序列化为 JSON
   *
   * 将矩阵数据序列化为包含 transform 数组的 JSON 对象，用于持久化存储。
   *
   * @returns 包含 transform 属性的普通对象
   *
   * @example
   * ```ts
   * const m = Matrix4.identity();
   * const json = m.toJSON();
   * // { transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }
   * ```
   */
  toJSON(): { transform: number[] } {
    return { transform: this.transform };
  }

  /**
   * 从 JSON 反序列化
   *
   * 从包含 transform 数组的 JSON 数据重建 Matrix4 实例。
   *
   * @param data - 包含 transform 属性的对象，transform 为 number[] 或 Float32Array
   * @returns 重建的 Matrix4 实例
   *
   * @example
   * ```ts
   * const json = { transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] };
   * const m = Matrix4.fromJSON(json);
   * ```
   */
  static fromJSON(data: { transform: number[] | Float32Array }): Matrix4 {
    return new Matrix4(data.transform instanceof Float32Array ? data.transform : new Float32Array(data.transform));
  }

  /**
   * 深拷贝矩阵
   *
   * 创建当前矩阵的深拷贝，返回一个拥有独立内部数据的新 Matrix4 实例。
   *
   * @returns 当前矩阵的深拷贝副本
   *
   * @example
   * ```ts
   * const m = Matrix4.identity().translate(10, 20, 0);
   * const clone = m.copy();
   * clone.set(0, 3, 0); // 修改副本不影响原矩阵
   * ```
   */
  copy(): Matrix4 {
    return new Matrix4(new Float32Array(this.data));
  }
  /**
   * 矩阵乘法
   *
   * 通用乘法方法，支持与 Matrix4、Point3、Vector3 三种类型相乘的重载。
   * 与 Matrix4 相乘返回新矩阵，与 Point3 相乘返回变换后的点，
   * 与 Vector3 相乘返回变换后的向量（忽略平移分量）。
   *
   * @param factor - 乘法因子，可为 Matrix4、Point3 或 Vector3
   * @returns 乘法结果，类型与 factor 一致
   *
   * @example
   * ```ts
   * const m = Matrix4.identity().translate(10, 20, 0);
   * const m2 = m.multiply(Matrix4.scaling(2, 2, 1));
   * const p = m.multiply(new Point3(5, 5, 0)); // Point3(15, 25, 0)
   * const v = m.multiply(new Vector3(1, 0, 0)); // Vector3(1, 0, 0)
   * ```
   */
  multiply(factor: Matrix4): Matrix4;
  multiply(factor: Point3): Point3;
  multiply(factor: Vector3): Vector3;
  multiply(factor: Matrix4 | Point3 | Vector3): Matrix4 | Point3 | Vector3 {
    if (factor instanceof Matrix4) {
      return this.multiplyMatrix(factor);
    } else if (factor instanceof Point3) {
      return this.multiplyPoint(factor);
    } else if (factor instanceof Vector3) {
      return this.multiplyVector(factor);
    }
    throw new Error("Invalid factor type");
  }

  /**
   * 矩阵乘以点
   *
   * 将当前矩阵作用于一个 Point3 点（齐次坐标 w=1），执行完整的仿射变换
   * 包括旋转、缩放和平移。若齐次坐标 w 不为 1 或 0，会进行归一化。
   *
   * @param point - 待变换的三维点
   * @returns 变换后的新 Point3 实例
   *
   * @example
   * ```ts
   * const m = Matrix4.identity().translate(100, 50, 0);
   * const p = m.multiplyPoint(new Point3(10, 20, 0));
   * // Point3(110, 70, 0)
   * ```
   */
  multiplyPoint(point: Point3): Point3 {
    const x =
      this.data[0] * point.x +
      this.data[1] * point.y +
      this.data[2] * point.z +
      this.data[3];
    const y =
      this.data[4] * point.x +
      this.data[5] * point.y +
      this.data[6] * point.z +
      this.data[7];
    const z =
      this.data[8] * point.x +
      this.data[9] * point.y +
      this.data[10] * point.z +
      this.data[11];
    const w =
      this.data[12] * point.x +
      this.data[13] * point.y +
      this.data[14] * point.z +
      this.data[15];

    // 齐次坐标归一化
    if (w !== 1 && w !== 0) {
      return new Point3(x / w, y / w, z / w);
    }
    return new Point3(x, y, z);
  }

  /**
   * 矩阵乘以向量
   *
   * 将当前矩阵作用于一个 Vector3 向量（齐次坐标 w=0），仅应用线性变换
   * （旋转和缩放），忽略平移分量。
   *
   * @param vector - 待变换的三维向量
   * @returns 变换后的新 Vector3 实例
   *
   * @example
   * ```ts
   * const m = Matrix4.identity().translate(100, 50, 0).scale(2, 2, 1);
   * const v = m.multiplyVector(new Vector3(1, 0, 0));
   * // Vector3(2, 0, 0) -- 平移不影响向量
   * ```
   */
  multiplyVector(vector: Vector3): Vector3 {
    const x =
      this.data[0] * vector.x +
      this.data[1] * vector.y +
      this.data[2] * vector.z;
    const y =
      this.data[4] * vector.x +
      this.data[5] * vector.y +
      this.data[6] * vector.z;
    const z =
      this.data[8] * vector.x +
      this.data[9] * vector.y +
      this.data[10] * vector.z;
    return new Vector3(x, y, z);
  }

  /**
   * 矩阵乘以矩阵
   *
   * 计算当前矩阵与另一个 Matrix4 的乘积（this × matrix），返回新的 Matrix4。
   * 不修改当前矩阵或参数矩阵。
   *
   * @param matrix - 右乘矩阵
   * @returns 乘积结果的新 Matrix4 实例
   *
   * @example
   * ```ts
   * const translate = Matrix4.translation(10, 20, 0);
   * const scale = Matrix4.scaling(2, 2, 1);
   * const combined = translate.multiplyMatrix(scale);
   * // 等价于先缩放再平移
   * ```
   */
  multiplyMatrix(matrix: Matrix4): Matrix4 {
    const result = new Matrix4();
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) {
          sum += this.data[i * 4 + k] * matrix.data[k * 4 + j];
        }
        result.data[i * 4 + j] = sum;
      }
    }
    return result;
  }

  /**
   * 追加平移变换
   *
   * 在当前矩阵基础上追加平移变换（左乘平移矩阵），会修改当前矩阵并返回 this
   * 以支持链式调用。
   *
   * @param x - X 轴平移量
   * @param y - Y 轴平移量
   * @param z - Z 轴平移量
   * @returns 当前矩阵实例（已修改），支持链式调用
   *
   * @example
   * ```ts
   * const m = Matrix4.identity().translate(100, 50, 0).translate(10, 10, 0);
   * // 累计平移 (110, 60, 0)
   * ```
   */
  translate(x: number, y: number, z: number): Matrix4 {
    const translationMatrix = Matrix4.translation(x, y, z);
    const result = translationMatrix.multiplyMatrix(this);
    this.data = result.data;
    return this;
  }

  /**
   * 追加缩放变换
   *
   * 在当前矩阵基础上追加缩放变换（左乘缩放矩阵），会修改当前矩阵并返回 this
   * 以支持链式调用。
   *
   * @param x - X 轴缩放因子
   * @param y - Y 轴缩放因子
   * @param z - Z 轴缩放因子
   * @returns 当前矩阵实例（已修改），支持链式调用
   *
   * @example
   * ```ts
   * const m = Matrix4.identity().scale(2, 3, 1);
   * const p = m.multiply(new Point3(10, 10, 0)); // Point3(20, 30, 0)
   * ```
   */
  scale(x: number, y: number, z: number): Matrix4 {
    const scalingMatrix = Matrix4.scaling(x, y, z);
    const result = scalingMatrix.multiplyMatrix(this);
    this.data = result.data;
    return this;
  }

  /**
   * 绕 X 轴旋转
   *
   * 在当前矩阵基础上追加绕 X 轴的旋转变换（左乘旋转矩阵），会修改当前矩阵
   * 并返回 this 以支持链式调用。
   *
   * @param angle - 旋转角度（弧度制）
   * @returns 当前矩阵实例（已修改），支持链式调用
   *
   * @example
   * ```ts
   * const m = Matrix4.identity().rotateX(Math.PI / 2);
   * // 绕 X 轴旋转 90 度
   * ```
   */
  rotateX(angle: number): Matrix4 {
    const rotationMatrix = Matrix4.rotationX(angle);
    const result = rotationMatrix.multiplyMatrix(this);
    this.data = result.data;
    return this;
  }

  /**
   * 绕 Y 轴旋转
   *
   * 在当前矩阵基础上追加绕 Y 轴的旋转变换（左乘旋转矩阵），会修改当前矩阵
   * 并返回 this 以支持链式调用。
   *
   * @param angle - 旋转角度（弧度制）
   * @returns 当前矩阵实例（已修改），支持链式调用
   *
   * @example
   * ```ts
   * const m = Matrix4.identity().rotateY(Math.PI / 4);
   * // 绕 Y 轴旋转 45 度
   * ```
   */
  rotateY(angle: number): Matrix4 {
    const rotationMatrix = Matrix4.rotationY(angle);
    const result = rotationMatrix.multiplyMatrix(this);
    this.data = result.data;
    return this;
  }

  /**
   * 绕 Z 轴旋转
   *
   * 在当前矩阵基础上追加绕 Z 轴的旋转变换（左乘旋转矩阵），会修改当前矩阵
   * 并返回 this 以支持链式调用。适用于 2D 场景中的平面旋转。
   *
   * @param angle - 旋转角度（弧度制）
   * @returns 当前矩阵实例（已修改），支持链式调用
   *
   * @example
   * ```ts
   * const m = Matrix4.identity().rotateZ(Math.PI / 6);
   * // 绕 Z 轴旋转 30 度
   * const p = m.multiply(new Point3(10, 0, 0));
   * ```
   */
  rotateZ(angle: number): Matrix4 {
    const rotationMatrix = Matrix4.rotationZ(angle);
    const result = rotationMatrix.multiplyMatrix(this);
    this.data = result.data;
    return this;
  }

  /**
   * 组合旋转
   *
   * 依次绕 X、Y、Z 轴进行旋转（欧拉角顺序 XYZ），会修改当前矩阵并返回 this
   * 以支持链式调用。角度为零的轴会被跳过以优化性能。
   *
   * @param x - 绕 X 轴的旋转角度（弧度制），默认为 0
   * @param y - 绕 Y 轴的旋转角度（弧度制），默认为 0
   * @param z - 绕 Z 轴的旋转角度（弧度制），默认为 0
   * @returns 当前矩阵实例（已修改），支持链式调用
   *
   * @example
   * ```ts
   * const m = Matrix4.identity().rotate(Math.PI / 4, 0, Math.PI / 2);
   * // 先绕 X 轴旋转 45 度，再绕 Z 轴旋转 90 度
   * ```
   */
  rotate(x: number = 0, y: number = 0, z: number = 0): Matrix4 {
    let result = this.copy();
    if (x !== 0) result = result.rotateX(x);
    if (y !== 0) result = result.rotateY(y);
    if (z !== 0) result = result.rotateZ(z);
    this.data = result.data;
    return this;
  }
  /**
   * 计算行列式
   *
   * 计算当前 4×4 矩阵的行列式值。行列式为零表示矩阵奇异（不可逆）。
   *
   * @returns 矩阵的行列式数值
   *
   * @example
   * ```ts
   * const m = Matrix4.identity();
   * console.log(m.determinant); // 1
   *
   * const singular = new Matrix4(); // 全零矩阵
   * console.log(singular.determinant); // 0
   * ```
   */
  get determinant(): number {
    const m = this.data;
    return (
      m[0] *
        (m[5] * (m[10] * m[15] - m[11] * m[14]) -
          m[6] * (m[9] * m[15] - m[11] * m[13]) +
          m[7] * (m[9] * m[14] - m[10] * m[13])) -
      m[1] *
        (m[4] * (m[10] * m[15] - m[11] * m[14]) -
          m[6] * (m[8] * m[15] - m[11] * m[12]) +
          m[7] * (m[8] * m[14] - m[10] * m[12])) +
      m[2] *
        (m[4] * (m[9] * m[15] - m[11] * m[13]) -
          m[5] * (m[8] * m[15] - m[11] * m[12]) +
          m[7] * (m[8] * m[13] - m[9] * m[12])) -
      m[3] *
        (m[4] * (m[9] * m[14] - m[10] * m[13]) -
          m[5] * (m[8] * m[14] - m[10] * m[12]) +
          m[6] * (m[8] * m[13] - m[9] * m[12]))
    );
  }

  /**
   * 计算逆矩阵
   *
   * 使用伴随矩阵法计算当前矩阵的逆矩阵。若矩阵奇异（行列式绝对值小于 1e-10）
   * 则抛出异常。不修改当前矩阵。
   *
   * @returns 逆矩阵的新 Matrix4 实例
   * @throws {Error} 当矩阵奇异（行列式为零）时抛出 "Matrix is singular" 错误
   *
   * @example
   * ```ts
   * const m = Matrix4.identity().translate(10, 20, 0).scale(2, 2, 1);
   * const inv = m.inverse();
   * const identity = m.multiplyMatrix(inv);
   * // identity 近似为单位矩阵
   * ```
   */
  inverse(): Matrix4 {
    const det = this.determinant;
    if (Math.abs(det) < MathUtils.FLOAT_EPSILON) {
      throw new Error("Matrix is singular (determinant is zero)");
    }

    const result = new Matrix4();
    const invDet = 1 / det;

    // 使用伴随矩阵方法计算逆矩阵 (行主序)
    result.data[0] =
      (this.data[5] *
        (this.data[10] * this.data[15] - this.data[11] * this.data[14]) -
        this.data[6] *
          (this.data[9] * this.data[15] - this.data[11] * this.data[13]) +
        this.data[7] *
          (this.data[9] * this.data[14] - this.data[10] * this.data[13])) *
      invDet;

    result.data[1] =
      -(
        this.data[1] *
          (this.data[10] * this.data[15] - this.data[11] * this.data[14]) -
        this.data[2] *
          (this.data[9] * this.data[15] - this.data[11] * this.data[13]) +
        this.data[3] *
          (this.data[9] * this.data[14] - this.data[10] * this.data[13])
      ) * invDet;

    result.data[2] =
      (this.data[1] *
        (this.data[6] * this.data[15] - this.data[7] * this.data[14]) -
        this.data[2] *
          (this.data[5] * this.data[15] - this.data[7] * this.data[13]) +
        this.data[3] *
          (this.data[5] * this.data[14] - this.data[6] * this.data[13])) *
      invDet;

    result.data[3] =
      -(
        this.data[1] *
          (this.data[6] * this.data[11] - this.data[7] * this.data[10]) -
        this.data[2] *
          (this.data[5] * this.data[11] - this.data[7] * this.data[9]) +
        this.data[3] *
          (this.data[5] * this.data[10] - this.data[6] * this.data[9])
      ) * invDet;

    result.data[4] =
      -(
        this.data[4] *
          (this.data[10] * this.data[15] - this.data[11] * this.data[14]) -
        this.data[6] *
          (this.data[8] * this.data[15] - this.data[11] * this.data[12]) +
        this.data[7] *
          (this.data[8] * this.data[14] - this.data[10] * this.data[12])
      ) * invDet;

    result.data[5] =
      (this.data[0] *
        (this.data[10] * this.data[15] - this.data[11] * this.data[14]) -
        this.data[2] *
          (this.data[8] * this.data[15] - this.data[11] * this.data[12]) +
        this.data[3] *
          (this.data[8] * this.data[14] - this.data[10] * this.data[12])) *
      invDet;

    result.data[6] =
      -(
        this.data[0] *
          (this.data[6] * this.data[15] - this.data[7] * this.data[14]) -
        this.data[2] *
          (this.data[4] * this.data[15] - this.data[7] * this.data[12]) +
        this.data[3] *
          (this.data[4] * this.data[14] - this.data[6] * this.data[12])
      ) * invDet;

    result.data[7] =
      (this.data[0] *
        (this.data[6] * this.data[11] - this.data[7] * this.data[10]) -
        this.data[2] *
          (this.data[4] * this.data[11] - this.data[7] * this.data[8]) +
        this.data[3] *
          (this.data[4] * this.data[10] - this.data[6] * this.data[8])) *
      invDet;

    result.data[8] =
      (this.data[4] *
        (this.data[9] * this.data[15] - this.data[11] * this.data[13]) -
        this.data[5] *
          (this.data[8] * this.data[15] - this.data[11] * this.data[12]) +
        this.data[7] *
          (this.data[8] * this.data[13] - this.data[9] * this.data[12])) *
      invDet;

    result.data[9] =
      -(
        this.data[0] *
          (this.data[9] * this.data[15] - this.data[11] * this.data[13]) -
        this.data[1] *
          (this.data[8] * this.data[15] - this.data[11] * this.data[12]) +
        this.data[3] *
          (this.data[8] * this.data[13] - this.data[9] * this.data[12])
      ) * invDet;

    result.data[10] =
      (this.data[0] *
        (this.data[5] * this.data[15] - this.data[7] * this.data[13]) -
        this.data[1] *
          (this.data[4] * this.data[15] - this.data[7] * this.data[12]) +
        this.data[3] *
          (this.data[4] * this.data[13] - this.data[5] * this.data[12])) *
      invDet;

    result.data[11] =
      -(
        this.data[0] *
          (this.data[5] * this.data[11] - this.data[7] * this.data[9]) -
        this.data[1] *
          (this.data[4] * this.data[11] - this.data[7] * this.data[8]) +
        this.data[3] *
          (this.data[4] * this.data[9] - this.data[5] * this.data[8])
      ) * invDet;

    result.data[12] =
      -(
        this.data[4] *
          (this.data[9] * this.data[14] - this.data[10] * this.data[13]) -
        this.data[5] *
          (this.data[8] * this.data[14] - this.data[10] * this.data[12]) +
        this.data[6] *
          (this.data[8] * this.data[13] - this.data[9] * this.data[12])
      ) * invDet;

    result.data[13] =
      (this.data[0] *
        (this.data[9] * this.data[14] - this.data[10] * this.data[13]) -
        this.data[1] *
          (this.data[8] * this.data[14] - this.data[10] * this.data[12]) +
        this.data[2] *
          (this.data[8] * this.data[13] - this.data[9] * this.data[12])) *
      invDet;

    result.data[14] =
      -(
        this.data[0] *
          (this.data[5] * this.data[14] - this.data[6] * this.data[13]) -
        this.data[1] *
          (this.data[4] * this.data[14] - this.data[6] * this.data[12]) +
        this.data[2] *
          (this.data[4] * this.data[13] - this.data[5] * this.data[12])
      ) * invDet;

    result.data[15] =
      (this.data[0] *
        (this.data[5] * this.data[10] - this.data[6] * this.data[9]) -
        this.data[1] *
          (this.data[4] * this.data[10] - this.data[6] * this.data[8]) +
        this.data[2] *
          (this.data[4] * this.data[9] - this.data[5] * this.data[8])) *
      invDet;

    return result;
  }
  /**
   * 创建单位矩阵
   *
   * 创建一个 4×4 单位矩阵（对角线元素为 1，其余为 0），作为变换的起始状态。
   *
   * @returns 新的单位矩阵实例
   *
   * @example
   * ```ts
   * const I = Matrix4.identity();
   * // I.transform => [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]
   * ```
   */
  static identity(): Matrix4 {
    const matrix = new Matrix4();
    matrix.data[0] = 1;
    matrix.data[5] = 1;
    matrix.data[10] = 1;
    matrix.data[15] = 1;
    return matrix;
  }

  /**
   * 创建平移矩阵
   *
   * 创建一个纯平移的 4×4 变换矩阵（行主序，平移分量在位置 3、7、11）。
   *
   * @param x - X 轴平移量
   * @param y - Y 轴平移量
   * @param z - Z 轴平移量
   * @returns 新的平移矩阵实例
   *
   * @example
   * ```ts
   * const t = Matrix4.translation(100, 200, 0);
   * const p = t.multiply(new Point3(0, 0, 0));
   * // p => Point3(100, 200, 0)
   * ```
   */
  static translation(x: number, y: number, z: number): Matrix4 {
    const matrix = Matrix4.identity();
    matrix.data[3] = x;
    matrix.data[7] = y;
    matrix.data[11] = z;
    return matrix;
  }

  /**
   * 创建缩放矩阵
   *
   * 创建一个纯缩放的 4×4 变换矩阵，各轴独立缩放。
   *
   * @param x - X 轴缩放因子
   * @param y - Y 轴缩放因子
   * @param z - Z 轴缩放因子
   * @returns 新的缩放矩阵实例
   *
   * @example
   * ```ts
   * const s = Matrix4.scaling(2, 2, 1);
   * const p = s.multiply(new Point3(10, 5, 0));
   * // p => Point3(20, 10, 0)
   * ```
   */
  static scaling(x: number, y: number, z: number): Matrix4 {
    const matrix = Matrix4.identity();
    matrix.data[0] = x;
    matrix.data[5] = y;
    matrix.data[10] = z;
    return matrix;
  }

  /**
   * 创建绕 X 轴旋转矩阵
   *
   * 创建一个绕 X 轴旋转指定弧度的 4×4 变换矩阵（行主序）。
   *
   * @param angle - 旋转角度（弧度）
   * @returns 新的旋转矩阵实例
   *
   * @example
   * ```ts
   * const rx = Matrix4.rotationX(Math.PI / 2);
   * const v = rx.multiply(new Vector3(0, 1, 0));
   * // v 约等于 Vector3(0, 0, 1)
   * ```
   */
  static rotationX(angle: number): Matrix4 {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const matrix = Matrix4.identity();
    // 第二行 (索引4-7)
    matrix.data[4] = 0;
    matrix.data[5] = cos;
    matrix.data[6] = sin;
    matrix.data[7] = 0;
    // 第三行 (索引8-11)
    matrix.data[8] = 0;
    matrix.data[9] = -sin;
    matrix.data[10] = cos;
    matrix.data[11] = 0;
    return matrix;
  }

  /**
   * 创建绕 Y 轴旋转矩阵
   *
   * 创建一个绕 Y 轴旋转指定弧度的 4×4 变换矩阵（行主序）。
   *
   * @param angle - 旋转角度（弧度）
   * @returns 新的旋转矩阵实例
   *
   * @example
   * ```ts
   * const ry = Matrix4.rotationY(Math.PI / 4);
   * const v = ry.multiply(new Vector3(1, 0, 0));
   * // v 约等于 Vector3(0.707, 0, 0.707)
   * ```
   */
  static rotationY(angle: number): Matrix4 {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const matrix = Matrix4.identity();
    // 第一行 (索引0-3)
    matrix.data[0] = cos;
    matrix.data[1] = 0;
    matrix.data[2] = -sin;
    matrix.data[3] = 0;
    // 第三行 (索引8-11)
    matrix.data[8] = sin;
    matrix.data[9] = 0;
    matrix.data[10] = cos;
    matrix.data[11] = 0;
    return matrix;
  }

  /**
   * 创建绕 Z 轴旋转矩阵
   *
   * 创建一个绕 Z 轴旋转指定弧度的 4×4 变换矩阵（行主序）。
   *
   * @param angle - 旋转角度（弧度）
   * @returns 新的旋转矩阵实例
   *
   * @example
   * ```ts
   * const rz = Matrix4.rotationZ(Math.PI / 2);
   * const v = rz.multiply(new Vector3(1, 0, 0));
   * // v 约等于 Vector3(0, 1, 0)
   * ```
   */
  static rotationZ(angle: number): Matrix4 {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const matrix = Matrix4.identity();
    // 第一行 (索引0-3)
    matrix.data[0] = cos;
    matrix.data[1] = sin;
    matrix.data[2] = 0;
    matrix.data[3] = 0;
    // 第二行 (索引4-7)
    matrix.data[4] = -sin;
    matrix.data[5] = cos;
    matrix.data[6] = 0;
    matrix.data[7] = 0;
    return matrix;
  }

  /**
   * 创建透视投影矩阵
   *
   * 根据视场角、宽高比和近远裁剪面参数，创建一个透视投影 4×4 矩阵（行主序）。
   *
   * @param fov - 垂直视场角（弧度）
   * @param aspect - 视口宽高比（width / height）
   * @param near - 近裁剪面距离（正数）
   * @param far - 远裁剪面距离（正数，大于 near）
   * @returns 新的透视投影矩阵实例
   *
   * @example
   * ```ts
   * const proj = Matrix4.perspective(Math.PI / 4, 16 / 9, 0.1, 1000);
   * ```
   */
  static perspective(
    fov: number,
    aspect: number,
    near: number,
    far: number
  ): Matrix4 {
    const f = 1.0 / Math.tan(fov / 2);
    const rangeInv = 1 / (near - far);

    const matrix = new Matrix4();
    // 第一行 (索引0-3)
    matrix.data[0] = f / aspect;
    matrix.data[1] = 0;
    matrix.data[2] = 0;
    matrix.data[3] = 0;
    // 第二行 (索引4-7)
    matrix.data[4] = 0;
    matrix.data[5] = f;
    matrix.data[6] = 0;
    matrix.data[7] = 0;
    // 第三行 (索引8-11)
    matrix.data[8] = 0;
    matrix.data[9] = 0;
    matrix.data[10] = (near + far) * rangeInv;
    matrix.data[11] = -1;
    // 第四行 (索引12-15)
    matrix.data[12] = 0;
    matrix.data[13] = 0;
    matrix.data[14] = near * far * rangeInv * 2;
    matrix.data[15] = 0;

    return matrix;
  }

  /**
   * 创建正交投影矩阵
   *
   * 根据视锥体的六个裁剪面参数，创建一个正交投影 4×4 矩阵（行主序）。
   *
   * @param left - 视锥体左边界
   * @param right - 视锥体右边界
   * @param bottom - 视锥体下边界
   * @param top - 视锥体上边界
   * @param near - 近裁剪面距离
   * @param far - 远裁剪面距离
   * @returns 新的正交投影矩阵实例
   *
   * @example
   * ```ts
   * const ortho = Matrix4.orthographic(-400, 400, -300, 300, 0.1, 100);
   * ```
   */
  static orthographic(
    left: number,
    right: number,
    bottom: number,
    top: number,
    near: number,
    far: number
  ): Matrix4 {
    const matrix = Matrix4.identity();
    // 第一行 (索引0-3)
    matrix.data[0] = 2 / (right - left);
    matrix.data[1] = 0;
    matrix.data[2] = 0;
    matrix.data[3] = -(right + left) / (right - left);
    // 第二行 (索引4-7)
    matrix.data[4] = 0;
    matrix.data[5] = 2 / (top - bottom);
    matrix.data[6] = 0;
    matrix.data[7] = -(top + bottom) / (top - bottom);
    // 第三行 (索引8-11)
    matrix.data[8] = 0;
    matrix.data[9] = 0;
    matrix.data[10] = -2 / (far - near);
    matrix.data[11] = -(far + near) / (far - near);
    return matrix;
  }

  // ── 2D TRS 分解 ──

  /**
   * 提取二维平移分量
   *
   * 从当前矩阵中提取 2D 平移分量（tx, ty）。行主序布局下：data[3] = tx, data[7] = ty。
   *
   * @returns 包含 x、y 属性的平移分量对象
   *
   * @example
   * ```ts
   * const m = Matrix4.identity().translate(100, 200, 0);
   * const { x, y } = m.extractTranslation2D();
   * // x => 100, y => 200
   * ```
   */
  extractTranslation2D(): { x: number; y: number } {
    return { x: this.data[3], y: this.data[7] }
  }

  /**
   * 提取 Z 轴旋转角度
   *
   * 从当前矩阵中提取绕 Z 轴的旋转角度（弧度）。利用行主序布局中
   * data[0] = sx * cos(θ) 与 data[4] = -sx * sin(θ) 的关系，
   * 通过 atan2(-data[4], data[0]) 计算得到 θ。
   *
   * @returns Z 轴旋转角度（弧度），范围 [-π, π]
   *
   * @example
   * ```ts
   * const m = Matrix4.identity().rotateZ(Math.PI / 4);
   * const angle = m.extractRotationZ();
   * // angle 约等于 Math.PI / 4
   * ```
   */
  extractRotationZ(): number {
    return Math.atan2(-this.data[4], this.data[0])
  }

  /**
   * 创建视图矩阵
   *
   * 根据相机位置、目标点和上方向向量，创建一个 lookAt 视图变换矩阵。
   * 用于将世界坐标系变换到相机坐标系。
   *
   * @param eye - 相机位置坐标 [x, y, z]
   * @param target - 观察目标点坐标 [x, y, z]
   * @param up - 相机上方向向量 [x, y, z]
   * @returns 新的视图矩阵实例
   *
   * @example
   * ```ts
   * const view = Matrix4.lookAt([0, 0, 5], [0, 0, 0], [0, 1, 0]);
   * // 相机在 z=5 处看向原点，y 轴朝上
   * ```
   */
  static lookAt(
    eye: [number, number, number],
    target: [number, number, number],
    up: [number, number, number]
  ): Matrix4 {
    const zAxis = [eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]];
    const zLength = Math.sqrt(
      zAxis[0] * zAxis[0] + zAxis[1] * zAxis[1] + zAxis[2] * zAxis[2]
    );
    zAxis[0] /= zLength;
    zAxis[1] /= zLength;
    zAxis[2] /= zLength;

    const xAxis = [
      up[1] * zAxis[2] - up[2] * zAxis[1],
      up[2] * zAxis[0] - up[0] * zAxis[2],
      up[0] * zAxis[1] - up[1] * zAxis[0],
    ];
    const xLength = Math.sqrt(
      xAxis[0] * xAxis[0] + xAxis[1] * xAxis[1] + xAxis[2] * xAxis[2]
    );
    xAxis[0] /= xLength;
    xAxis[1] /= xLength;
    xAxis[2] /= xLength;

    const yAxis = [
      zAxis[1] * xAxis[2] - zAxis[2] * xAxis[1],
      zAxis[2] * xAxis[0] - zAxis[0] * xAxis[2],
      zAxis[0] * xAxis[1] - zAxis[1] * xAxis[0],
    ];

    const matrix = Matrix4.identity();
    // 第一行 (索引0-3)
    matrix.data[0] = xAxis[0];
    matrix.data[1] = yAxis[0];
    matrix.data[2] = zAxis[0];
    matrix.data[3] = -(
      xAxis[0] * eye[0] +
      xAxis[1] * eye[1] +
      xAxis[2] * eye[2]
    );
    // 第二行 (索引4-7)
    matrix.data[4] = xAxis[1];
    matrix.data[5] = yAxis[1];
    matrix.data[6] = zAxis[1];
    matrix.data[7] = -(
      yAxis[0] * eye[0] +
      yAxis[1] * eye[1] +
      yAxis[2] * eye[2]
    );
    // 第三行 (索引8-11)
    matrix.data[8] = xAxis[2];
    matrix.data[9] = yAxis[2];
    matrix.data[10] = zAxis[2];
    matrix.data[11] = -(
      zAxis[0] * eye[0] +
      zAxis[1] * eye[1] +
      zAxis[2] * eye[2]
    );

    return matrix;
  }
}
