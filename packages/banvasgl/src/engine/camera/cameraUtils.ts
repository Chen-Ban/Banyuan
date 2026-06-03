/**
 * cameraUtils —— 屏幕坐标转换工具函数
 *
 * 提供世界坐标 ↔ 屏幕坐标的转换，供设计态和流程图编辑态共用。
 *
 * 坐标转换链路：
 *   screenToWorld：clientX/Y → canvasX/Y（CSS 像素）→ 逻辑坐标（× logicalSize/styleSize）→ VP⁻¹ → 世界坐标
 *   worldToScreen：世界坐标 → VP → 逻辑坐标 → canvasX/Y（÷ logicalSize/styleSize）→ + DOM 偏移 → 屏幕坐标
 *
 * 相机只在画布逻辑空间中工作，不关心样式尺寸和 DOM 偏移。
 * 样式尺寸到逻辑尺寸的映射（含长边适配缩放）在此处处理。
 */

import { Point3 } from "@/foundation/math/index.js";
import { OrthographicCamera } from "./OrthographicCamera.js";
import type { Scene } from "@/engine/scene/Scene";

/**
 * 将 clientX/clientY 转为世界坐标
 *
 * 链路：
 *   1. client 坐标 → canvas CSS 像素坐标（减去 canvas 在页面中的偏移）
 *   2. CSS 像素 → 画布逻辑坐标（乘以 逻辑尺寸/样式尺寸 比例）
 *   3. 逻辑坐标左乘 VP 逆矩阵 → 世界坐标
 */
export function screenToWorld(
  clientX: number,
  clientY: number,
  scene: Scene,
  canvas: HTMLCanvasElement,
): Point3 {
  const rect = canvas.getBoundingClientRect();

  // 1. client → canvas CSS 像素
  const canvasX = clientX - rect.left;
  const canvasY = clientY - rect.top;

  // 2. CSS 像素 → 画布逻辑坐标
  const camera = scene.camera;
  const { width: logicalW, height: logicalH } = camera.getSize();
  const logicalX = canvasX * (logicalW / rect.width);
  const logicalY = canvasY * (logicalH / rect.height);

  // 3. 逻辑坐标左乘 VP 逆矩阵 → 世界坐标
  const vpInverse = camera.viewProjectionMatrix.inverse();

  return vpInverse.multiply(new Point3(logicalX, logicalY, 0));
}

/**
 * 世界坐标 → 屏幕 CSS 坐标（相对于 canvas 元素的 offsetParent）
 *
 * 链路：
 *   1. 世界坐标左乘 VP 矩阵 → 画布逻辑坐标
 *   2. 逻辑坐标 → CSS 像素（除以 逻辑尺寸/样式尺寸 比例）
 *   3. 加上 canvas 的 DOM 偏移 → 屏幕坐标
 */
export function worldToScreen(
  worldX: number,
  worldY: number,
  scene: Scene,
  canvas: HTMLCanvasElement,
): { x: number; y: number } {
  const camera = scene.camera;

  // 1. 世界坐标 → 逻辑坐标
  const vpMatrix = camera.viewProjectionMatrix;
  const logical = vpMatrix.multiply(new Point3(worldX, worldY, 0));

  // 2. 逻辑坐标 → CSS 像素
  const { width: logicalW, height: logicalH } = camera.getSize();
  const rect = canvas.getBoundingClientRect();
  const cssX = logical.x * (rect.width / logicalW);
  const cssY = logical.y * (rect.height / logicalH);

  // 3. 加 DOM 偏移
  return {
    x: cssX + canvas.offsetLeft,
    y: cssY + canvas.offsetTop,
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
