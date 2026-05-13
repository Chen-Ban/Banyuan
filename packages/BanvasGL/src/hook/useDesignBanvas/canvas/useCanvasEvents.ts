import { useCallback, useEffect, useMemo, useRef } from "react";
import { App } from "@/core/app";
import { Point3 } from "@/core/math";
import type { Scene } from "@/core/scene";
import {
  isNonPrintableTextElement,
  isPrintableTextElement,
} from "@/core/graph";
import { View, SelectBoxView } from "@/core/views";
import EdgeView from "@/core/views/flow/EdgeView";
import {
  isTextView,
  isSelectBoxView,
  Action,
  Cursor,
  ExtraData,
  IViewAddon,
  IGraph,
} from "@/core/interfaces";
import type { IBanvasActions } from "@/core/interfaces";
import { clearAllStates } from "@/core/scene/operations";
import { InteractionDispatcher } from "./InteractionDispatcher";
import type { InteractionContext } from "./InteractionDispatcher";

/** 将 MouseEvent 转为 canvas 物理像素坐标 */
const event2Point = (e: MouseEvent): Point3 => {
  const ratio = window.devicePixelRatio;
  const { offsetX, offsetY } = e;
  return new Point3(offsetX * ratio, offsetY * ratio, 0);
};

export interface ContextMenuHitResult {
  /** 命中的目标类型 */
  target: "canvas" | "view";
  /** 命中的 View（如有） */
  view: View | null;
  /** 屏幕坐标（clientX/clientY，用于 fixed 定位菜单 UI） */
  position: { x: number; y: number };
  /** 画布内坐标（物理像素，用于粘贴等操作） */
  canvasPosition: { x: number; y: number };
}

export interface UseCanvasEventsOptions {
  app: App | null;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  inputRef: React.RefObject<HTMLInputElement | null>;
  /** actions 引用，用于拖拽创建等需要走统一通道的操作 */
  actions: IBanvasActions | null;
  /** 右键菜单命中回调 */
  onContextMenuHit?: (hit: ContextMenuHitResult) => void;
  /** 画布交互结束回调（mouseUp 后触发，用于通知面板刷新） */
  onInteractionEnd?: () => void;
}

