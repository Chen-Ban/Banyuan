import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  App,
  Point3,
  View,
  SelectBoxView,
  Action,
  Cursor,
  GraphType,
  isTextView,
  isSelectBoxView,
  isGraphType,
  clearAllStates,
} from "@banyuan/banvasgl";
import type {
  Scene,
  ExtraData,
  IViewAddon,
  IGraph,
  IEdgeView,
  IBanvasActions,
  IComponentTemplate,
} from "@banyuan/banvasgl";
import { InteractionDispatcher } from "./InteractionDispatcher.js";
import type { InteractionContext } from "./InteractionDispatcher.js";
import { resolveActivationTarget } from "./utils.js";

/** 将 MouseEvent 转为 canvas 物理像素坐标（兼容 CSS 缩放） */
const event2Point = (e: MouseEvent): Point3 => {
  const canvas = e.target as HTMLCanvasElement;
  const scaleX = canvas.width / canvas.clientWidth;
  const scaleY = canvas.height / canvas.clientHeight;
  return new Point3(e.offsetX * scaleX, e.offsetY * scaleY, 0);
};

export interface ContextMenuHitResult {
  target: "canvas" | "view";
  view: View | null;
  position: { x: number; y: number };
  canvasPosition: { x: number; y: number };
}

export interface UseCanvasEventsOptions {
  app: App | null;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  inputRef: React.RefObject<HTMLInputElement | null>;
  actions: IBanvasActions | null;
  onContextMenuHit?: (hit: ContextMenuHitResult) => void;
  onInteractionEnd?: () => void;
}

