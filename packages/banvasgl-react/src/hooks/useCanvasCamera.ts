/**
 * useCanvasCamera —— 相机驱动的无限画布交互 hook
 *
 * 职责：
 *   1. Wheel 事件 → camera zoom（Ctrl/Cmd + Wheel）或 pan（普通 Wheel / 两指滑动）
 *   2. Canvas 容器 resize → 同步更新 camera bounds
 *
 * Pan 交互（Space+Drag / 中键拖拽）已迁移到 actions.page.panStart/panMove/panEnd，
 * 由业务交互层（useCanvasEvents / useFlowCanvasEvents）直接调用 actions。
 */

import { useCallback, useEffect, useRef } from "react";
import { App } from '@banyuan/banvasgl'
import { OrthographicCamera } from '@banyuan/banvasgl'
import { Point3 } from '@banyuan/banvasgl'

const MIN_ZOOM_LEVEL = 0.1; // 最小缩放比（视口 = 初始 × 10）
const MAX_ZOOM_LEVEL = 10; // 最大缩放比（视口 = 初始 / 10）
const ZOOM_SENSITIVITY = 0.005; // 滚轮缩放灵敏度

export interface UseCanvasCameraOptions {
  app: App | null;
  canvas: HTMLCanvasElement | null;
  /** 是否启用相机交互（运行态可关闭） */
  enabled?: boolean;
}

export interface UseCanvasCameraResult {
  /** 更新相机视口以匹配容器尺寸（resize 时调用） */
  syncCameraToContainer: (containerWidth: number, containerHeight: number, dpr: number) => void;
}

export function useCanvasCamera({
  app,
  canvas,
  enabled = true,
}: UseCanvasCameraOptions): UseCanvasCameraResult {
  // 记录初始视口宽度，用于计算 zoom level 并做 clamp
  const initialViewportWidthRef = useRef<number>(0);

  // ── Wheel 事件：zoom-to-cursor / pan ──
  useEffect(() => {
    if (!enabled) return;
    if (!canvas || !app) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const scene = app.getCurrentScene();
      if (!scene) return;
      const camera = scene.camera;
      if (!(camera instanceof OrthographicCamera)) {
        console.warn('[useCanvasCamera] Camera is not OrthographicCamera, zoom/pan disabled.');
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        // ── Pinch / Ctrl+Wheel → zoom-to-cursor ──
        // offsetX/Y 是相对于 canvas 的 CSS 像素坐标
        const cursorX = e.offsetX;
        const cursorY = e.offsetY;

        // CSS 像素 → 画布逻辑坐标
        const { width: logicalW, height: logicalH } = camera.getSize();
        const logicalX = cursorX * (logicalW / canvas.clientWidth);
        const logicalY = cursorY * (logicalH / canvas.clientHeight);

        // 1. 记录缩放前鼠标下方的世界坐标（VP 逆变换）
        const vpInverse = camera.viewProjectionMatrix.inverse();
        const worldBefore = vpInverse.multiply(new Point3(logicalX, logicalY, 0));

        // 2. 计算缩放因子并 clamp
        const zoomDelta = -e.deltaY * ZOOM_SENSITIVITY;
        const factor = 1 / (1 + zoomDelta); // factor > 1 = 缩小视口 = 放大内容

        // clamp：检查缩放后是否超出范围
        const currentViewportWidth = camera.right - camera.left;
        const newViewportWidth = currentViewportWidth * factor;
        const initialWidth = initialViewportWidthRef.current || canvas.clientWidth;
        const newZoomLevel = initialWidth / newViewportWidth;

        if (newZoomLevel < MIN_ZOOM_LEVEL || newZoomLevel > MAX_ZOOM_LEVEL) {
          return; // 超出范围，不执行
        }

        // 3. 执行缩放
        camera.zoom(factor);

        // 4. 补偿偏移（zoom-to-cursor）：缩放后鼠标下方的世界坐标应与缩放前一致
        const vpInverseAfter = camera.viewProjectionMatrix.inverse();
        const worldAfter = vpInverseAfter.multiply(new Point3(logicalX, logicalY, 0));
        camera.pan(
          worldAfter.x - worldBefore.x,
          worldAfter.y - worldBefore.y,
        );
      } else {
        // ── 两指滑动 / 普通 Wheel → pan ──
        // deltaX/Y 是 CSS 像素增量，转为世界坐标增量
        const { width: logicalW, height: logicalH } = camera.getSize();
        const worldPerCssX = logicalW / canvas.clientWidth;
        const worldPerCssY = logicalH / canvas.clientHeight;

        // pan 的增量需要从逻辑坐标空间转到世界坐标空间
        // 对于纯平移相机，逻辑增量 = 世界增量（VP 的线性部分是 identity scale）
        // 通用做法：用 VP 逆矩阵变换增量向量
        camera.pan(-e.deltaX * worldPerCssX, -e.deltaY * worldPerCssY);
      }

      scene.markDirty();
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [app, canvas, enabled]);

  // ── 容器 resize 时同步 camera bounds ──
  const syncCameraToContainer = useCallback(
    (containerWidth: number, containerHeight: number, dpr: number) => {
      if (!app) return;
      const scene = app.getCurrentScene();
      if (!scene) return;
      const camera = scene.camera;
      if (!(camera instanceof OrthographicCamera)) {
        console.warn('[useCanvasCamera] Camera is not OrthographicCamera, resize sync disabled.');
        return;
      }

      // 更新 canvas 物理像素
      app.handleResize(containerWidth * dpr, containerHeight * dpr, dpr);

      // 保持当前 zoom level 不变，只调整视口宽高比
      const currentViewportWidth = camera.right - camera.left;
      const currentCenterX = (camera.left + camera.right) / 2;
      const currentCenterY = (camera.top + camera.bottom) / 2;

      // 根据新的宽高比调整视口高度
      const newAspect = containerWidth / containerHeight;
      const currentViewportHeight = currentViewportWidth / newAspect;

      camera.setBounds(
        currentCenterX - currentViewportWidth / 2,
        currentCenterX + currentViewportWidth / 2,
        currentCenterY + currentViewportHeight / 2,
        currentCenterY - currentViewportHeight / 2,
      );

      // 记录初始世界视口宽度（世界单位），作为 zoom level 基准
      // 注意：使用世界单位而非 CSS 像素，以与 handleWheel 中 newViewportWidth 量纲一致
      if (initialViewportWidthRef.current === 0) {
        initialViewportWidthRef.current = currentViewportWidth;
      }

      scene.markDirty();
    },
    [app],
  );

  return {
    syncCameraToContainer,
  };
}
