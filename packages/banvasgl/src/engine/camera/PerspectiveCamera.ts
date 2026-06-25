import { BaseCamera, BaseCameraOptions } from './BaseCamera.js'
import { MathUtils, Matrix4, Point3, Vector3 } from '@/foundation/math'
import { CameraType } from '@/foundation/constants'

export interface PerspectiveCameraOptions extends BaseCameraOptions {
  fov?: number
  aspect?: number
  width?: number
  height?: number
  near?: number
  far?: number
}

export class PerspectiveCamera extends BaseCamera {
  public readonly type: CameraType = CameraType.PERSPECTIVE
  private _fov: number
  private _aspect: number
  private _width: number
  private _height: number

  constructor(options: PerspectiveCameraOptions = {}) {
    super(options)

    this._fov = options.fov ?? Math.PI / 4 // 45度
    this._width = options.width ?? 800
    this._height = options.height ?? 600
    this._aspect = options.aspect ?? this._width / this._height
    // 透视相机才真正让 near/far 对外可配置
    if (options.near != null) {
      this._near = options.near
    }
    if (options.far != null) {
      this._far = options.far
    }

    this.updateMatrices()
  }

  // FOV相关方法
  get fov(): number {
    return this._fov
  }

  set fov(fieldOfView: number) {
    this._fov = fieldOfView
    this._dirty = true
  }

  setFov(fieldOfView: number): this {
    this._fov = fieldOfView
    this._dirty = true
    return this
  }

  // 宽高比相关方法
  get aspect(): number {
    return this._aspect
  }

  set aspect(ratio: number) {
    this._aspect = ratio
    this._dirty = true
  }

  setAspect(ratio: number): this {
    this._aspect = ratio
    this._dirty = true
    return this
  }

  // 宽度相关方法
  get width(): number {
    return this._width
  }

  set width(w: number) {
    this._width = w
    this._aspect = this._width / this._height
    this._dirty = true
  }

  setWidth(w: number): this {
    this._width = w
    this._aspect = this._width / this._height
    this._dirty = true
    return this
  }

  // 高度相关方法
  get height(): number {
    return this._height
  }

  set height(h: number) {
    this._height = h
    this._aspect = this._width / this._height
    this._dirty = true
  }

  setHeight(h: number): this {
    this._height = h
    this._aspect = this._width / this._height
    this._dirty = true
    return this
  }

  // 设置视口尺寸
  setViewportSize(width: number, height: number): this {
    this._width = width
    this._height = height
    this._aspect = width / height
    this._dirty = true
    return this
  }

  getSize(): { width: number; height: number } {
    return {
      width: this._width,
      height: this._height,
    }
  }

  // 获取视野角度（以度为单位）
  get fovDegrees(): number {
    return (this._fov * 180) / Math.PI
  }

  set fovDegrees(degrees: number) {
    this._fov = (degrees * Math.PI) / 180
    this._dirty = true
  }

  setFovDegrees(degrees: number): this {
    this._fov = (degrees * Math.PI) / 180
    this._dirty = true
    return this
  }

  // 获取视锥体信息
  getFrustum(): {
    nearWidth: number
    nearHeight: number
    farWidth: number
    farHeight: number
  } {
    const nearHeight = 2 * Math.tan(this._fov / 2) * this._near
    const nearWidth = nearHeight * this._aspect
    const farHeight = 2 * Math.tan(this._fov / 2) * this._far
    const farWidth = farHeight * this._aspect

    return {
      nearWidth,
      nearHeight,
      farWidth,
      farHeight,
    }
  }

