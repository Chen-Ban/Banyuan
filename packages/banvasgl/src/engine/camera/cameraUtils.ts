/**
 * cameraUtils —— 相机坐标转换工具函数
 *
 * 提供世界坐标 ↔ 屏幕坐标的转换，供设计态和流程图编辑态共用。
 *
 * 坐标转换链路：
 *   screenToWorld：clientX/Y → canvas 逻辑像素坐标 → camera.screenToWorld（VP 逆变换）→ 世界坐标
 *   worldToScreen：世界坐标 → camera.worldToScreen（VP 变换）→ canvas 逻辑像素坐标 → CSS 像素偏移
 */

import { Point3 } from "@/foundation/math/index.js";
import { OrthographicCamera } from "./OrthographicCamera.js";
import type { Scene } from "@/engine/scene/Scene";

/**
 * 将 clientX/clientY 转为世界坐标（经过 Camera VP 逆变换）
 *
 * 统一入口，适用于 MouseEvent、DragEvent、WheelEvent 等所有场景。
 */
export function screenToWorld(
  clientX: number,
  clientY: number,
  scene: Scene,
  canvas: HTMLCanvasElement,
): Point3 {
  const rect = canvas.getBoundingClientRect();
  // client 坐标 → canvas CSS 像素偏移（即逻辑像素坐标，与 VP 矩阵输出的坐标系一致）
  const canvasX = clientX - rect.left;
  const canvasY = clientY - rect.top;

  const camera = scene.camera;
  if (camera instanceof OrthographicCamera) {
    const [wx, wy] = camera.screenToWorld(canvasX, canvasY);
    return new Point3(wx, wy, 0);
  }

  // 降级：无正交相机时直接返回 canvas 逻辑像素坐标
  return new Point3(canvasX, canvasY, 0);
}

/**
 * 世界坐标 → 屏幕 CSS 坐标（相对于 canvas 元素的 offsetParent）
 *
 * 用于文本编辑 input 定位、ContextMenu 定位等需要将世界坐标映射到 DOM 位置的场景。
 */
export function worldToScreen(
  worldX: number,
  worldY: number,
  scene: Scene,
  canvas: HTMLCanvasElement,
): { x: number; y: number } {
  const camera = scene.camera;
  if (camera instanceof OrthographicCamera) {
    // VP 矩阵输出已是 CSS 逻辑像素坐标（setCanvasSize 传入的是 CSS 尺寸）
    const [cssX, cssY] = camera.worldToScreen(worldX, worldY);
    return { x: cssX + canvas.offsetLeft, y: cssY + canvas.offsetTop };
  }

  // 降级：无正交相机时直接使用世界坐标作为 CSS 像素
  return {
    x: worldX + canvas.offsetLeft,
    y: worldY + canvas.offsetTop,
  };
}

/**
 * 获取当前相机的 zoom level（相对于初始视口的缩放比例）
 *
 * zoomLevel > 1 表示放大（视口变小），< 1 表示缩小（视口变大）
 */
export function getCameraZoomLevel(scene: Scene, canvasWidth: number): number {
  const camera = scene.camera;
  if (camera instanceof OrthographicCamera) {
    const viewportWidth = camera.right - camera.left;
    return canvasWidth / viewportWidth;
  }
  return 1;
}
