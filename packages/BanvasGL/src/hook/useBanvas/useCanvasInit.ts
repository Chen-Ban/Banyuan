import { useCallback, useEffect, useRef, useState } from "react";
import { App } from "@/core/app";
import { BaseCamera, Scene } from "@/core";
import type { UseBanvasOptions, SerializedSceneJSON } from "./types";
import { useBOMProperties } from "./useBOMProperties";

export interface UseCanvasInitResult {
  app: App | null;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

/**
 * Canvas 初始化逻辑
 */
export function useCanvasInit(
  serializedScenes: SerializedSceneJSON[],
  options: UseBanvasOptions,
): UseCanvasInitResult {
  // 获取 BOM 属性
  const { dpr } = useBOMProperties();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [app, setApp] = useState<App | null>(null);

  // 统一设置画布逻辑尺寸与样式尺寸
  const applyCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const styleWidth = options.width;
    const styleHeight = options.height;
    canvas.style.width = `${styleWidth}px`;
    canvas.style.height = `${styleHeight}px`;
    canvas.width = styleWidth * dpr;
    canvas.height = styleHeight * dpr;
  }, [options.width, options.height, dpr]);

  // ===== Effect 1: App 初始化（只创建壳子，不填充内容） =====
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    applyCanvasSize();

    const _app = App.create(canvas, options.appOptions ?? {}, {
      ...options.rendererOptions,
      dpr,
    });
    _app.launch({});
    setApp(_app);

    return () => {
      try {
        _app.destroy();
      } catch (error) {
        console.warn("Failed to destroy app in cleanup:", error);
      }
      setApp(null);
    };
  }, []);

  // ===== Effect 2: Scene 初始化（将 scenes 填充到 app 中） =====
  useEffect(() => {
    if (!app) return;

    // 清除已有的 scenes
    const existingScenes = app.getScenes();
    existingScenes.forEach((scene) => app.removeScene(scene));

    if (Array.isArray(serializedScenes) && serializedScenes.length > 0) {
      // 有序列化数据，反序列化加载
      app.initFromSerializedScenes(serializedScenes);
    } else {
      // 无数据，创建默认空白页面
      const camera = new BaseCamera();
      const scene = new Scene(camera);
      app.addScene(scene);
      app.navigateTo(scene);
    }
  }, [app, serializedScenes]);

  // ===== Effect 3: 尺寸/dpr 变化时更新画布 =====
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !app) return;
    applyCanvasSize();
    app.renderer.setDPR(dpr);
  }, [app, applyCanvasSize, dpr]);

  return { app, canvasRef };
}