  // 获取视锥体顶点
  getFrustumVertices(): {
    near: [number, number, number][]
    far: [number, number, number][]
  } {
    const frustum = this.getFrustum()
    const direction = this.getDirection()
    const right = this.getRight()
    const up = this.getUp()

    // 近平面中心点 = position + direction * near
    const nearCenter = this._position.add(direction.scale(this._near))

    // 远平面中心点 = position + direction * far
    const farCenter = this._position.add(direction.scale(this._far))

    // 计算近平面四个顶点
    const nearHalfWidth = frustum.nearWidth / 2
    const nearHalfHeight = frustum.nearHeight / 2
    const nearVertices: [number, number, number][] = [
      this.pointToTuple(nearCenter.add(right.scale(-nearHalfWidth).add(up.scale(-nearHalfHeight)))),
      this.pointToTuple(nearCenter.add(right.scale(nearHalfWidth).add(up.scale(-nearHalfHeight)))),
      this.pointToTuple(nearCenter.add(right.scale(nearHalfWidth).add(up.scale(nearHalfHeight)))),
      this.pointToTuple(nearCenter.add(right.scale(-nearHalfWidth).add(up.scale(nearHalfHeight)))),
    ]

    // 计算远平面四个顶点
    const farHalfWidth = frustum.farWidth / 2
    const farHalfHeight = frustum.farHeight / 2
    const farVertices: [number, number, number][] = [
      this.pointToTuple(farCenter.add(right.scale(-farHalfWidth).add(up.scale(-farHalfHeight)))),
      this.pointToTuple(farCenter.add(right.scale(farHalfWidth).add(up.scale(-farHalfHeight)))),
      this.pointToTuple(farCenter.add(right.scale(farHalfWidth).add(up.scale(farHalfHeight)))),
      this.pointToTuple(farCenter.add(right.scale(-farHalfWidth).add(up.scale(farHalfHeight)))),
    ]

    return {
      near: nearVertices,
      far: farVertices,
    }
  }

  // 检查点是否在视锥体内（透视除法后与 NDC 立方体比较）
  isPointInFrustum(point: [number, number, number]): boolean {
    if (this._dirty) this.updateMatrices()

    // 用 Point3 经 VP 矩阵变换（含平移）
    const clipPos = this._viewProjectionMatrix.multiply(new Point3(point[0], point[1], point[2]))

    if (Math.abs(clipPos.z) < MathUtils.FLOAT_EPSILON) return false

    const ndcX = clipPos.x / clipPos.z
    const ndcY = clipPos.y / clipPos.z

    return ndcX >= -1 && ndcX <= 1 && ndcY >= -1 && ndcY <= 1
  }

  // 检查球体是否在视锥体内
  isSphereInFrustum(center: [number, number, number], radius: number): boolean {
    if (this._dirty) this.updateMatrices()

    const clipPos = this._viewProjectionMatrix.multiply(new Point3(center[0], center[1], center[2]))

    if (Math.abs(clipPos.z) < MathUtils.FLOAT_EPSILON) return false

    const ndcX = clipPos.x / clipPos.z
    const ndcY = clipPos.y / clipPos.z

    return ndcX >= -1 - radius && ndcX <= 1 + radius && ndcY >= -1 - radius && ndcY <= 1 + radius
  }

  protected override updateProjectionMatrix(): void {
    this._projectionMatrix = Matrix4.perspective(this._fov, this._aspect, this._near, this._far)
  }

  // ── 序列化 ──
  override toJSON(): any {
    return {
      ...super.toJSON(),
      fov: this._fov,
      aspect: this._aspect,
      width: this._width,
      height: this._height,
      near: this._near,
      far: this._far,
    }
  }

  static fromJSON(data: any): PerspectiveCamera {
    return new PerspectiveCamera({
      position: data.position ? Point3.fromJSON(data.position) : undefined,
      target: data.target ? Point3.fromJSON(data.target) : undefined,
      up: data.up ? Vector3.fromJSON(data.up) : undefined,
      fov: data.fov,
      aspect: data.aspect,
      width: data.width,
      height: data.height,
      near: data.near,
      far: data.far,
    })
  }

  // 复制相机
  copy(): PerspectiveCamera {
    return new PerspectiveCamera({
      position: this._position.copy(),
      target: this._target.copy(),
      up: this._up.copy(),
      fov: this._fov,
      aspect: this._aspect,
      near: this._near,
      far: this._far,
    })
  }

  override reset(): this {
    super.reset()
    this._fov = Math.PI / 4
    this._aspect = 1
    this._dirty = true
    return this
  }

  // ── 工具方法 ──

  private pointToTuple(p: Point3): [number, number, number] {
    return [p.x, p.y, p.z]
  }
}