/**
 * Canvas 事件绑定
 */
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
  const indicateViewRef = useRef<View | null>(null);
  const indicateContentRef = useRef<IGraph | IViewAddon | null>(null);
  const actionRef = useRef<Action>(Action.NONE);
  const extraDataRef = useRef<ExtraData | null>(null);
  const lastClickTimeRef = useRef<number | undefined>(undefined);
  const selectionRectViewRef = useRef<SelectBoxView | null>(null);
  const tempEdgeRef = useRef<EdgeView | null>(null);

  // 创建 InteractionDispatcher 实例（依赖注入 ref 读取器和 DOM/React 回调）
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
    };
    return new InteractionDispatcher(ctx);
  }, [canvasRef]);

  // 鼠标落下，判定操作类型
  const onMouseDown = useCallback(
    async (e: MouseEvent) => {
      if (!app) return;
      const scene = app.getCurrentScene();
      if (!scene) return;
      mouseDownPointRef.current = event2Point(e);
      // 如果在普通移动过程中未找到候选节点，则设置操作类型为框选
      if (!indicateViewRef.current && !indicateContentRef.current) {
        actionRef.current = Action.SELECT;
        // 创建临时框选矩形容器
        selectionRectViewRef.current = new SelectBoxView({
          style: {
            width: canvasRef.current?.width,
            height: canvasRef.current?.height,
          },
        });
        scene.addChild(selectionRectViewRef.current, false);
      } else if (actionRef.current === Action.CONNECT) {
        // CONNECT 不开启事务，不创建 SelectBoxView，等待 mousemove 创建临时 EdgeView
      } else {
        // 对于会修改 View 属性的持续性操作，开启事务
        const action = actionRef.current;
        if (
          action === Action.MOVE ||
          action === Action.RESIZE ||
          action === Action.ROTATE ||
          action === Action.EDIT_POINT
        ) {
          // 收集参与操作的 View ids
          const indicateView = indicateViewRef.current;
          let viewIds: string[];
          if (indicateView && !indicateView.actived) {
            // 未激活的单个 View（拖动时会被自动激活）
            viewIds = [indicateView.id];
          } else {
            // 已激活的所有 View
            viewIds = scene.getAllActived().map((v: View) => v.id);
          }
          if (viewIds.length > 0) {
            scene.beginTransaction(viewIds);
          }

          // Move 操作时初始化吸附对齐
          if (action === Action.MOVE) {
            const activeViews =
              indicateView && !indicateView.actived
                ? [indicateView]
                : scene.getAllActived();
            scene.snapAlign.begin(scene, activeViews);
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
      if (!canvasRef.current) return;
      let selected = false;
      for (const view of scene.children) {
        const {
          view: _view,
          content,
          extraData: _extraData,
        } = view.interact(point);
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
    [canvasRef],
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
    if (!scene || !selectionRectViewRef.current) return;

    // 删除所有框选容器
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
          const isTextEditTarget =
            isTextView(indicateView) &&
            indicateContentRef.current instanceof Array &&
            (isPrintableTextElement(indicateContentRef.current[0]) ||
              isNonPrintableTextElement(indicateContentRef.current[0]));

          if (isTextEditTarget && isTextView(indicateView)) {
            const fixedIndex = indicateView.element2Index(
              (indicateContentRef.current as unknown as any[])[0],
              mousDownPoint,
            );
            indicateView.setSelection(fixedIndex, fixedIndex);

            // 将输入框移动到选中的 textElement 下方
            const bounds = (indicateContentRef.current as unknown as any[])[0]
              .bounds;

            // 将相对坐标转换为世界坐标
            const worldMatrix = indicateView.getWorldMatrix();
            // 获取 textElement 左下角的世界坐标
            const relativeBottomLeft = new Point3(
              bounds.x,
              bounds.y + bounds.height,
              0,
            );
            const worldBottomLeft = worldMatrix.multiply(relativeBottomLeft);
            // 移动输入框到该位置下方
            const input = inputRef.current;
            const layoutBounds = indicateView.layoutArea;
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
          scene.select(indicateView, e.ctrlKey || e.metaKey);
        } else {
          clearAllStates(scene);
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

      // 通知 React 层刷新，确保 PropertyPanel 等组件获取到最新的选中状态
      onInteractionEnd?.();
    },
    [app, canvasRef, inputRef, onMouseLeave, onInteractionEnd],
  );

  // 鼠标抬起，记录抬起点，提交事务
  const onMouseUp = useCallback(
    (e: MouseEvent) => {
      const upPoint = event2Point(e);
      mouseUpPointRef.current = upPoint;

      if (app) {
        const scene = app.getCurrentScene();
        if (scene) {
          const action = actionRef.current;

          if (action === Action.CONNECT) {
            // 连线：尝试完成连线（命中目标端口则建立 EdgeView，否则清理临时边）
            dispatcher.finishConnect(scene, upPoint);
          } else if (action === Action.SELECT) {
            // 框选结束：将最后一个 actived view 设为 selected
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
            // 变换操作：结束吸附对齐
            scene.snapAlign.end();
          }

          // 统一提交事务
          scene.commitTransaction();
        }
      }
    },
    [app, dispatcher],
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
          (isPrintableTextElement(indicateContentRef.current) ||
            isNonPrintableTextElement(indicateContentRef.current))
        ) {
          console.log("选中一整行");
          // 这里可以添加更多双击相关的逻辑
        }
      }
    },
    [app, canvasRef],
  );

  const onWheel = useCallback((e: WheelEvent) => {
    // 阻止页面滚动
    e.preventDefault();
  }, []);

  const onContextMenu = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      // macOS 上 Ctrl+左键会触发 contextmenu，但 Ctrl+Click 用于多选，应忽略
      if (e.ctrlKey && e.button === 0) return;
      if (!app || !canvasRef.current || !onContextMenuHit) return;
      const scene = app.getCurrentScene();
      if (!scene) return;

      // 页面绝对坐标（clientX/clientY，用于 fixed 定位弹出菜单）
      const cssX = e.clientX;
      const cssY = e.clientY;

      // 物理像素坐标（用于命中检测）
      const point = event2Point(e);
      let hitView: View | null = null;

      for (const view of scene.children) {
        const { view: _view } = view.interact(point);
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

  // 拖拽事件
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

        // dragData 直接携带 IComponentTemplate（枚举值已序列化为字符串，
        // 反序列化后与枚举值完全一致，因为 GRAPHTYPE/VIEWTYPE 均为字符串枚举）
        const { template } = JSON.parse(dataStr) as {
          template: import("@/core/interfaces").IComponentTemplate;
        };
        if (!template) return;

        // 获取拖拽位置（相对于 canvas，物理像素）
        const rect = canvasRef.current.getBoundingClientRect();
        const ratio = window.devicePixelRatio;
        const x = (e.clientX - rect.left) * ratio;
        const y = (e.clientY - rect.top) * ratio;

        actions.view.create(template, { x, y });
      } catch (error) {
        console.error("[BanvasGL] 拖拽创建组件失败:", error);
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
    canvas.addEventListener("contextmenu", onContextMenu, {
      passive: false,
    });
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
