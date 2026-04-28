/**
 * Camera 接口层 —— 零循环依赖
 *
 * 所有 Camera 子类的公共接口定义。
 * 社区插件通过 interface 访问 Camera 对象，无需 import 具体 class。
 */

import type { Matrix4, Vector3 } from '@/core/math'

// ────────────────────────────────────────────
//  Camera 基础接口
// ────────────────────────────────────────────

/** BaseCamera 的公共契约 */
export interface ICamera {
    // 空间属性
    position: Vector3
    target: Vector3
    up: Vector3
    near: number
    far: number

    // 矩阵（只读）
    readonly viewMatrix: Matrix4
    readonly projectionMatrix: Matrix4
    readonly viewProjectionMatrix: Matrix4

    // 位置控制
    setPosition(x: number, y: number, z: number): ICamera
    translate(x: number, y: number, z: number): ICamera
    setTarget(x: number, y: number, z: number): ICamera
    lookAt(x: number, y: number, z: number): ICamera
    setUp(x: number, y: number, z: number): ICamera

    // 移动
    moveForward(distance: number): ICamera
    moveBackward(distance: number): ICamera
    moveRight(distance: number): ICamera
    moveLeft(distance: number): ICamera
    moveUp(distance: number): ICamera
    moveDown(distance: number): ICamera

    // 旋转
    rotateAroundTarget(horizontalAngle: number, verticalAngle: number): ICamera

    // 方向查询
    getDirection(): Vector3
    getRight(): Vector3
    getUp(): Vector3
    getSize(): { width: number; height: number }

    // 坐标转换
    worldToScreen(
        worldPos: [number, number, number],
        screenWidth: number,
        screenHeight: number
    ): [number, number] | null
    screenToWorld(
        screenPos: [number, number],
        depth: number,
        screenWidth: number,
        screenHeight: number
    ): [number, number, number] | null

    // 重置
    reset(): ICamera
}

// ────────────────────────────────────────────
//  正交相机接口
// ────────────────────────────────────────────

/** OrthographicCamera 的公共契约 */
export interface IOrthographicCamera extends ICamera {
    left: number
    right: number
    bottom: number
    top: number
    readonly aspect: number

    setBounds(left: number, right: number, bottom: number, top: number): IOrthographicCamera
    getBounds(): { left: number; right: number; bottom: number; top: number }
    getViewportSize(): { width: number; height: number }
    setViewportSize(width: number, height: number): IOrthographicCamera
    setAspect(aspect: number): IOrthographicCamera
    zoom(factor: number): IOrthographicCamera
    pan(deltaX: number, deltaY: number): IOrthographicCamera
    fitToBounds(
        bounds: { left: number; right: number; bottom: number; top: number },
        padding?: number
    ): IOrthographicCamera
    isPointInViewport(point: [number, number, number]): boolean
    isRectInViewport(rect: { left: number; right: number; bottom: number; top: number }): boolean
    getViewportBounds(): { left: number; right: number; bottom: number; top: number }
    worldToViewport(worldPos: [number, number, number]): [number, number] | null
    viewportToWorld(viewportPos: [number, number], depth?: number): [number, number, number] | null
    copy(): IOrthographicCamera
}

// ────────────────────────────────────────────
//  透视相机接口
// ────────────────────────────────────────────

/** PerspectiveCamera 的公共契约 */
export interface IPerspectiveCamera extends ICamera {
    fov: number
    aspect: number
    width: number
    height: number
    readonly fovDegrees: number

    setFov(fieldOfView: number): IPerspectiveCamera
    setAspect(ratio: number): IPerspectiveCamera
    setWidth(w: number): IPerspectiveCamera
    setHeight(h: number): IPerspectiveCamera
    setViewportSize(width: number, height: number): IPerspectiveCamera
    setFovDegrees(degrees: number): IPerspectiveCamera
    getFrustum(): {
        nearWidth: number
        nearHeight: number
        farWidth: number
        farHeight: number
    }
    getFrustumVertices(): {
        near: [number, number, number][]
        far: [number, number, number][]
    }
    isPointInFrustum(point: [number, number, number]): boolean
    isSphereInFrustum(center: [number, number, number], radius: number): boolean
    copy(): IPerspectiveCamera
}
