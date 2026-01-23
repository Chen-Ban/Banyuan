import { useCallback, useEffect, useRef } from "react";
import { App } from "@/core/app";
import {
  Point3,
  Rectangle,
  Scene,
  View,
  SelectBoxView,
  isNonPrintableTextElement,
  isPrintableTextElement,
  Graph,
  isTextView,
  isSelectBoxView,
  GraphView,
  TextView,
  ImageView,
  Line,
  Circle,
  Rectangle as RectangleGraph,
  ImageElement,
  TextParagraph,
  Style,
} from "@/core";
import { event2Point } from "@/utils/utils";
import { ViewTreeUtils } from "@/core/utils/ViewTreeUtils";
import { ViewAddonImpl } from "@/core/views/addon";
import { ViewContent } from "@/core/views/View";
import { Action, Cursor, ExtraData } from "@/core/views/addon/InteractionMapBuilder";

export interface UseCanvasEventsOptions {
  app: App | null;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

/**
 * Canvas 事件绑定
 */
export function useCanvasEvents({ app, canvasRef, inputRef }: UseCanvasEventsOptions) {
  const mouseDownPointRef = useRef<Point3 | null>(null);
  const lastPointRef = useRef<Point3 | null>(null);
  const mouseUpPointRef = useRef<Point3 | null>(null);
  const indicateViewRef = useRef<View | null>(null);
  const indicateContentRef = useRef<ViewContent | ViewAddonImpl | null>(null);
  const actionRef = useRef<Action>(Action.NONE);
  const extraDataRef = useRef<ExtraData | null>(null);
  const lastClickTimeRef = useRef<number | undefined>(undefined);
  const selectionRectViewRef = useRef<SelectBoxView | null>(null);

  // 鼠标落下，判定操作类型
  const onMouseDown = useCallback(
    async (e: MouseEvent) => {
      if (!app) return;
      const scene = app.getCurrentScene();
      if (!scene) return;

      // const worker = getGlobalWorkerManager();
      // await worker.compute("text/layout", {
      //   paragraphs: [TextParagraph.simple("Hello, world!")],
      //   layoutArea: new Rectangle(0, 0, 100, 100),
      //   verticalAlign: VERTICALALIGN.TOP,
      //   fixedWidth: false,
      //   fixedHeight: false,
      // });

      mouseDownPointRef.current = event2Point(e);
      // 如果在普通移动过程中未找到候选节点，则设置操作类型为框选
      if (!indicateViewRef.current && !indicateContentRef.current) {
        actionRef.current = Action.SELECT;
        // 创建临时框选矩形容器
        selectionRectViewRef.current = new SelectBoxView();
        scene.addChild(selectionRectViewRef.current);
      }
    },
    [app]
  );

  const handleMouseMoveWithAction = useCallback(
    (scene: Scene, point: Point3, mousDownPoint: Point3) => {
      switch (actionRef.current) {
        case Action.MOVE: {
          const moveVector = point.subtract(lastPointRef.current || mousDownPoint);
          const indicateView = indicateViewRef.current;
          if (indicateView && !indicateView?.actived) {
            scene.select(indicateView);
            indicateView.translate(moveVector.x, moveVector.y, 0);
          } else {
            for (const activeView of scene.getAllActived()) {
              activeView.translate(moveVector.x, moveVector.y, 0);
            }
          }
          break;
        }
        case Action.SELECTION:
          if (
            isTextView(indicateViewRef.current) &&
            (isPrintableTextElement(indicateContentRef.current) ||
              isNonPrintableTextElement(indicateContentRef.current))
          ) {
            const textView = indicateViewRef.current;
            const { content } = textView.interact(point, true);
            if (!textView.actived) {
              scene.select(textView);
              const fixedIndex = textView.element2Index(indicateContentRef.current, point);
              textView.setSelection(fixedIndex, fixedIndex);
            }
            if (isPrintableTextElement(content) || isNonPrintableTextElement(content)) {
              const dynamicIndex = textView.element2Index(content, point);
              textView.setSelection(textView.fixedIndex, dynamicIndex);
            }
          }
          break;
        case Action.EDIT_POINT:
          canvasRef.current!.style.cursor = Cursor.Grabbing;
          if (extraDataRef.current) {
            const { editPoint } = extraDataRef.current;
            if (editPoint) {
              indicateViewRef.current?.editPoint(point, point.subtract(lastPointRef.current || mousDownPoint))
            }
          }
          break;
        case Action.RESIZE:
          canvasRef.current!.style.cursor = Cursor.Grabbing;
          if (extraDataRef.current) {
            const vector = point.subtract(lastPointRef.current || mousDownPoint);
            const { resizeFixedIndex, resizeDynamicIndex } = extraDataRef.current;
            if (resizeDynamicIndex !== undefined && resizeFixedIndex !== undefined && indicateViewRef.current) {
              indicateViewRef.current.resize(resizeFixedIndex, resizeDynamicIndex, vector);
            }
          }
          break;
        case Action.ROTATE: {
          canvasRef.current!.style.cursor = Cursor.Grabbing;
          const bounds = indicateViewRef.current?.getBounds();

          if (bounds && lastPointRef.current && indicateViewRef.current) {
            const center = new Rectangle(bounds.x, bounds.y, bounds.width, bounds.height).getCenter();
            const inverseMatrix = indicateViewRef.current.getWorldMatrix().inverse();
            const lastVector = inverseMatrix.multiply(lastPointRef.current).subtract(center);
            const currentVector = inverseMatrix.multiply(point).subtract(center);
            const dot = currentVector.dot(lastVector) / (currentVector.length * lastVector.length);
            const clampedDot = Math.max(-1, Math.min(1, dot));
            const sign = Math.sign(currentVector.cross(lastVector).z);
            const angle = Math.acos(clampedDot) * sign;
            scene.getAllActived().forEach((view) => view.rotate(0, 0, angle, center));
          }
          break;
        }
        case Action.SELECT:
          canvasRef.current!.style.cursor = Cursor.Crosshair;
          if (selectionRectViewRef.current && mousDownPoint) {
            // 更新框选矩形
            selectionRectViewRef.current.updateSelect(mousDownPoint, point);
            const selectionRect = selectionRectViewRef.current.content[0];
            const viewsToActivate: View[] = [];
            const allViews = ViewTreeUtils.flattenViewTree(scene).filter((view) => !isSelectBoxView(view));
            // 遍历所有视图，检查是否与框选矩形相交
            for (const view of allViews) {
              let graphs = [view.content, view.layoutArea]
                .flat()
                .filter(Boolean)
                .map((graph) => graph.copy());
              for (const graph of graphs) {
                // selectionBox就是基于原点的，所以selectionRect不需要转换到世界坐标
                // 只需要将graph转换到世界坐标就能统一坐标了
                const intersection = selectionRect.intersect(graph.transform(view.getWorldMatrix()));
                if (intersection.length > 0) {
                  viewsToActivate.push(view);
                  break;
                }
              }
            }

            for (const view of viewsToActivate) {
              scene.select(view, true);
            }
          }
          break;
        case Action.EDIT_VIEWPORT:
          break;
        case Action.NONE:
        default:
      }
      lastPointRef.current = point;
    },
    [canvasRef]
  );

  const handleMouseMoveHover = useCallback(
    (scene: Scene, point: Point3) => {
      if (!canvasRef.current) return;
      let selected = false;
      for (const view of scene.children) {
        const { view: _view, content, extraData: _extraData } = view.interact(point);
        if (_view && content && _extraData) {
          indicateViewRef.current = _view;
          indicateContentRef.current = content;
          actionRef.current = _extraData.action;
          extraDataRef.current = _extraData;
          canvasRef.current.style.cursor = _extraData.cursorStyle;
          selected = true;
        }
      }
      if (!selected) {
        indicateViewRef.current = indicateContentRef.current = extraDataRef.current = null;
        actionRef.current = Action.NONE;
        canvasRef.current.style.cursor = Cursor.Default;
      }
    },
    [canvasRef]
  );

  // 鼠标移动
  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!app || !canvasRef.current) return;
      const scene = app.getCurrentScene();
      if (!scene) return;

