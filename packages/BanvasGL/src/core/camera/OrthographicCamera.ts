import BaseCamera, { BaseCameraOptions } from './BaseCamera'
import Matrix4 from '@/core/math/Matrix4'
import Vector3 from '@/core/math/Vector3'

export interface OrthographicCameraOptions extends BaseCameraOptions {
    left?: number
    right?: number
    bottom?: number
    top?: number
    // 为后续 3D 正交相机做准备，允许配置近远裁剪平面
    near?: number
    far?: number
}

export default class OrthographicCamera extends BaseCamera {
    private _left: number
    private _right: number
    private _bottom: number
    private _top: number

    constructor(options: OrthographicCameraOptions = {}) {
        super(options)

        this._left = options.left ?? -10
        this._right = options.right ?? 10
        this._bottom = options.bottom ?? -10
        this._top = options.top ?? 10

        // 如果传入 near/far，则覆盖基类中的默认近远平面
        if (options.near != null) {
            this._near = options.near
        }
        if (options.far != null) {
            this._far = options.far
        }

        this.updateMatrices()

    }

    // 边界相关方法
    get left(): number {
        return this._left
    }

    set left(value: number) {
        this._left = value
        this._dirty = true
    }

    get right(): number {
        return this._right
    }

    set right(value: number) {
        this._right = value
        this._dirty = true
    }

    get bottom(): number {
        return this._bottom
    }

    set bottom(value: number) {
        this._bottom = value
        this._dirty = true
    }

    get top(): number {
        return this._top
    }

    set top(value: number) {
        this._top = value
        this._dirty = true
    }

    // 设置边界
    setBounds(left: number, right: number, bottom: number, top: number): this {
        this._left = left
        this._right = right
        this._bottom = bottom
        this._top = top
        this._dirty = true
        return this
    }

    // 获取边界信息
    getBounds(): { left: number, right: number, bottom: number, top: number } {
        return {
            left: this._left,
            right: this._right,
            bottom: this._bottom,
            top: this._top
        }
    }

    // 获取视口尺寸
    getViewportSize(): { width: number, height: number } {
        return {
            width: this._right - this._left,
            height: this._top - this._bottom
        }
    }

    // 获取视口尺寸（实现BaseCamera抽象方法）
    getSize(): { width: number, height: number } {
        return this.getViewportSize()
    }

    // 获取宽高比
    get aspect(): number {
        return (this._right - this._left) / (this._top - this._bottom)
    }

    // 设置视口尺寸（保持中心点不变）
    setViewportSize(width: number, height: number): this {
        const centerX = (this._left + this._right) / 2
        const centerY = (this._bottom + this._top) / 2

        this._left = centerX - width / 2
        this._right = centerX + width / 2
        this._bottom = centerY - height / 2
        this._top = centerY + height / 2

        this._dirty = true
        return this
    }

    // 设置宽高比（保持中心点和高度不变）
    setAspect(aspect: number): this {
        const centerX = (this._left + this._right) / 2
        const height = this._top - this._bottom
        const width = height * aspect

        this._left = centerX - width / 2
        this._right = centerX + width / 2

        this._dirty = true
        return this
    }

    // 缩放视口
    zoom(factor: number): this {
        const centerX = (this._left + this._right) / 2
        const centerY = (this._bottom + this._top) / 2
        const width = (this._right - this._left) * factor
        const height = (this._top - this._bottom) * factor

        this._left = centerX - width / 2
        this._right = centerX + width / 2
        this._bottom = centerY - height / 2
        this._top = centerY + height / 2

        this._dirty = true
        return this
    }

    // 平移视口
    pan(deltaX: number, deltaY: number): this {
        this._left += deltaX
        this._right += deltaX
        this._bottom += deltaY
        this._top += deltaY

        this._dirty = true
        return this
    }

    // 适应内容边界
    fitToBounds(bounds: { left: number, right: number, bottom: number, top: number }, padding: number = 0): this {
        const contentWidth = bounds.right - bounds.left
        const contentHeight = bounds.top - bounds.bottom
        const contentCenterX = (bounds.left + bounds.right) / 2
        const contentCenterY = (bounds.bottom + bounds.top) / 2

        // 计算需要的视口尺寸（包含padding）
        const viewportWidth = contentWidth + padding * 2
        const viewportHeight = contentHeight + padding * 2

        // 设置视口
        this._left = contentCenterX - viewportWidth / 2
        this._right = contentCenterX + viewportWidth / 2
        this._bottom = contentCenterY - viewportHeight / 2
        this._top = contentCenterY + viewportHeight / 2

        this._dirty = true
        return this
    }

