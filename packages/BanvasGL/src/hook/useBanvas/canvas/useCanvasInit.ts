import { useCallback, useEffect, useRef, useState } from "react";
import { App } from "@/core/app";
import { BaseCamera, Scene } from "@/core";
import type { UseBanvasOptions, SerializedPageJSON } from "../types";
import { useBOMProperties } from "./useBOMProperties";

export interface UseCanvasInitResult {
  app: App | null;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  canvasCallbackRef: (node: HTMLCanvasElement | null) => void;
}

/**
 * Canvas 初始化逻辑
 */
export function useCanvasInit(
  serializedPages: SerializedPageJSON[],
  options: UseBanvasOptions,
): UseCanvasInitResult {
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
    const styleWidth = options.width;
    const styleHeight = options.height;
    canvasNode.style.width = `${styleWidth}px`;
    canvasNode.style.height = `${styleHeight}px`;
    canvasNode.width = styleWidth * dpr;
    canvasNode.height = styleHeight * dpr;
  }, [canvasNode, options.width, options.height, dpr]);

  // ===== Effect 1: App 初始化（canvas 就绪后创建壳子） =====
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

  // ===== Effect 2: 页面初始化（将序列化数据填充到 app 中） =====
  useEffect(() => {
    if (!app) return;

    // 清除已有的 scenes
    const existingScenes = app.getScenes();
    existingScenes.forEach((scene) => app.removeScene(scene));

    if (Array.isArray(serializedPages) && serializedPages.length > 0) {
      // 有序列化数据，反序列化加载
      app.initFromSerializedScenes(serializedPages);
    } else {
      // 无数据，创建默认空白页面
      const camera = new BaseCamera();
      const scene = new Scene(camera);
      app.addScene(scene);
      app.navigateTo(scene);
    }

    // 通知订阅者初始状态已就绪，触发 pages 构建
    app.notify();
  }, [app, serializedPages]);

  // ===== Effect 3: 尺寸/dpr 变化时更新画布 =====
  useEffect(() => {
    if (!canvasNode || !app) return;
    applyCanvasSize();
    app.renderer.setDPR(dpr);
  }, [app, applyCanvasSize, dpr]);

  return { app, canvasRef, canvasCallbackRef };
}