      const point = event2Point(e);
      const mousDownPoint = mouseDownPointRef.current;

      if (mousDownPoint) {
        handleMouseMoveWithAction(scene, point, mousDownPoint);
      } else {
        handleMouseMoveHover(scene, point);
      }
    },
    [app, canvasRef, handleMouseMoveHover, handleMouseMoveWithAction]
  );

  // 鼠标抬起，记录抬起点
  const onMouseUp = useCallback((e: MouseEvent) => {
    mouseUpPointRef.current = event2Point(e);
  }, []);

  const onMouseLeave = useCallback(() => {
    if (!app || !canvasRef.current) return;
    const scene = app.getCurrentScene();
    if (!scene || !selectionRectViewRef.current) return;

    // 删除所有框选容器
    const selectBoxViews: View[] = [];
    for (const view of scene.children) {
      if (isSelectBoxView(view)) {
        selectBoxViews.push(view);
      }
    }
    for (const selectBoxView of selectBoxViews) {
      scene.removeChild(selectBoxView);
    }
    selectionRectViewRef.current = null;
  }, [app, canvasRef]);

  const onClick = useCallback(
    (e: MouseEvent) => {
      if (!app || !canvasRef.current) return;
      const scene = app.getCurrentScene();
      if (!scene) return;

      const mousDownPoint = mouseDownPointRef.current;
      const mouseUpPoint = mouseUpPointRef.current;
      if (!mousDownPoint || !mouseUpPoint) return;

      // 只有单击时才处理
      if (mousDownPoint.isSame(mouseUpPoint)) {
        const indicateView = indicateViewRef.current;
        if (indicateView) {
          if (
            isTextView(indicateView) &&
            indicateContentRef.current instanceof Array &&
            (isPrintableTextElement(indicateContentRef.current[0]) ||
              isNonPrintableTextElement(indicateContentRef.current[0]))
          ) {
            const fixedIndex = indicateView.element2Index(indicateContentRef.current[0], mousDownPoint);
            indicateView.setSelection(fixedIndex, fixedIndex);

            // 将输入框移动到选中的 textElement 下方
            const bounds = indicateContentRef.current[0].bounds;

            // 将相对坐标转换为世界坐标
            const worldMatrix = indicateView.getWorldMatrix();
            // 获取 textElement 左下角的世界坐标
            const relativeBottomLeft = new Point3(bounds.x, bounds.y + bounds.height, 0);
            const worldBottomLeft = worldMatrix.multiply(relativeBottomLeft);
            // 移动输入框到该位置下方
            const input = inputRef.current;
            const layoutBounds = indicateView.layoutArea?.bounds;
            if (input && layoutBounds) {
              input.style.left = `${worldBottomLeft.x}px`;
              input.style.top = `${worldBottomLeft.y}px`;
              input.style.width = `${layoutBounds.width}px`;
              input.style.height = `16px`;
              input.style.display = "block";
              input.focus();
              input.value = indicateView.getContentText()[fixedIndex[0]];
              input.selectionStart = fixedIndex[1] + fixedIndex[2];
              input.selectionEnd = fixedIndex[1] + fixedIndex[2];
            }
          }
          scene.select(indicateView, e.ctrlKey);
        } else {
          ViewTreeUtils.clearAllStates(scene);
          // 隐藏输入框
          const input = inputRef.current;
          if (input) {
            input.style.display = "none";
          }
        }
        lastClickTimeRef.current = Date.now();
      }

      onMouseLeave();

      mouseDownPointRef.current = null;
      lastPointRef.current = null;
      mouseUpPointRef.current = null;
      lastClickTimeRef.current = 0;
      if (actionRef.current === Action.SELECT) {
        canvasRef.current.style.cursor = Cursor.Default;
      }
      actionRef.current = Action.NONE;
    },
    [app, canvasRef, inputRef, onMouseLeave]
  );

  // 双击事件处理
  const onDoubleClick = useCallback(
    (e: MouseEvent) => {
      if (!app || !canvasRef.current) return;
      const scene = app.getCurrentScene();
      if (!scene) return;

      const mousDownPoint = mouseDownPointRef.current;
      const mouseUpPoint = mouseUpPointRef.current;
      if (!mousDownPoint || !mouseUpPoint) return;

      // 双击事件处理
      if (
        mousDownPoint.isSame(mouseUpPoint) &&
        lastClickTimeRef.current &&
        Date.now() - lastClickTimeRef.current < 300
      ) {
        if (
          isTextView(indicateViewRef.current) &&
          (isPrintableTextElement(indicateContentRef.current) || isNonPrintableTextElement(indicateContentRef.current))
        ) {
          console.log("选中一整行");
          // 这里可以添加更多双击相关的逻辑
        }
      }
    },
    [app, canvasRef]
  );

  const onWheel = useCallback((e: WheelEvent) => {
    // 阻止页面滚动
    e.preventDefault();
  }, []);

  const onContextMenu = useCallback((e: MouseEvent) => {
    e.preventDefault();
  }, []);

  // 拖拽事件
  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      if (!app || !canvasRef.current) return;
      const scene = app.getCurrentScene();
      if (!scene) return;

      try {
        // 获取拖拽数据
        if (!e.dataTransfer) return;
        const dataStr = e.dataTransfer.getData("application/json");
        if (!dataStr) return;

        const dragData = JSON.parse(dataStr) as {
          viewType: "GraphView" | "TextView" | "ImageView";
          graphType?: "Line" | "Circle" | "Rectangle";
          constructorParams: any;
        };
        const { viewType, graphType, constructorParams } = dragData;

        // 获取拖拽位置（相对于 canvas）
        const rect = canvasRef.current.getBoundingClientRect();
        const ratio = window.devicePixelRatio;
        const x = (e.clientX - rect.left) * ratio;
        const y = (e.clientY - rect.top) * ratio;
        const dropPoint = new Point3(x, y, 0);

        let newView: View | null = null;

        // 根据 viewType 创建对应的 view
        if (viewType === "GraphView") {
          let graph: Graph | null = null;

          // 根据 graphType 创建对应的 graph
          if (graphType === "Line") {
            const end = new Point3(50, 50, 0);
            graph = new Line(new Point3(0, 0, 0), end, Style.DEFAULT);
          } else if (graphType === "Circle") {
            const { radius } = constructorParams;

            graph = new Circle(new Point3(radius, radius, 0), radius || 50, Style.DEFAULT);
          } else if (graphType === "Rectangle") {
            const { width, height } = constructorParams;
            // 使用 dropPoint 作为矩形左上角
            graph = new RectangleGraph(0, 0, width || 100, height || 100, Style.DEFAULT);
          }

          if (graph) {
            newView = new GraphView(graph).translate(x, y, 0);
          }
        } else if (viewType === "TextView") {
          const { text } = constructorParams;
          const textParagraph = TextParagraph.simple(text || "文本");

          const layoutArea = new RectangleGraph(1, 1, 200, 100, Style.DEFAULT);
          newView = new TextView([textParagraph], {
            layoutArea,
            shouldLayout: true,
          }).translate(x, y, 0);
        } else if (viewType === "ImageView") {
          const { imageSrc } = constructorParams;

          // 使用 dropPoint 作为图片左上角
          const imageElement = new ImageElement(imageSrc || "", dropPoint.x, dropPoint.y, Style.DEFAULT);
          newView = new ImageView(imageElement);
        }

        // 将新创建的 view 添加到场景中
        if (newView) {
          scene.addChild(newView);
          scene.select(newView);
        }
      } catch (error) {
        console.error("拖拽创建组件失败:", error);
      }
    },
    [app, canvasRef]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !app) return;

    canvas.addEventListener("mousedown", onMouseDown, { passive: true });
    canvas.addEventListener("mousemove", onMouseMove, { passive: true });
    canvas.addEventListener("click", onClick, { passive: true });
    canvas.addEventListener("dblclick", onDoubleClick, { passive: true });
    canvas.addEventListener("mouseup", onMouseUp, { passive: true });
    canvas.addEventListener("mouseleave", onMouseLeave, { passive: true });
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("contextmenu", onContextMenu, { passive: false });
    canvas.addEventListener("dragover", onDragOver);
    canvas.addEventListener("drop", onDrop);

    return () => {
      canvas.removeEventListener("mousedown", onMouseDown as any);
      canvas.removeEventListener("mousemove", onMouseMove as any);
      canvas.removeEventListener("mouseup", onMouseUp as any);
      canvas.removeEventListener("click", onClick as any);
      canvas.removeEventListener("dblclick", onDoubleClick as any);
      canvas.removeEventListener("wheel", onWheel as any);
      canvas.removeEventListener("contextmenu", onContextMenu as any);
      canvas.removeEventListener("dragover", onDragOver as any);
      canvas.removeEventListener("drop", onDrop as any);
    };
  }, [
    app,
    canvasRef,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onMouseLeave,
    onClick,
    onDoubleClick,
    onWheel,
    onContextMenu,
    onDragOver,
    onDrop,
  ]);
}
