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
  const scenesLoadedRef = useRef<boolean>(false);

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

  // App 初始化（只执行一次）
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

    // 如果已有序列化数据，直接加载
    if (Array.isArray(serializedScenes) && serializedScenes.length > 0) {
      _app.initFromSerializedScenes(serializedScenes);
      scenesLoadedRef.current = true;
    } else {
      // 没有序列化数据时，创建默认空白页面
      try {
        const camera = new BaseCamera();
        const scene = new Scene(camera);
        _app.addScene(scene);
        _app.navigateTo(scene);
      } catch (error) {
        console.error("Failed to create default page:", error);
      }
    }

    setApp(_app);
    initializedRef.current = true;

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
      scenesLoadedRef.current = false;
    };
  }, []); // 空依赖数组，只在组件挂载时执行一次

  // 响应 serializedScenes 异步加载：当 app 已初始化但 scenes 尚未加载时，加载新数据
  useEffect(() => {
    if (!app || !initializedRef.current) return;
    if (scenesLoadedRef.current) return;
    if (!Array.isArray(serializedScenes) || serializedScenes.length === 0) return;

    // 清除之前创建的默认空白页面
    const existingScenes = app.getScenes();
    existingScenes.forEach(scene => app.removeScene(scene));

    // 加载序列化数据
    app.initFromSerializedScenes(serializedScenes);
    scenesLoadedRef.current = true;
  }, [app, serializedScenes]);

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
