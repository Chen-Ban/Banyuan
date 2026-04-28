import Point3 from "./Point3";
import Vector3 from "./Vector3";
import { MATHTYPE } from '@/core/constants';
import type { ISerializable } from '@/core/interfaces';

export default class Matrix4 implements ISerializable {
  public readonly type: MATHTYPE = MATHTYPE.MATRIX4;
  private data: Float32Array;

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

  // 获取元素 (行主序)
  get(row: number, col: number): number {
    return this.data[row * 4 + col];
  }

  // 设置元素 (行主序)
  set(row: number, col: number, value: number): void {
    this.data[row * 4 + col] = value;
  }

  // 获取原始数据
  get transform(): number[] {
    return Array.from(this.data);
  }

  // ── 序列化 ──
  toJSON(): { transform: number[] } {
    return { transform: this.transform };
  }
  static fromJSON(data: { transform: number[] | Float32Array }): Matrix4 {
    return new Matrix4(data.transform instanceof Float32Array ? data.transform : new Float32Array(data.transform));
  }

  // 复制矩阵
  copy(): Matrix4 {
    return new Matrix4(new Float32Array(this.data));
  }

  // 矩阵乘法（函数重载）
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

  // 平移变换 (变换矩阵左乘当前矩阵)
  translate(x: number, y: number, z: number): Matrix4 {
    const translationMatrix = Matrix4.translation(x, y, z);
    const result = translationMatrix.multiplyMatrix(this);
    this.data = result.data;
    return this;
  }

  // 缩放变换 (变换矩阵左乘当前矩阵)
  scale(x: number, y: number, z: number): Matrix4 {
    const scalingMatrix = Matrix4.scaling(x, y, z);
    const result = scalingMatrix.multiplyMatrix(this);
    this.data = result.data;
    return this;
  }

  // 绕X轴旋转 (变换矩阵左乘当前矩阵)
  rotateX(angle: number): Matrix4 {
    const rotationMatrix = Matrix4.rotationX(angle);
    const result = rotationMatrix.multiplyMatrix(this);
    this.data = result.data;
    return this;
  }

  // 绕Y轴旋转 (变换矩阵左乘当前矩阵)
  rotateY(angle: number): Matrix4 {
    const rotationMatrix = Matrix4.rotationY(angle);
    const result = rotationMatrix.multiplyMatrix(this);
    this.data = result.data;
    return this;
  }

  // 绕Z轴旋转 (变换矩阵左乘当前矩阵)
  rotateZ(angle: number): Matrix4 {
    const rotationMatrix = Matrix4.rotationZ(angle);
    const result = rotationMatrix.multiplyMatrix(this);
    this.data = result.data;
    return this;
  }

  // 组合旋转
  rotate(x: number = 0, y: number = 0, z: number = 0): Matrix4 {
    let result = this.copy();
    if (x !== 0) result = result.rotateX(x);
    if (y !== 0) result = result.rotateY(y);
    if (z !== 0) result = result.rotateZ(z);
    this.data = result.data;
    return this;
  }

  // 矩阵转置
  transpose(): Matrix4 {
    const result = new Matrix4();
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        result.data[j * 4 + i] = this.data[i * 4 + j];
      }
    }
    return result;
  }

  // 计算行列式
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

  // 矩阵逆 (行主序)
  inverse(): Matrix4 {
    const det = this.determinant;
    if (Math.abs(det) < 1e-10) {
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

  // 静态方法：创建单位矩阵
  static identity(): Matrix4 {
    const matrix = new Matrix4();
    matrix.data[0] = 1;
    matrix.data[5] = 1;
    matrix.data[10] = 1;
    matrix.data[15] = 1;
    return matrix;
  }

  // 静态方法：创建零矩阵
  static zeros(): Matrix4 {
    return new Matrix4();
  }

  // 静态方法：创建平移矩阵 (行主序，平移分量在位置3、7、11)
  static translation(x: number, y: number, z: number): Matrix4 {
    const matrix = Matrix4.identity();
    matrix.data[3] = x;
    matrix.data[7] = y;
    matrix.data[11] = z;
    return matrix;
  }

  // 静态方法：创建缩放矩阵
  static scaling(x: number, y: number, z: number): Matrix4 {
    const matrix = Matrix4.identity();
    matrix.data[0] = x;
    matrix.data[5] = y;
    matrix.data[10] = z;
    return matrix;
  }

  // 静态方法：创建绕X轴旋转矩阵 (行主序)
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

  // 静态方法：创建绕Y轴旋转矩阵 (行主序)
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

  // 静态方法：创建绕Z轴旋转矩阵 (行主序)
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

  // 静态方法：创建透视投影矩阵 (行主序)
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

  // 静态方法：创建正交投影矩阵 (行主序)
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

  // 静态方法：创建视图矩阵
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
