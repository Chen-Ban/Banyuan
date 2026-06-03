import Matrix4 from '@/foundation/math/Matrix4'
import Point3 from '@/foundation/math/Point3'
import Vector3 from '@/foundation/math/Vector3'
import { CameraType } from '@/foundation/constants'

export interface BaseCameraOptions {
    position?: Point3
    target?: Point3
    up?: Vector3
}

export abstract class BaseCamera {
    public abstract readonly type: CameraType
    protected _position: Point3
    protected _target: Point3
    protected _up: Vector3
    protected _near: number
    protected _far: number

    protected _viewMatrix: Matrix4
    protected _projectionMatrix: Matrix4
    protected _viewProjectionMatrix: Matrix4
    protected _dirty: boolean

    constructor(options: BaseCameraOptions = {}) {
        this._position = options.position?.copy() ?? new Point3(0, 0, 0)
        this._target = options.target?.copy() ?? new Point3(0, 0, -1)
        this._up = options.up?.copy() ?? new Vector3(0, 1, 0)
        this._near = 0.1
        this._far = 1000

        this._viewMatrix = Matrix4.identity()
        this._projectionMatrix = Matrix4.identity()
        this._viewProjectionMatrix = Matrix4.identity()
        this._dirty = true
        // 注意：子类构造函数末尾需自行调用 this.updateMatrices()
    }

    // ── 位置 ──

    get position(): Point3 {
        return this._position.copy()
    }

    set position(pos: Point3) {
        this._position = pos.copy()
        this._dirty = true
    }

    setPosition(pos: Point3): this {
        this._position = pos.copy()
        this._dirty = true
        return this
    }

    translate(offset: Vector3): this {
        this._position = this._position.add(offset)
        this._dirty = true
        return this
    }

    // ── 目标点 ──

    get target(): Point3 {
        return this._target.copy()
    }

    set target(tgt: Point3) {
        this._target = tgt.copy()
        this._dirty = true
    }

    setTarget(tgt: Point3): this {
        this._target = tgt.copy()
        this._dirty = true
        return this
    }

    /**
     * 设置相机朝向目标点（可选更新 up 向量），返回更新后的视图矩阵。
     *
     * 符合图形学惯例：lookAt 的产物是 View Matrix。
     */
    lookAt(tgt: Point3, up?: Vector3): Matrix4 {
        this._target = tgt.copy()
        if (up) this._up = up.copy()
        this._dirty = true
        return this.viewMatrix
    }

    // ── 上方向 ──

    get up(): Vector3 {
        return this._up.copy()
    }

    set up(upVector: Vector3) {
        this._up = upVector.copy()
        this._dirty = true
    }

    setUp(upVector: Vector3): this {
        this._up = upVector.copy()
        this._dirty = true
        return this
    }

    // ── 近远裁剪平面 ──

    get near(): number {
        return this._near
    }

    set near(nearPlane: number) {
        this._near = nearPlane
        this._dirty = true
    }

    get far(): number {
        return this._far
    }

    set far(farPlane: number) {
        this._far = farPlane
        this._dirty = true
    }

    // ── 相机移动 ──

    moveForward(distance: number): this {
        const direction = this.getDirection()
        this._position = this._position.add(direction.scale(distance))
        this._dirty = true
        return this
    }

    moveBackward(distance: number): this {
        return this.moveForward(-distance)
    }

    moveRight(distance: number): this {
        const right = this.getRight()
        this._position = this._position.add(right.scale(distance))
        this._dirty = true
        return this
    }

    moveLeft(distance: number): this {
        return this.moveRight(-distance)
    }

    moveUp(distance: number): this {
        this._position = this._position.add(this._up.scale(distance))
        this._dirty = true
        return this
    }

    moveDown(distance: number): this {
        return this.moveUp(-distance)
    }

    // ── 方向向量 ──

    getDirection(): Vector3 {
        return this._target.subtract(this._position).normalized
    }

    getRight(): Vector3 {
        const direction = this.getDirection()
        return direction.cross(this._up).normalized
    }

    getUp(): Vector3 {
        const right = this.getRight()
        const direction = this.getDirection()
        return right.cross(direction).normalized
    }

    // ── 矩阵 getter（含 dirty 自动更新）──

    get viewMatrix(): Matrix4 {
        if (this._dirty) this.updateMatrices()
        return this._viewMatrix.copy()
    }

    get projectionMatrix(): Matrix4 {
        if (this._dirty) this.updateMatrices()
        return this._projectionMatrix.copy()
    }

    get viewProjectionMatrix(): Matrix4 {
        if (this._dirty) this.updateMatrices()
        return this._viewProjectionMatrix.copy()
    }

    // ── 视口尺寸（子类实现）──

    public abstract getSize(): { width: number; height: number }

    // ── 矩阵更新 ──

    /**
     * 更新 V、P、VP 矩阵。
     * 子类通过 override updateViewMatrix() / updateProjectionMatrix() 提供各自的矩阵实现。
     */
    protected updateMatrices(): void {
        this.updateViewMatrix()
        this.updateProjectionMatrix()
        this._viewProjectionMatrix = this._projectionMatrix.multiply(this._viewMatrix)
        this._dirty = false
    }

    /**
     * 更新视图矩阵。
     * 默认使用 lookAt；2D 正交相机可 override 为 identity。
     */
    protected updateViewMatrix(): void {
        this._viewMatrix = Matrix4.lookAt(
            [this._position.x, this._position.y, this._position.z],
            [this._target.x, this._target.y, this._target.z],
            [this._up.x, this._up.y, this._up.z]
        )
    }

    /**
     * 更新投影矩阵（子类必须实现）。
     */
    protected abstract updateProjectionMatrix(): void

    // ── 序列化 ──

    toJSON(): any {
        return {
            position: this._position.toJSON(),
            target: this._target.toJSON(),
            up: this._up.toJSON(),
        }
    }

    // ── 重置 ──

    reset(): this {
        this._position = new Point3(0, 0, 5)
        this._target = new Point3(0, 0, 0)
        this._up = new Vector3(0, 1, 0)
        this._near = 0.1
        this._far = 1000
        this._dirty = true
        return this
    }

}
