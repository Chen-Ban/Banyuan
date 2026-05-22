/**
 * useCanvasZoom —— Canvas 缩放 hook（Web 平台适配）
 *
 * 核心思路：
 *   - 逻辑尺寸（canvas.width / canvas.height）始终等于用户配置的页面尺寸，
 *     JSON IR 坐标系统不受影响。
 *   - 样式尺寸（canvas.style.width / canvas.style.height）由缩放比例控制。
 *   - 初始化时按 contain 策略（长边适配内容区域）计算 initialScale。
 *   - Cmd+Wheel (macOS) / Ctrl+Wheel (Windows) 驱动缩放，屏蔽浏览器默认行为。
 *   - 缩放范围约束 [MIN_SCALE, MAX_SCALE]，确保不会模糊。
 *
 * 不修改 DPR，不影响 canvas 物理像素。
 */

import { useCallback, useEffect, useRef, useState } from "react";

// ── 常量 ──

/** 最小缩放比例 */
const MIN_SCALE = 0.1;
/** 最大缩放比例 */
const MAX_SCALE = 5;
/** 每次滚轮的缩放步进因子 */
const ZOOM_STEP = 0.002;

// ── 类型 ──

export interface UseCanvasZoomOptions {
  /** Canvas 逻辑宽度（px，即绘制坐标系宽度） */
  canvasWidth: number;
  /** Canvas 逻辑高度（px，即绘制坐标系高度） */
  canvasHeight: number;
  /** 内容区域宽度（px），即 canvas 可用的容器宽度 */
  containerWidth: number;
  /** 内容区域高度（px），即 canvas 可用的容器高度 */
  containerHeight: number;
  /** 自定义最小缩放（可选） */
  minScale?: number;
  /** 自定义最大缩放（可选） */
  maxScale?: number;
}

export interface UseCanvasZoomResult {
  /** 当前缩放比例 */
  scale: number;
  /** 样式宽度（px） */
  styleWidth: number;
  /** 样式高度（px） */
  styleHeight: number;
  /** 绑定到 canvas 外层容器的 ref callback */
  zoomContainerRef: (node: HTMLElement | null) => void;
}

/** contain 适配边距（单侧，px） */
const CONTAIN_PADDING = 12;

/**
 * 计算 contain 适配的缩放值：让长边贴合内容区域（两侧留 CONTAIN_PADDING 边距）
 */
function calcContainScale(
  canvasWidth: number,
  canvasHeight: number,
  containerWidth: number,
  containerHeight: number,
): number {
  if (canvasWidth <= 0 || canvasHeight <= 0) return 1;
  if (containerWidth <= 0 || containerHeight <= 0) return 1;
  const availableWidth = containerWidth - CONTAIN_PADDING * 2;
  const availableHeight = containerHeight - CONTAIN_PADDING * 2;
  if (availableWidth <= 0 || availableHeight <= 0) return 1;
  return Math.min(availableWidth / canvasWidth, availableHeight / canvasHeight);
}

/**
 * 约束缩放值到 [min, max] 区间
 */
function clampScale(scale: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, scale));
}

/**
 * useCanvasZoom — Canvas 滚轮缩放 hook
 *
 * 使用方式：
 *   将 zoomContainerRef 绑定到包裹 canvas 的容器元素上，
 *   然后将 styleWidth / styleHeight 应用到 canvas 的 style 上。
 */
export function useCanvasZoom(
  options: UseCanvasZoomOptions,
): UseCanvasZoomResult {
  const {
    canvasWidth,
    canvasHeight,
    containerWidth,
    containerHeight,
    minScale = MIN_SCALE,
    maxScale = MAX_SCALE,
  } = options;

  // 计算初始 contain 适配缩放
  const initialScale = calcContainScale(
    canvasWidth,
    canvasHeight,
    containerWidth,
    containerHeight,
  );

  const [scale, setScale] = useState<number>(() =>
    clampScale(initialScale, minScale, maxScale),
  );

  const containerNodeRef = useRef<HTMLElement | null>(null);

  // 当容器尺寸或画布尺寸变化时，重新计算 contain 适配
  useEffect(() => {
    const newInitial = calcContainScale(
      canvasWidth,
      canvasHeight,
      containerWidth,
      containerHeight,
    );
    const clamped = clampScale(newInitial, minScale, maxScale);
    setScale(clamped);
  }, [
    canvasWidth,
    canvasHeight,
    containerWidth,
    containerHeight,
    minScale,
    maxScale,
  ]);

  // Wheel 事件处理
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      // 仅响应 Cmd (macOS) 或 Ctrl (Windows/Linux) + wheel
      if (!e.metaKey && !e.ctrlKey) return;

      // 阻止浏览器默认缩放行为
      e.preventDefault();
      e.stopPropagation();

      const delta = -e.deltaY * ZOOM_STEP;
      setScale((prev) => clampScale(prev * (1 + delta), minScale, maxScale));
    },
    [minScale, maxScale],
  );

  // 绑定/解绑 wheel 事件
  useEffect(() => {
    const node = containerNodeRef.current;
    if (!node) return;

    // passive: false 才能 preventDefault
    node.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      node.removeEventListener("wheel", handleWheel);
    };
  }, [handleWheel]);

  // container ref callback
  const zoomContainerRef = useCallback((node: HTMLElement | null) => {
    containerNodeRef.current = node;
  }, []);

  // 计算样式尺寸
  const styleWidth = canvasWidth * scale;
  const styleHeight = canvasHeight * scale;

  return {
    scale,
    styleWidth,
    styleHeight,
    zoomContainerRef,
  };
}
