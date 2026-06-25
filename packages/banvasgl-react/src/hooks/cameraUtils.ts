/**
 * cameraUtils — 屏幕坐标转换工具（Web 平台）
 *
 * 提供世界坐标 ↔ 屏幕坐标的转换，供设计态和流程图编辑态共用。
 *
 * 坐标转换链路：
 *   screenToWorld：clientX/Y → canvasX/Y（CSS 像素偏移）→ 缩放归一化 → Camera.screenToWorld → 世界坐标
 *   worldToScreen：世界坐标 → Camera.worldToScreen → canvasX/Y → 缩放 + DOM 偏移 → 屏幕坐标
 *
 * Web 平台层负责 DOM 坐标偏移和 CSS 像素缩放；Camera 负责纯 VP 矩阵变换。
 */

import { Point3 } from '@banyuan/banvasgl'
import type { IScene, IOrthographicCamera } from '@banyuan/banvasgl'

/**
 * Duck-type check: does the camera have orthographic bounds?
 */
function isOrthographicCamera(camera: unknown): camera is IOrthographicCamera {
  return typeof camera === 'object' && camera !== null && 'left' in camera && 'right' in camera
}

/**
 * 将 clientX/clientY 转为世界坐标
 */
export function screenToWorld(
  clientX: number,
  clientY: number,
  scene: IScene,
  canvas: HTMLCanvasElement,
): Point3 {
  const rect = canvas.getBoundingClientRect()

  const canvasX = clientX - rect.left
  const canvasY = clientY - rect.top

  const camera = scene.camera
  const { width: logicalW, height: logicalH } = camera.getSize()
  const domX = canvasX * (logicalW / rect.width)
  const domY = canvasY * (logicalH / rect.height)

  const [wx, wy, wz] = camera.screenToWorld(domX, domY)
  return new Point3(wx, wy, wz)
}

/**
 * 世界坐标 → 屏幕 CSS 坐标（相对于 canvas 元素的 offsetParent）
 */
export function worldToScreen(
  worldX: number,
  worldY: number,
  scene: IScene,
  canvas: HTMLCanvasElement,
): { x: number; y: number } {
  const camera = scene.camera

  const [lx, ly] = camera.worldToScreen(worldX, worldY)

  const { width: logicalW, height: logicalH } = camera.getSize()
  const rect = canvas.getBoundingClientRect()
  const cssX = lx * (rect.width / logicalW)
  const cssY = ly * (rect.height / logicalH)

  return {
    x: cssX + canvas.offsetLeft,
    y: cssY + canvas.offsetTop,
  }
}

/**
 * 获取当前相机的 zoom level（相对于初始视口的缩放比例）
 */
export function getCameraZoomLevel(scene: IScene, canvasWidth: number): number {
  const camera = scene.camera
  if (isOrthographicCamera(camera)) {
    const viewportWidth = camera.right - camera.left
    return canvasWidth / viewportWidth
  }
  return 1
}