export function useCanvasEvents({
  app,
  canvasRef,
  inputRef,
  actions,
  onContextMenuHit,
  onInteractionEnd,
}: UseCanvasEventsOptions) {
  const mouseDownPointRef = useRef<Point3 | null>(null);
  const lastPointRef = useRef<Point3 | null>(null);
  const mouseUpPointRef = useRef<Point3 | null>(null);
  const isMouseDownRef = useRef<boolean>(false);
  const indicateViewRef = useRef<View | null>(null);
  const indicateContentRef = useRef<IGraph | IViewAddon | null>(null);
  const actionRef = useRef<Action>(Action.NONE);
  const extraDataRef = useRef<ExtraData | null>(null);
  const lastClickTimeRef = useRef<number | undefined>(undefined);
  const selectionRectViewRef = useRef<SelectBoxView | null>(null);
  const tempEdgeRef = useRef<IEdgeView | null>(null);

  const dispatcher = useMemo(() => {
    const ctx: InteractionContext = {
      getIndicateView: () => indicateViewRef.current,
      getIndicateContent: () => indicateContentRef.current,
      getLastPoint: () => lastPointRef.current,
      getExtraData: () => extraDataRef.current,
      getSelectionRectView: () => selectionRectViewRef.current,
      setCursor: (cursor: Cursor) => {
        if (canvasRef.current) {
          canvasRef.current.style.cursor = cursor;
        }
      },
      selectView: (scene: Scene, view: View, multiple: boolean) => {
        scene.select(view, multiple);
      },
      clearSelection: (scene: Scene) => {
        clearAllStates(scene);
      },
      getTempEdge: () => tempEdgeRef.current,
      setTempEdge: (edge) => {
        tempEdgeRef.current = edge;
      },
      getBufferCtx: () => app!.renderer.getCanvasContext().getBufferContext(),
    };
    return new InteractionDispatcher(ctx);
  }, [app, canvasRef]);

  const onMouseDown = useCallback(
    async (e: MouseEvent) => {
      if (!app) return;
      const scene = app.getCurrentScene();
      if (!scene) return;
      mouseDownPointRef.current = event2Point(e);
      isMouseDownRef.current = true;
      if (!indicateViewRef.current && !indicateContentRef.current) {
        actionRef.current = Action.SELECT;
        selectionRectViewRef.current = new SelectBoxView({
          style: {
            width: canvasRef.current?.width,
            height: canvasRef.current?.height,
          },
        });
        scene.addChild(selectionRectViewRef.current, false);
      } else if (actionRef.current === Action.CONNECT) {
        // CONNECT 不开启事务
      } else {
        const action = actionRef.current;
        if (
          action === Action.MOVE ||
          action === Action.RESIZE ||
          action === Action.ROTATE ||
          action === Action.EDIT_POINT
        ) {
          const indicateView = indicateViewRef.current;

          if (indicateView && !indicateView.actived) {
            const isMultiSelect = navigator.platform.startsWith("Mac")
              ? e.metaKey
              : e.ctrlKey;
            const target = resolveActivationTarget(indicateView);
            scene.select(target, isMultiSelect);
          }

          const viewIds = scene.getAllActived().map((v: View) => v.id);
          if (viewIds.length > 0) {
            scene.beginTransaction(viewIds);
          }

          if (action === Action.MOVE) {
            scene.snapAlign.begin(scene, scene.getAllActived());
          }
        }
      }
    },
    [app],
  );

  const handleMouseMoveWithAction = useCallback(
    (e: MouseEvent, scene: Scene, point: Point3, mousDownPoint: Point3) => {
      dispatcher.dispatch(actionRef.current, e, scene, point, mousDownPoint);
      lastPointRef.current = point;
    },
    [dispatcher],
  );

  const handleMouseMoveHover = useCallback(
    (scene: Scene, point: Point3) => {
      if (!canvasRef.current || !app) return;
      const bufferCtx = app.renderer.getCanvasContext().getBufferContext();

      let selected = false;
      for (const view of scene.children) {
        const {
          view: _view,
          content,
          extraData: _extraData,
        } = view.interact(point, bufferCtx);
        if (_view && content && _extraData) {
          indicateViewRef.current = _view as View;
          indicateContentRef.current = content;
          actionRef.current = _extraData.action;
          extraDataRef.current = _extraData;
          canvasRef.current.style.cursor = _extraData.cursorStyle;
          selected = true;
        }
      }
      if (!selected) {
        indicateViewRef.current =
          indicateContentRef.current =
          extraDataRef.current =
            null;
        actionRef.current = Action.NONE;
        canvasRef.current.style.cursor = Cursor.Default;
      }
    },
    [app, canvasRef],
  );

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!app || !canvasRef.current) return;
      const scene = app.getCurrentScene();
      if (!scene) return;

      const point = event2Point(e);
      const mousDownPoint = mouseDownPointRef.current;

      if (isMouseDownRef.current && mousDownPoint) {
        handleMouseMoveWithAction(e, scene, point, mousDownPoint);
      } else {
        handleMouseMoveHover(scene, point);
      }
    },
    [app, canvasRef, handleMouseMoveHover, handleMouseMoveWithAction],
  );

  const onMouseLeave = useCallback(() => {
    if (!app || !canvasRef.current) return;
    const scene = app.getCurrentScene();
    if (!scene) return;

    if (isMouseDownRef.current) {
      scene.commitTransaction();
      scene.snapAlign.end();
      isMouseDownRef.current = false;
      mouseDownPointRef.current = null;
      lastPointRef.current = null;
      actionRef.current = Action.NONE;
    }

    if (selectionRectViewRef.current) {
      const selectBoxViews: View[] = [];
      for (const view of scene.children) {
        if (isSelectBoxView(view)) {
          selectBoxViews.push(view);
        }
      }
      for (const selectBoxView of selectBoxViews) {
        scene.removeChild(selectBoxView, false);
      }
      selectionRectViewRef.current = null;
    }
  }, [app, canvasRef]);

  const onClick = useCallback(
    (e: MouseEvent) => {
      if (!app || !canvasRef.current) return;
      const scene = app.getCurrentScene();
      if (!scene) return;

      const mousDownPoint = mouseDownPointRef.current;
      const mouseUpPoint = mouseUpPointRef.current;
      if (!mousDownPoint || !mouseUpPoint) return;

      if (mousDownPoint.isSame(mouseUpPoint)) {
        const indicateView = indicateViewRef.current;

        if (indicateView) {
          const indicateContent = indicateContentRef.current;
          const isTextEditTarget =
            isTextView(indicateView) &&
            indicateContent !== null &&
            (isGraphType(indicateContent as any, GraphType.PRINTABLE_TEXTELEMENT) ||
              isGraphType(indicateContent as any, GraphType.NONPRINTABLE_TEXTELEMENT));

          if (isTextEditTarget && isTextView(indicateView)) {
            const fixedIndex = indicateView.element2Index(
              indicateContent as Parameters<
                typeof indicateView.element2Index
              >[0],
              mousDownPoint,
            );
            indicateView.setSelection(fixedIndex, fixedIndex);

            const bounds = (indicateContent as any).bounds;
            const worldMatrix = indicateView.getWorldMatrix();
            const relativeBottomLeft = new Point3(
              bounds.x,
              bounds.y + bounds.height,
              0,
            );
            const worldBottomLeft = worldMatrix.multiply(relativeBottomLeft);
            const input = inputRef.current;
            const canvas = canvasRef.current;
            const layoutBounds = indicateView.layoutArea;
            if (input && layoutBounds && canvas) {
              // 逻辑坐标 → CSS 坐标：乘以 (样式尺寸 / 逻辑尺寸)
              const scaleX = canvas.clientWidth / canvas.width;
              const scaleY = canvas.clientHeight / canvas.height;
              // canvas 在容器中的偏移（flex 居中导致）
              const offsetX = canvas.offsetLeft;
              const offsetY = canvas.offsetTop;
              input.style.left = `${offsetX + worldBottomLeft.x * scaleX}px`;
              input.style.top = `${offsetY + worldBottomLeft.y * scaleY}px`;
              input.style.width = `${layoutBounds.width * scaleX}px`;
              input.style.height = `16px`;
              input.style.display = "block";
              input.focus();
              input.value = indicateView.getContentText()[fixedIndex[0]];
              input.selectionStart = fixedIndex[1] + fixedIndex[2];
              input.selectionEnd = fixedIndex[1] + fixedIndex[2];
            }
          }
          const isMultiSelect = navigator.platform.startsWith("Mac")
            ? e.metaKey
            : e.ctrlKey;
          const target = resolveActivationTarget(indicateView);
          scene.select(target, isMultiSelect);
        } else {
          clearAllStates(scene);
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

      onInteractionEnd?.();
    },
    [app, canvasRef, inputRef, onMouseLeave, onInteractionEnd],
  );

  const onMouseUp = useCallback(
    (e: MouseEvent) => {
      const upPoint = event2Point(e);
      mouseUpPointRef.current = upPoint;
      isMouseDownRef.current = false;

      if (app) {
        const scene = app.getCurrentScene();
        if (scene) {
          const action = actionRef.current;

          if (action === Action.CONNECT) {
            const bufferCtx = app.renderer
              .getCanvasContext()
              .getBufferContext();
            dispatcher.finishConnect(scene, upPoint, bufferCtx);
          } else if (action === Action.SELECT) {
            const activedViews = scene.getAllActived();
            if (activedViews.length > 0) {
              const lastView = activedViews[activedViews.length - 1];
              lastView.setSelected(true);
            }
          } else if (
            action === Action.MOVE ||
            action === Action.RESIZE ||
            action === Action.ROTATE ||
            action === Action.EDIT_POINT
          ) {
            scene.snapAlign.end();
          }

          scene.commitTransaction();
        }
      }
    },
    [app, dispatcher],
  );

  const onDoubleClick = useCallback(
    (e: MouseEvent) => {
      if (!app || !canvasRef.current) return;
      const scene = app.getCurrentScene();
      if (!scene) return;

      const mousDownPoint = mouseDownPointRef.current;
      const mouseUpPoint = mouseUpPointRef.current;
      if (!mousDownPoint || !mouseUpPoint) return;

      if (
        mousDownPoint.isSame(mouseUpPoint) &&
        lastClickTimeRef.current &&
        Date.now() - lastClickTimeRef.current < 300
      ) {
        if (
          isTextView(indicateViewRef.current) &&
          indicateContentRef.current !== null &&
          (isGraphType(indicateContentRef.current as any, GraphType.PRINTABLE_TEXTELEMENT) ||
            isGraphType(indicateContentRef.current as any, GraphType.NONPRINTABLE_TEXTELEMENT))
        ) {
          // 双击选中一整行（可扩展）
        }
      }
    },
    [app, canvasRef],
  );

  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
  }, []);

  const onContextMenu = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      if (!app || !canvasRef.current || !onContextMenuHit) return;
      const scene = app.getCurrentScene();
      if (!scene) return;

      const cssX = e.clientX;
      const cssY = e.clientY;
      const point = event2Point(e);
      let hitView: View | null = null;

      const bufferCtx = app.renderer.getCanvasContext().getBufferContext();
      for (const view of scene.children) {
        const { view: _view } = view.interact(point, bufferCtx);
        if (_view) {
          hitView = _view as View;
        }
      }

      onContextMenuHit({
        target: hitView ? "view" : "canvas",
        view: hitView,
        position: { x: cssX, y: cssY },
        canvasPosition: { x: point.x, y: point.y },
      });
    },
    [app, canvasRef, onContextMenuHit],
  );

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      if (!actions || !canvasRef.current) return;

      try {
        if (!e.dataTransfer) return;
        const dataStr = e.dataTransfer.getData("application/json");
        if (!dataStr) return;

        const { template } = JSON.parse(dataStr) as {
          template: IComponentTemplate;
        };
        if (!template) return;

        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        actions.view.create(template, { x, y });
      } catch (error) {
        console.error("[BanvasDesign] 拖拽创建组件失败:", error);
      }
    },
    [actions, canvasRef],
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
