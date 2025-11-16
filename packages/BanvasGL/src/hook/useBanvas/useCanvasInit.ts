import { useCallback, useEffect, useRef, useState } from "react";
import { App } from "@/core/app";
import type { AppOptions } from "@/core/app";
import type { RendererOptions } from "@/core/renderer/Renderer";
import {
  BaseCamera,
  Circle,
  Color,
  CombinedView,
  FillStyle,
  GraphView,
  Point3,
  Rectangle,
  Scene,
  StrokeStyle,
  Style,
  TextParagraph,
  TextView,
} from "@/core";
import type { UseBanvasOptions, SerializedSceneJSON } from "./types";

export interface UseCanvasInitResult {
  app: App | null;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  initializedRef: React.MutableRefObject<boolean>;
}

/**
 * Canvas 初始化逻辑
 */
export function useCanvasInit(serializedScenes: SerializedSceneJSON[], options: UseBanvasOptions): UseCanvasInitResult {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [app, setApp] = useState<App | null>(null);
  const initializedRef = useRef<boolean>(false);

  // 统一设置画布逻辑尺寸与样式尺寸
  const applyCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return { logicWidth: 0, logicHeight: 0 };
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const cssWidth = options.width ?? (canvas.clientWidth || 300);
    const cssHeight = options.height ?? (canvas.clientHeight || 150);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    const logicWidth = Math.round(cssWidth * dpr);
    const logicHeight = Math.round(cssHeight * dpr);
    if (canvas.width !== logicWidth) canvas.width = logicWidth;
    if (canvas.height !== logicHeight) canvas.height = logicHeight;
    return { logicWidth, logicHeight };
  }, [options.width, options.height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || initializedRef.current) return;

    applyCanvasSize();
    // 初始化 App 与 Renderer
    const _app = App.create(canvas, options.appOptions ?? {}, options.rendererOptions ?? {});
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

      const rect = new GraphView(new Rectangle(50, 50, 50, 50));

      const p1 = TextParagraph.simple("123456789");
      p1.options.leading = 1.7;
      p1.options.indentation = 2;
      p1.texts.forEach((text) => (text.options.letterSpacing = 10));

      const p2 = TextParagraph.simple("abcdefghijklmnopqrstuvwxyz");

      const text = new TextView([p1, p2], {
        layoutArea: new Rectangle(50, 50, 50, 50),
        fixedIndex: [0, 0, 0],
        dynamicIndex: [1, 1, 1],
      });
      text.translate(100, 100);

      const anchor = new GraphView(
        new Circle(new Point3(50, 50, 0), 50, new Style(new FillStyle("color", new Color(255, 0, 0, 1))))
      ).translate(250, 50);

      const combinedView = new CombinedView([rect, text]);
      scene.addChild(combinedView);
      scene.addChild(anchor);

      // 添加场景到应用
      _app.addScene(scene);

      // 导航到新页面
      _app.navigateTo(scene);

      combinedView.translate(50, 50);

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

  // 当尺寸参数变化时，更新画布尺寸与渲染器
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !app || !initializedRef.current) return;
    applyCanvasSize();
  }, [app, applyCanvasSize]);

  return { app, canvasRef, initializedRef };
}