    // 检查点是否在视口内
    isPointInViewport(point: [number, number, number]): boolean {
        if (this._dirty) {
            this.updateMatrices()
        }

        const worldVec = new Vector3(point[0], point[1], point[2])
        const clipPos = this.applyMatrixToVector(worldVec, this._viewProjectionMatrix)

        // 正交投影不需要透视除法
        const ndcX = clipPos.x
        const ndcY = clipPos.y
        const ndcZ = clipPos.z

        // 检查是否在NDC立方体内
        return ndcX >= -1 && ndcX <= 1 &&
            ndcY >= -1 && ndcY <= 1 &&
            ndcZ >= -1 && ndcZ <= 1
    }

    // 检查矩形是否在视口内
    isRectInViewport(rect: { left: number, right: number, bottom: number, top: number }): boolean {
        // 检查矩形是否与视口相交
        return !(rect.right < this._left ||
            rect.left > this._right ||
            rect.top < this._bottom ||
            rect.bottom > this._top)
    }

    // 获取视口边界框
    getViewportBounds(): { left: number, right: number, bottom: number, top: number } {
        return {
            left: this._left,
            right: this._right,
            bottom: this._bottom,
            top: this._top
        }
    }

    // 世界坐标转视口坐标
    worldToViewport(worldPos: [number, number, number]): [number, number] | null {
        if (this._dirty) {
            this.updateMatrices()
        }

        const worldVec = new Vector3(worldPos[0], worldPos[1], worldPos[2])
        const clipPos = this.applyMatrixToVector(worldVec, this._viewProjectionMatrix)

        // 正交投影不需要透视除法
        const ndcX = clipPos.x
        const ndcY = clipPos.y

        // 检查是否在视口内
        if (ndcX < -1 || ndcX > 1 || ndcY < -1 || ndcY > 1) {
            return null
        }

        // 转换为视口坐标
        const viewportX = this._left + (ndcX + 1) * 0.5 * (this._right - this._left)
        const viewportY = this._bottom + (ndcY + 1) * 0.5 * (this._top - this._bottom)

        return [viewportX, viewportY]
    }

    // 视口坐标转世界坐标
    viewportToWorld(viewportPos: [number, number], depth: number = 0): [number, number, number] | null {
        if (this._dirty) {
            this.updateMatrices()
        }

        // 转换为NDC坐标
        const ndcX = (viewportPos[0] - this._left) / (this._right - this._left) * 2 - 1
        const ndcY = (viewportPos[1] - this._bottom) / (this._top - this._bottom) * 2 - 1

        // 创建NDC坐标
        const ndcPos = new Vector3(ndcX, ndcY, depth)

        // 计算视图投影矩阵的逆矩阵
        const invViewProjection = this._viewProjectionMatrix.inverse()

        // 应用逆矩阵
        const worldPos = this.applyMatrixToVector(ndcPos, invViewProjection)

        return [worldPos.x, worldPos.y, worldPos.z]
    }

    // 实现抽象方法：更新投影矩阵
    protected updateProjectionMatrix(): void {
        this._projectionMatrix = Matrix4.orthographic(
            this._left,
            this._right,
            this._bottom,
            this._top,
            this._near,
            this._far
        )
    }

    // 复制相机
    copy(): OrthographicCamera {
        return new OrthographicCamera({
            position: [this._position.x, this._position.y, this._position.z],
            target: [this._target.x, this._target.y, this._target.z],
            up: [this._up.x, this._up.y, this._up.z],
            left: this._left,
            right: this._right,
            bottom: this._bottom,
            top: this._top,
            near: this._near,
            far: this._far,
        })
    }

    // 重置相机
    reset(): this {
        super.reset()
        this._left = -10
        this._right = 10
        this._bottom = -10
        this._top = 10
        this._dirty = true
        return this
    }
}
