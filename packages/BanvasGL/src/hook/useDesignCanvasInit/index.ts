import { useCallback, useEffect, useRef, useState } from "react";
import { App } from "@/core/app";
import { BaseCamera, Scene } from "@/core";
import type { IAppOptions } from "@/core/interfaces";
import type { IRendererOptions } from "@/core/interfaces/IRenderer";

// ── BOM 属性（内联，避免跨目录依赖） ──
function useBOMProperties(): { dpr: number } {
  const [dpr, setDpr] = useState<number>(() =>
    typeof window !== "undefined" ? window.devicePixelRatio ?? 1 : 1,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setDpr(window.devicePixelRatio ?? 1);
    window.addEventListener("change", update);
    return () => window.removeEventListener("change", update);
  }, []);

  return { dpr };
}

// ── 公共类型 ──

export type SerializedPageJSON = string;

/**
 * 设计时画布初始化选项
 *
 * 未来可在此扩展设计器专属配置，例如：
 *   - showGrid?: boolean        — 显示网格
 *   - showRuler?: boolean       — 显示标尺
 *   - backgroundColor?: string — 画布背景色
 */
export interface UseDesignCanvasOptions {
  width: number;
  height: number;
  appOptions?: IAppOptions;
  rendererOptions?: Omit<IRendererOptions, "dpr">;
}

export interface UseDesignCanvasInitResult {
  app: App | null;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  canvasCallbackRef: (node: HTMLCanvasElement | null) => void;
}

/**
 * useDesignCanvasInit — 设计时底层 Canvas 初始化 hook
 *
 * 职责：
 *   1. 创建并销毁 App 实例
 *   2. 将序列化页面数据反序列化到 App
 *   3. 响应尺寸 / DPR 变化
 *
 * 被 useDesignBanvas、useFlowBanvas 使用。
 * 不包含任何事件绑定或业务逻辑。
 *
 * 未来可在此添加画布背景、网格、标尺等设计器专属配置。
 */
export function useDesignCanvasInit(
  serializedPages: SerializedPageJSON[],
  options: UseDesignCanvasOptions,
): UseDesignCanvasInitResult {
  const { dpr } = useBOMProperties();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvasNode, setCanvasNode] = useState<HTMLCanvasElement | null>(null);
  const [app, setApp] = useState<App | null>(null);

  // callback ref：同步更新 canvasRef + 触发 state 变化
  const canvasCallbackRef = useCallback((node: HTMLCanvasElement | null) => {
    canvasRef.current = node;
    setCanvasNode(node);
  }, []);

  // 统一设置画布逻辑尺寸与样式尺寸
  const applyCanvasSize = useCallback(() => {
    if (!canvasNode) return;
    canvasNode.style.width = `${options.width}px`;
    canvasNode.style.height = `${options.height}px`;
    canvasNode.width = options.width * dpr;
    canvasNode.height = options.height * dpr;
  }, [canvasNode, options.width, options.height, dpr]);

  // Effect 1: App 初始化（canvas 就绪后创建）
  useEffect(() => {
    if (!canvasNode) return;

    applyCanvasSize();

    const _app = App.create(canvasNode, options.appOptions ?? {}, {
      ...options.rendererOptions,
      dpr,
    });
    _app.launch({});
    setApp(_app);

    return () => {
      _app.destroy();
      setApp(null);
    };
  }, [canvasNode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Effect 2: 页面初始化（将序列化数据填充到 app）
  useEffect(() => {
    if (!app) return;

    const existingScenes = app.getScenes();
    existingScenes.forEach((scene) => app.removeScene(scene));

    if (Array.isArray(serializedPages) && serializedPages.length > 0) {
      app.initFromSerializedScenes(serializedPages);
    } else {
      const camera = new BaseCamera();
      const scene = new Scene(camera);
      app.addScene(scene);
      app.navigateTo(scene);
    }

    app.notify();
  }, [app, serializedPages]);

  // Effect 3: 尺寸 / DPR 变化时更新画布
  useEffect(() => {
    if (!canvasNode || !app) return;
    applyCanvasSize();
    app.renderer.setDPR(dpr);
  }, [app, applyCanvasSize, dpr]);

  return { app, canvasRef, canvasCallbackRef };
}
