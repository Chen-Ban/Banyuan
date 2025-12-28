import { useCallback, useEffect, useRef, useState } from "react";
import { App } from "@/core/app";
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
  Style,
  TextParagraph,
  TextView,
  Line,
  Arc,
  Triangle,
  RegularPolygon,
  QuadraticBezier,
  CubicBezier,
  StrokeStyle,
  VERTICALALIGN,
} from "@/core";
import type { UseBanvasOptions, SerializedSceneJSON } from "./types";
import { getGlobalWorkerManager, WorkerManager } from "@/workers";

export interface UseCanvasInitResult {
  app: App | null;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

/**
 * 生成随机数
 */
function random(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/**
 * 生成随机整数
 */
function randomInt(min: number, max: number): number {
  return Math.floor(random(min, max));
}

/**
 * 生成随机颜色
 */
function randomColor(): Color {
  return new Color(randomInt(0, 256), randomInt(0, 256), randomInt(0, 256), random(0.5, 1));
}

/**
 * 生成随机样式
 */
function randomStyle(): Style {
  const hasFill = Math.random() > 0.3;
  const hasStroke = Math.random() > 0.3;

  const style = new Style();

  if (hasFill) {
    style.fillStyle = new FillStyle("color", randomColor());
  }

  if (hasStroke) {
    style.strokeStyle = new StrokeStyle("color", randomColor());
    style.strokeStyle.width = random(1, 5);
  }

  return style;
}

const defaultCanvasSize = {
  width: 800,
  height: 600,
};

/**
 * Canvas 初始化逻辑
 */
export function useCanvasInit(
  serializedScenes: SerializedSceneJSON[],
  options: UseBanvasOptions,
  dpr: number
): UseCanvasInitResult {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [app, setApp] = useState<App | null>(null);
  const initializedRef = useRef<boolean>(false);

  // 统一设置画布逻辑尺寸与样式尺寸
  const applyCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // 传入的尺寸是样式尺寸
    const styleWidth = options.width ?? defaultCanvasSize.width;
    const styleHeight = options.height ?? defaultCanvasSize.height;
    // 样式尺寸 = 传入的尺寸
    canvas.style.width = `${styleWidth}px`;
    canvas.style.height = `${styleHeight}px`;
    // 实际像素尺寸 = 样式尺寸 * dpr
    canvas.width = Math.round(styleWidth * dpr);
    canvas.height = Math.round(styleHeight * dpr);
  }, [options.width, options.height, dpr]);

  const worker = useRef<WorkerManager | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || initializedRef.current) return;

    worker.current = getGlobalWorkerManager();
    worker.current.compute("text/layout", {
      paragraphs: [TextParagraph.simple("Hello, world!")],
      layoutArea: new Rectangle(0, 0, 100, 100),
      verticalAlign: VERTICALALIGN.TOP,
      fixedWidth: false,
      fixedHeight: false,
    });
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

      combinedView.translate(50, 50);

      // ========== 随机图形 ==========
      const allViews: GraphView[] = [];

      // 1. 创建 Line（直线）
      const startX = random(0, 100);
      const startY = random(0, 100);
      const endX = random(0, 100);
      const endY = random(0, 100);
      const line = new Line(new Point3(startX, startY, 0), new Point3(endX, endY, 0), randomStyle());
      const lineView = new GraphView(line);
      lineView.translate(random(0, 400), random(0, 400));
      allViews.push(lineView);

      // 2. 创建 Circle（圆形）
      const radius = random(20, 60);
      const circle = new Circle(new Point3(0, 0, 0), radius, randomStyle());
      const circleView = new GraphView(circle);
      circleView.translate(random(50, 450), random(50, 450));
      allViews.push(circleView);

      // 3. 创建 Arc（圆弧）
      const arcRadius = random(20, 60);
      const startAngle = random(0, Math.PI);
      const endAngle = random(Math.PI, Math.PI * 2);
      const clockwise = Math.random() > 0.5;
      const arc = new Arc(new Point3(0, 0, 0), arcRadius, startAngle, endAngle, clockwise, randomStyle());
      const arcView = new GraphView(arc);
      arcView.translate(random(50, 450), random(50, 450));
      allViews.push(arcView);

      // 4. 创建 Rectangle（矩形）
      const width = random(30, 100);
      const height = random(30, 100);
      const randomRect = new Rectangle(0, 0, width, height, randomStyle());
      const rectView = new GraphView(randomRect);
      rectView.translate(random(0, 400), random(0, 400));
      allViews.push(rectView);

      // 5. 创建 Triangle（三角形）
      const pt1 = new Point3(random(0, 50), random(0, 50), 0);
      const pt2 = new Point3(random(0, 50), random(50, 100), 0);
      const pt3 = new Point3(random(50, 100), random(25, 75), 0);
      const triangle = new Triangle(pt1, pt2, pt3, randomStyle());
      const triangleView = new GraphView(triangle);
      triangleView.translate(random(0, 400), random(0, 400));
      allViews.push(triangleView);

      // 6. 创建 RegularPolygon（正多边形）
      const polygonRadius = random(20, 60);
      const sides = randomInt(5, 9); // 5-8边形
      const rotation = random(0, Math.PI * 2);
      const polygon = new RegularPolygon(new Point3(0, 0, 0), polygonRadius, sides, rotation, randomStyle());
      const polygonView = new GraphView(polygon);
      polygonView.translate(random(50, 450), random(50, 450));
      allViews.push(polygonView);

      // 7. 创建 QuadraticBezier（二次贝塞尔曲线）
      const start = new Point3(0, 0, 0);
      const control = new Point3(random(20, 80), random(20, 80), 0);
      const end = new Point3(random(40, 100), random(40, 100), 0);
      const bezier = new QuadraticBezier(start, control, end, randomStyle());
      const bezierView = new GraphView(bezier);
      bezierView.translate(random(0, 400), random(0, 400));
      allViews.push(bezierView);

      // 8. 创建 CubicBezier（三次贝塞尔曲线）
      const cubicStart = new Point3(0, 0, 0);
      const control1 = new Point3(random(20, 60), random(20, 60), 0);
      const control2 = new Point3(random(40, 80), random(40, 80), 0);
      const cubicEnd = new Point3(random(60, 100), random(60, 100), 0);
      const cubicBezier = new CubicBezier(cubicStart, control1, control2, cubicEnd, randomStyle());
      const cubicBezierView = new GraphView(cubicBezier);
      cubicBezierView.translate(random(0, 400), random(0, 400));
      allViews.push(cubicBezierView);

      // 将所有随机图形添加到场景
      allViews.forEach((view) => {
        scene.addChild(view);
      });

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
