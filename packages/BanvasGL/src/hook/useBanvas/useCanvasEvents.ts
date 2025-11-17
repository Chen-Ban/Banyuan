import { useCallback, useEffect, useRef } from "react";
import { App } from "@/core/app";
import { Color, FillStyle, GraphView, Point3, Rectangle, StrokeStyle, Style, View } from "@/core";
import { event2Point } from "@/utils/utils";
import { ViewTreeUtils } from "@/core/utils/ViewTreeUtils";
import { ViewAddonImpl } from "@/core/views/addon";
import { ViewContent } from "@/core/views/View";
import { Action, Cursor, ExtraData } from "@/core/views/addon/InteractionMapBuilder";
import { isTextView, isGraphView } from "@/core/views/utils/typeGuards";
import { isRectangle, isTextElement } from "@/core/graph/utils/typeGuards";
import { checkViewIntersection } from "./utils/intersectionUtils";
import { PointUtils } from "@/core/graph/utils/PointUtils";

export interface UseCanvasEventsOptions {
  app: App | null;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  inputRef: React.RefObject<HTMLInputElement | null>;
  setSelectedView: (view: View | null) => void;
}

/**
 * Canvas 事件绑定
 */
export function useCanvasEvents({ app, canvasRef, inputRef, setSelectedView }: UseCanvasEventsOptions) {
  // 状态移动到副作用外层
  const mouseDownPointRef = useRef<Point3 | null>(null);
  const lastPointRef = useRef<Point3 | null>(null);
  const mouseUpPointRef = useRef<Point3 | null>(null);
  const indicateViewRef = useRef<View | null>(null);
  const indicateContentRef = useRef<ViewContent | ViewAddonImpl | null>(null);
  const actionRef = useRef<Action>(Action.NONE);
  const extraDataRef = useRef<ExtraData | null>(null);
  const lastClickTimeRef = useRef<number | undefined>(undefined);
  const selectionRectViewRef = useRef<GraphView | null>(null);

  // 鼠标落下，判定操作类型
  const onMouseDown = useCallback(
    (e: MouseEvent) => {
      if (!app) return;
      const scene = app.getCurrentScene();
      if (!scene) return;

      mouseDownPointRef.current = event2Point(e);
      // 如果在普通移动过程中未找到候选节点，则设置操作类型为框选
      if (!indicateViewRef.current && !indicateContentRef.current) {
        actionRef.current = Action.SELECT;
        // 创建临时框选矩形容器
        const selectionColor = new Color(100, 150, 255, 0.8);
        const selectionStrokeStyle = StrokeStyle.dashed(selectionColor, 1, [5, 5]);
        const selectionFillStyle = FillStyle.fromRGBA(0, 0, 144, 0.1);
        const selectionStyle = new Style(selectionFillStyle, selectionStrokeStyle);
        const selectionRect = new Rectangle(0, 0, 0, 0, selectionStyle);
        selectionRectViewRef.current = new GraphView(selectionRect, { isSelectBox: true });
        scene.addChild(selectionRectViewRef.current);
      }
    },
    [app]
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
        switch (actionRef.current) {
          case Action.MOVE:
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
          case Action.SELECTION:
            if (isTextView(indicateViewRef.current) && isTextElement(indicateContentRef.current)) {
              const textView = indicateViewRef.current;
              const { content } = textView.interact(point, true);
              if (!textView.actived) {
                scene.select(textView);
                const fixedIndex = textView.element2Index(indicateContentRef.current, point);
                textView.setSelection(fixedIndex, fixedIndex);
              }
              if (isTextElement(content)) {
                const dynamicIndex = textView.element2Index(content, point);
                textView.setSelection(textView.fixedIndex, dynamicIndex);
              }
            }
            break;
          case Action.EDIT_POINT:
            canvasRef.current.style.cursor = Cursor.Grabbing;
            if (extraDataRef.current) {
              const { editPoint } = extraDataRef.current;
              if (editPoint) {
                editPoint.add(point.subtract(lastPointRef.current || mousDownPoint));
              }
            }
            break;
          case Action.RESIZE:
            break;
          case Action.ROTATE:
            canvasRef.current.style.cursor = Cursor.Grabbing;
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
              indicateViewRef.current.rotate(0, 0, angle, center);
            }
            break;
          case Action.SELECT:
            canvasRef.current.style.cursor = Cursor.Crosshair;
            // 更新框选矩形的位置和大小
            if (selectionRectViewRef.current && mousDownPoint) {
              const minX = Math.min(mousDownPoint.x, point.x);
              const minY = Math.min(mousDownPoint.y, point.y);
              const maxX = Math.max(mousDownPoint.x, point.x);
              const maxY = Math.max(mousDownPoint.y, point.y);
              const width = maxX - minX;
              const height = maxY - minY;

              // 更新矩形图形
              const rectGraph = selectionRectViewRef.current.content as Rectangle;

              rectGraph.setPosition(minX, minY);
              rectGraph.setSize(width, height);
              selectionRectViewRef.current.initBoundingBox();
              selectionRectViewRef.current.initViewport();
            }
            // 将所有和框选矩形相交的容器设置为激活（跳过已激活容器）
            if (selectionRectViewRef.current) {
              const selectionRect = selectionRectViewRef.current.content;
              if (!isRectangle(selectionRect)) return;
              const viewsToActivate: View[] = [];

              // 使用 ViewTreeUtils 展平视图树，获取所有视图
              const allViews = ViewTreeUtils.flattenViewTree(scene);

              // 遍历所有视图，检查相交
              for (const view of allViews) {
                if (checkViewIntersection(view, selectionRect)) {
                  viewsToActivate.push(view);
                }
              }

              // 激活所有相交的视图
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
        // 记录过程点
        lastPointRef.current = point;
      } else {
        // 普通移动事件，用于选定候选容器和改变鼠标样式
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
      }
    },
    [app, canvasRef]
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
      if (isGraphView(view) && view.isSelectBox) {
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
      if (PointUtils.isSamePoint(mousDownPoint, mouseUpPoint)) {
        const indicateView = indicateViewRef.current;
        if (indicateView) {
          scene.select(indicateView, e.ctrlKey);

          if (isTextView(indicateView) && isTextElement(indicateContentRef.current)) {
            const fixedIndex = indicateView.element2Index(indicateContentRef.current, mousDownPoint);
            indicateView.setSelection(fixedIndex, fixedIndex);

            // 保存当前选中的视图
            setSelectedView(indicateView);

            // 将输入框移动到选中的 textElement 下方
            const bounds = indicateContentRef.current.getBounds();

            // 将相对坐标转换为世界坐标
            const worldMatrix = indicateView.getWorldMatrix();
            // 获取 textElement 左下角的世界坐标
            const relativeBottomLeft = new Point3(bounds.x, bounds.y + bounds.height, 0);
            const worldBottomLeft = worldMatrix.multiply(relativeBottomLeft);
            // 移动输入框到该位置下方
            const input = inputRef.current;
            const layoutBounds = indicateView.layoutArea?.getBounds();
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
          } else {
            // 如果不是文本视图，保存选中的视图
            setSelectedView(indicateView);
          }
        } else {
          ViewTreeUtils.clearAllStates(scene);
          // 清除选中状态
          setSelectedView(null);
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
    [app, canvasRef, inputRef, setSelectedView, onMouseLeave]
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
      if (PointUtils.isSamePoint(mousDownPoint, mouseUpPoint, lastClickTimeRef.current)) {
        if (isTextView(indicateViewRef.current) && isTextElement(indicateContentRef.current)) {
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

  const onDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
  }, []);

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
