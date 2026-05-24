import Matrix4 from '@/foundation/math/Matrix4'
import Vector3 from '@/foundation/math/Vector3'
import { CameraType } from '@/foundation/constants'

export interface BaseCameraOptions {
    position?: [number, number, number]
    target?: [number, number, number]
    up?: [number, number, number]
}

export default class BaseCamera {
    public readonly type: CameraType = CameraType.BASE
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
        // 默认参数
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
        // 基础相机不关心近远裁剪平面，这里只给一个默认值，具体相机（透视 / 正交）自己决定是否使用和如何暴露
        this._near = 0.1
        this._far = 1000

        // 初始化矩阵
        this._viewMatrix = Matrix4.identity()
        this._projectionMatrix = Matrix4.identity()
        this._viewProjectionMatrix = Matrix4.identity()
        this._dirty = true

        this.updateMatrices()
    }

    // 位置相关方法
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

    // 目标点相关方法
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

    // 上方向相关方法
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

    // 投影参数
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

    // 相机移动方法
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

    // 相机旋转方法
    rotateAroundTarget(horizontalAngle: number, verticalAngle: number): this {
        const direction = new Vector3(
            this._target.x - this._position.x,
            this._target.y - this._position.y,
            this._target.z - this._position.z
        )
        const distance = direction.length

        // 水平旋转（绕Y轴）
        const horizontalRotation = Matrix4.rotationY(horizontalAngle)
        const rotatedDirection = this.applyMatrixToVector(direction, horizontalRotation)

        // 垂直旋转（绕右向量）
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

    // 获取相机方向向量
    getDirection(): Vector3 {
        const direction = new Vector3(
            this._target.x - this._position.x,
            this._target.y - this._position.y,
            this._target.z - this._position.z
        )
        return direction.normalized
    }

    // 获取相机右向量
    getRight(): Vector3 {
        const direction = this.getDirection()
        return direction.cross(this._up).normalized
    }

    // 获取相机上向量
    getUp(): Vector3 {
        const right = this.getRight()
        const direction = this.getDirection()
        return right.cross(direction).normalized
    }

    // 矩阵获取方法
    get viewMatrix(): Matrix4 {
        if (this._dirty) {
            this.updateMatrices()
        }
        return this._viewMatrix.copy()
    }

    get projectionMatrix(): Matrix4 {
        if (this._dirty) {
            this.updateMatrices()
        }
        return this._projectionMatrix.copy()
    }

    get viewProjectionMatrix(): Matrix4 {
        if (this._dirty) {
            this.updateMatrices()
        }
        return this._viewProjectionMatrix.copy()
    }

    // 获取视口尺寸的默认实现
    public getSize(): { width: number, height: number } {
        return { width: 800, height: 600 }
    }

    // 更新矩阵
    protected updateMatrices(): void {
        // 更新视图矩阵
        this._viewMatrix = Matrix4.lookAt(
            [this._position.x, this._position.y, this._position.z],
            [this._target.x, this._target.y, this._target.z],
            [this._up.x, this._up.y, this._up.z]
        )
        // 基础相机不计算投影矩阵，只使用单位矩阵
        this._projectionMatrix = Matrix4.identity()

        // 更新视图投影矩阵
        this._viewProjectionMatrix = this._projectionMatrix.copy().multiply(this._viewMatrix.copy())
        this._dirty = false
    }

    // 世界坐标转屏幕坐标（基础相机直接使用视图矩阵）
    worldToScreen(worldPos: [number, number, number], screenWidth: number, screenHeight: number): [number, number] | null {
        if (this._dirty) {
            this.updateMatrices()
        }

        // 将世界坐标转换为齐次坐标
        const worldVec = new Vector3(worldPos[0], worldPos[1], worldPos[2])

        // 应用视图矩阵（基础相机不使用投影矩阵）
        const viewPos = this.applyMatrixToVector(worldVec, this._viewMatrix)

        // 基础相机直接使用视图坐标，不需要透视除法
        const ndcX = viewPos.x
        const ndcY = viewPos.y

        // 转换为屏幕坐标（假设视图坐标范围是[-1, 1]）
        const screenX = (ndcX + 1) * 0.5 * screenWidth
        const screenY = (1 - ndcY) * 0.5 * screenHeight

        return [screenX, screenY]
    }

    // 屏幕坐标转世界坐标（基础相机直接使用视图矩阵）
    screenToWorld(screenPos: [number, number], depth: number, screenWidth: number, screenHeight: number): [number, number, number] | null {
        if (this._dirty) {
            this.updateMatrices()
        }

        // 转换为NDC坐标
        const ndcX = (screenPos[0] / screenWidth) * 2 - 1
        const ndcY = 1 - (screenPos[1] / screenHeight) * 2

        // 创建视图坐标
        const viewPos = new Vector3(ndcX, ndcY, depth)

        // 计算视图矩阵的逆矩阵
        const invViewMatrix = this._viewMatrix.inverse()

        // 应用逆矩阵
        const worldPos = this.applyMatrixToVector(viewPos, invViewMatrix)

        return [worldPos.x, worldPos.y, worldPos.z]
    }

    // ── 序列化 ──
    toJSON(): any {
        return {
            position: [this._position.x, this._position.y, this._position.z],
            target: [this._target.x, this._target.y, this._target.z],
            up: [this._up.x, this._up.y, this._up.z],
        }
    }

    static fromJSON(data: any): BaseCamera {
        return new BaseCamera({
            position: data.position,
            target: data.target,
            up: data.up,
        })
    }

    // 重置相机
    reset(): this {
        this._position = new Vector3(0, 0, 5)
        this._target = new Vector3(0, 0, 0)
        this._up = new Vector3(0, 1, 0)
        this._near = 0.1
        this._far = 1000
        this._dirty = true
        return this
    }

    // 辅助方法
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
