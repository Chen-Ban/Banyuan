import Matrix4 from '@/foundation/math/Matrix4'
import Vector3 from '@/foundation/math/Vector3'
import { CameraType } from '@/foundation/constants'

export interface BaseCameraOptions {
    position?: [number, number, number]
    target?: [number, number, number]
    up?: [number, number, number]
}

export abstract class BaseCamera {
    public abstract readonly type: CameraType
    protected _position: Vector3
    protected _target: Vector3
    protected _up: Vector3
    protected _near: number
    protected _far: number

    protected _viewMatrix: Matrix4
    protected _projectionMatrix: Matrix4
    protected _viewProjectionMatrix: Matrix4
    protected _dirty: boolean

    constructor(options: BaseCameraOptions = {}) {
        this._position = new Vector3(
            options.position?.[0] ?? 0,
            options.position?.[1] ?? 0,
            options.position?.[2] ?? 0
        )
        this._target = new Vector3(
            options.target?.[0] ?? 0,
            options.target?.[1] ?? 0,
            options.target?.[2] ?? -1
        )
        this._up = new Vector3(
            options.up?.[0] ?? 0,
            options.up?.[1] ?? 1,
            options.up?.[2] ?? 0
        )
        this._near = 0.1
        this._far = 1000

        this._viewMatrix = Matrix4.identity()
        this._projectionMatrix = Matrix4.identity()
        this._viewProjectionMatrix = Matrix4.identity()
        this._dirty = true
        // 注意：子类构造函数末尾需自行调用 this.updateMatrices()
    }

    // ── 位置 ──

    get position(): Vector3 {
        return this._position.copy()
    }

    set position(pos: Vector3 | [number, number, number]) {
        if (pos instanceof Vector3) {
            this._position = pos.copy()
        } else {
            this._position = new Vector3(pos[0], pos[1], pos[2])
        }
        this._dirty = true
    }

    setPosition(x: number, y: number, z: number): this {
        this._position = new Vector3(x, y, z)
        this._dirty = true
        return this
    }

    translate(x: number, y: number, z: number): this {
        this._position = this._position.add(new Vector3(x, y, z))
        this._dirty = true
        return this
    }

    // ── 目标点 ──

    get target(): Vector3 {
        return this._target.copy()
    }

    set target(tgt: Vector3 | [number, number, number]) {
        if (tgt instanceof Vector3) {
            this._target = tgt.copy()
        } else {
            this._target = new Vector3(tgt[0], tgt[1], tgt[2])
        }
        this._dirty = true
    }

    setTarget(x: number, y: number, z: number): this {
        this._target = new Vector3(x, y, z)
        this._dirty = true
        return this
    }

    lookAt(x: number, y: number, z: number): this {
        this.setTarget(x, y, z)
        return this
    }

    // ── 上方向 ──

    get up(): Vector3 {
        return this._up.copy()
    }

    set up(upVector: Vector3 | [number, number, number]) {
        if (upVector instanceof Vector3) {
            this._up = upVector.copy()
        } else {
            this._up = new Vector3(upVector[0], upVector[1], upVector[2])
        }
        this._dirty = true
    }

    setUp(x: number, y: number, z: number): this {
        this._up = new Vector3(x, y, z)
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
        this._position = this._position.add(new Vector3(
            direction.x * distance,
            direction.y * distance,
            direction.z * distance
        ))
        this._dirty = true
        return this
    }

    moveBackward(distance: number): this {
        return this.moveForward(-distance)
    }

    moveRight(distance: number): this {
        const right = this.getRight()
        this._position = this._position.add(new Vector3(
            right.x * distance,
            right.y * distance,
            right.z * distance
        ))
        this._dirty = true
        return this
    }

    moveLeft(distance: number): this {
        return this.moveRight(-distance)
    }

    moveUp(distance: number): this {
        this._position = this._position.add(new Vector3(
            this._up.x * distance,
            this._up.y * distance,
            this._up.z * distance
        ))
        this._dirty = true
        return this
    }

    moveDown(distance: number): this {
        return this.moveUp(-distance)
    }

    // ── 相机旋转 ──

    rotateAroundTarget(horizontalAngle: number, verticalAngle: number): this {
        const direction = new Vector3(
            this._target.x - this._position.x,
            this._target.y - this._position.y,
            this._target.z - this._position.z
        )
        const distance = direction.length

        const horizontalRotation = Matrix4.rotationY(horizontalAngle)
        const rotatedDirection = this.applyMatrixToVector(direction, horizontalRotation)

        const right = this.getRight()
        const verticalRotation = this.createRotationMatrix(right, verticalAngle)
        const finalDirection = this.applyMatrixToVector(rotatedDirection, verticalRotation)

        this._position = new Vector3(
            this._target.x - finalDirection.x * distance,
            this._target.y - finalDirection.y * distance,
            this._target.z - finalDirection.z * distance
        )
        this._dirty = true
        return this
    }

    // ── 方向向量 ──

    getDirection(): Vector3 {
        const direction = new Vector3(
            this._target.x - this._position.x,
            this._target.y - this._position.y,
            this._target.z - this._position.z
        )
        return direction.normalized
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
            position: [this._position.x, this._position.y, this._position.z],
            target: [this._target.x, this._target.y, this._target.z],
            up: [this._up.x, this._up.y, this._up.z],
        }
    }

    // ── 重置 ──

    reset(): this {
        this._position = new Vector3(0, 0, 5)
        this._target = new Vector3(0, 0, 0)
        this._up = new Vector3(0, 1, 0)
        this._near = 0.1
        this._far = 1000
        this._dirty = true
        return this
    }

    // ── 工具方法（供子类使用）──

    protected applyMatrixToVector(vector: Vector3, matrix: Matrix4): Vector3 {
        const x = vector.x * matrix.get(0, 0) + vector.y * matrix.get(0, 1) + vector.z * matrix.get(0, 2)
        const y = vector.x * matrix.get(1, 0) + vector.y * matrix.get(1, 1) + vector.z * matrix.get(1, 2)
        const z = vector.x * matrix.get(2, 0) + vector.y * matrix.get(2, 1) + vector.z * matrix.get(2, 2)
        return new Vector3(x, y, z)
    }

    protected createRotationMatrix(axis: Vector3, angle: number): Matrix4 {
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        const oneMinusCos = 1 - cos

        const x = axis.x
        const y = axis.y
        const z = axis.z

        const matrix = Matrix4.identity()
        matrix.set(0, 0, cos + x * x * oneMinusCos)
        matrix.set(0, 1, x * y * oneMinusCos - z * sin)
        matrix.set(0, 2, x * z * oneMinusCos + y * sin)

        matrix.set(1, 0, y * x * oneMinusCos + z * sin)
        matrix.set(1, 1, cos + y * y * oneMinusCos)
        matrix.set(1, 2, y * z * oneMinusCos - x * sin)

        matrix.set(2, 0, z * x * oneMinusCos - y * sin)
        matrix.set(2, 1, z * y * oneMinusCos + x * sin)
        matrix.set(2, 2, cos + z * z * oneMinusCos)

        return matrix
    }
}
