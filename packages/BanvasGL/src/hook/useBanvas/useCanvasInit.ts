import { useCallback, useEffect, useRef, useState } from "react";
import { App } from "@/core/app";
import {
  BaseCamera,
  Scene,
} from "@/core";
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
  const initializedRef = useRef<boolean>(false);

  // 统一设置画布逻辑尺寸与样式尺寸
  const applyCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // 传入的尺寸是样式尺寸
    const styleWidth = options.width
    const styleHeight = options.height
    // 样式尺寸 = 传入的尺寸
    canvas.style.width = `${styleWidth}px`;
    canvas.style.height = `${styleHeight}px`;
    // 实际像素尺寸 = 样式尺寸 * dpr
    canvas.width = styleWidth * dpr
    canvas.height = styleHeight * dpr
  }, [options.width, options.height, dpr]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || initializedRef.current) return;
    applyCanvasSize();
    // 初始化 App 与 Renderer，将 dpr 传递给 rendererOptions
    const _app = App.create(canvas, options.appOptions ?? {}, {
      ...options.rendererOptions,
      dpr,
    });
    _app.launch({});
    // 通过序列化的 Scene JSON 初始化
    if (Array.isArray(serializedScenes) && serializedScenes.length > 0) {
      _app.initFromSerializedScenes(serializedScenes);
    }
    setApp(_app);
    initializedRef.current = true;

    try {
      // 创建基础相机
      const camera = new BaseCamera();

      // 创建新页面（场景）
      const scene = new Scene(camera);

      // 添加场景到应用
      _app.addScene(scene);

      // 导航到新页面
      _app.navigateTo(scene);

      // 循环渲染会自动处理渲染，无需手动调用
    } catch (error) {
      console.error("Failed to create page and draw content:", error);
    }

    return () => {
      // 清理函数
      if (_app) {
        try {
          _app.destroy();
        } catch (error) {
          console.warn("Failed to destroy app in cleanup:", error);
        }
      }
      setApp(null);
      initializedRef.current = false;
    };
  }, []); // 空依赖数组，只在组件挂载时执行一次

  // 当尺寸参数或 dpr 变化时，更新画布尺寸与渲染器
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !app || !initializedRef.current) return;
    applyCanvasSize();
    // 更新 renderer 的 dpr
    app.renderer.setDPR(dpr);
  }, [app, applyCanvasSize, dpr]);

  return { app, canvasRef };
}
