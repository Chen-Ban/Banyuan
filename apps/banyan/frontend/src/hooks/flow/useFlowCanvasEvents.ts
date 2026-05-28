import { useCallback, useEffect, useRef } from "react";
import {
  App,
  Point3,
  View,
  Action,
  Cursor,
  isPortView,
  clearAllStates,
} from "@banyuan/banvasgl";
import type {
  Scene,
  ExtraData,
  IViewAddon,
  IGraph,
  IPortView,
} from "@banyuan/banvasgl";
import type { FlowNode } from "@banyuan/flow";
import { EdgeView, NodeView, PortView } from "@banyuan/banvasgl";

/** 将 MouseEvent 转为 canvas 物理像素坐标（兼容 CSS 缩放） */
const event2Point = (e: MouseEvent): Point3 => {
  const canvas = e.target as HTMLCanvasElement;
  const scaleX = canvas.width / canvas.clientWidth;
  const scaleY = canvas.height / canvas.clientHeight;
  return new Point3(e.offsetX * scaleX, e.offsetY * scaleY, 0);
};

/** 右键菜单事件信息 */
export interface FlowContextMenuEvent {
  /** 页面坐标（用于定位菜单） */
  position: { x: number; y: number };
  /** 右键点击的目标类型 */
  targetType: "node" | "edge" | "canvas";
  /** 目标 ID（节点或连线 ID，画布空白时为 null） */
  targetId: string | null;
}

export interface UseFlowCanvasEventsOptions {
  app: App | null;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** 交互结束回调（移动/连线/Drop 完成后触发，用于触发 version 更新） */
  onInteractionEnd?: () => void;
  /** 节点选中回调（点击节点时传 nodeId，点击空白时传 null） */
  onNodeSelect?: (nodeId: string | null) => void;
  /** 右键菜单回调（画布 contextmenu 事件触发） */
  onContextMenu?: (event: FlowContextMenuEvent) => void;
  /** 用于识别拖入节点的 dataTransfer type（不传则不监听 drop 事件） */
  dragType?: string;
}

/**
 * 流程图画布事件绑定
 *
 * 精简版事件 hook，只支持：
 * - hover 光标切换
 * - 单击选中/取消选中
 * - MOVE（拖动节点）
 * - CONNECT（端口连线）
 *
 * 不包含：框选、文本编辑、事务/undo、RESIZE/ROTATE/EDIT_POINT
 */
export function useFlowCanvasEvents({
  app,
  canvasRef,
  onInteractionEnd,
  onNodeSelect,
  onContextMenu: onContextMenuCallback,
  dragType,
}: UseFlowCanvasEventsOptions) {
  const mouseDownPointRef = useRef<Point3 | null>(null);
  const lastPointRef = useRef<Point3 | null>(null);
  const indicateViewRef = useRef<View | null>(null);
  const indicateContentRef = useRef<IGraph | IViewAddon | null>(null);
  const actionRef = useRef<Action>(Action.NONE);
  const extraDataRef = useRef<ExtraData | null>(null);
  const tempEdgeRef = useRef<EdgeView | null>(null);

  // ── hover 检测 ──
  const handleHover = useCallback(
    (scene: Scene, point: Point3) => {
      if (!canvasRef.current || !app) return;
      const bufferCtx = app.renderer.getCanvasContext().getBufferContext();
      let hit = false;
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
          hit = true;
        }
      }
      if (!hit) {
        indicateViewRef.current = null;
        indicateContentRef.current = null;
        extraDataRef.current = null;
        actionRef.current = Action.NONE;
        canvasRef.current.style.cursor = Cursor.Default;
      }
    },
    [app, canvasRef],
  );

  // ── mousedown ──
  const onMouseDown = useCallback(
    (e: MouseEvent) => {
      if (!app) return;
      const scene = app.getCurrentScene();
      if (!scene) return;

      const point = event2Point(e);
      mouseDownPointRef.current = point;
      lastPointRef.current = point;

      const action = actionRef.current;
      if (action === Action.CONNECT) {
        // 连线模式：什么都不做，等 mousemove 创建临时边
      } else if (action === Action.MOVE) {
        // 移动模式：选中当前 view
        const indicateView = indicateViewRef.current;
        if (indicateView && !indicateView.actived) {
          scene.select(indicateView);
        }
      } else if (!indicateViewRef.current) {
        // 点在空白区域：取消选中
        clearAllStates(scene);
      }
    },
    [app],
  );

  // ── mousemove ──
  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!app || !canvasRef.current) return;
      const scene = app.getCurrentScene();
      if (!scene) return;

      const point = event2Point(e);
      const mouseDownPoint = mouseDownPointRef.current;

      if (!mouseDownPoint) {
        // 未按下，做 hover 检测
        handleHover(scene, point);
        return;
      }

      // 按下后拖动
      const action = actionRef.current;

      if (action === Action.MOVE) {
        // 移动节点
        const lastPoint = lastPointRef.current || mouseDownPoint;
        const delta = point.subtract(lastPoint);
        const indicateView = indicateViewRef.current;
        if (indicateView) {
          if (!indicateView.actived) {
            scene.select(indicateView);
          }
          for (const activeView of scene.getAllActived()) {
            activeView.translate(delta.x, delta.y, 0);
          }
        }
      } else if (action === Action.CONNECT) {
        // 连线
        canvasRef.current.style.cursor = Cursor.Crosshair;
        const extraData = extraDataRef.current;
        if (!extraData || extraData.action !== Action.CONNECT) return;

        let edge = tempEdgeRef.current;
        if (!edge) {
          edge = new EdgeView({ fromPortId: extraData.portViewId });
          scene.addChild(edge, false);
          tempEdgeRef.current = edge;
        }
        edge.setTempTarget(point);
      }

      lastPointRef.current = point;
    },
    [app, canvasRef, handleHover],
  );

  // ── mouseup ──
  const onMouseUp = useCallback(
    (e: MouseEvent) => {
      if (!app) return;
      const scene = app.getCurrentScene();
      if (!scene) return;

      const upPoint = event2Point(e);
      const action = actionRef.current;

      if (action === Action.CONNECT) {
        // 完成连线
        const edge = tempEdgeRef.current;
        if (edge) {
          let targetPortId: string | null = null;
          const bufferCtx = app.renderer.getCanvasContext().getBufferContext();

          // 先找到起点端口（用于方向校验）
          let fromPort: IPortView | null = null;
          outer: for (const v of scene.children) {
            for (const child of v.children) {
              if (isPortView(child) && child.id === edge.fromPortId) {
                fromPort = child;
                break outer;
              }
            }
          }

          // 遍历场景找合法目标端口
          for (const view of scene.children) {
            const { view: hit } = view.interact(upPoint, bufferCtx);
            if (!hit || !isPortView(hit)) continue;
            // 排除起点自身
            if (hit.id === edge.fromPortId) continue;

            // 方向校验：只允许 output → input（或 input → output）
            const fromDir = fromPort?.portDirection;
            const toDir = hit.portDirection;
            if (fromDir === "output" && toDir !== "input") continue;
            if (fromDir === "input" && toDir !== "output") continue;
            // bidirectional 端口可与任意方向连接，不做限制

            // 同节点校验：禁止同一节点的端口互连
            // 端口 ID 格式：${nodeId}_suffix，取最后一个 _ 之前的部分作为 nodeId
            const fromNodeId = edge.fromPortId?.replace(/_[^_]+$/, "");
            const toNodeId = hit.id.replace(/_[^_]+$/, "");
            if (fromNodeId && fromNodeId === toNodeId) continue;

            // maxConnections 校验：检查目标端口已有连线数是否达到上限
            const targetPortView = hit as unknown as PortView;
            if (targetPortView.maxConnections != null && targetPortView.maxConnections !== Infinity) {
              const existingCount = scene.children.filter(
                (v) => v instanceof EdgeView &&
                  (v.toPortId === hit.id || v.fromPortId === hit.id)
              ).length;
              if (existingCount >= targetPortView.maxConnections) continue;
            }

            targetPortId = hit.id;
            break;
          }

          if (targetPortId && edge.fromPortId) {
            scene.removeChild(edge, false);
            edge.connect(edge.fromPortId, targetPortId);
            scene.addChild(edge, false);
          } else {
            scene.removeChild(edge, false);
          }
          tempEdgeRef.current = null;
        }
      }

      mouseDownPointRef.current = null;
      lastPointRef.current = null;

      // 交互结束，通知外部写回 schema
      if (action === Action.MOVE || action === Action.CONNECT) {
        onInteractionEnd?.();
      }
    },
    [app, onInteractionEnd],
  );

  // ── click（单击选中/取消选中） ──
  const onClick = useCallback(
    (e: MouseEvent) => {
      if (!app || !canvasRef.current) return;
      const scene = app.getCurrentScene();
      if (!scene) return;

      const point = event2Point(e);
      // 命中检测
      let hitView: View | null = null;
      const bufferCtx = app.renderer.getCanvasContext().getBufferContext();
      for (const view of scene.children) {
        const { view: _view } = view.interact(point, bufferCtx);
        if (_view) hitView = _view as View;
      }

      if (hitView) {
        // macOS 用 Cmd（metaKey）多选，Windows/Linux 用 Ctrl（ctrlKey）多选
        const isMultiSelect = navigator.platform.startsWith("Mac")
          ? e.metaKey
          : e.ctrlKey;
        scene.select(hitView, isMultiSelect);
        // 通知业务层选中了哪个节点（取 hitView 所属的 NodeView id）
        onNodeSelect?.(hitView.id ?? null);
      } else {
        clearAllStates(scene);
        onNodeSelect?.(null);
      }

      canvasRef.current.style.cursor = Cursor.Default;
      actionRef.current = Action.NONE;
    },
    [app, canvasRef, onNodeSelect],
  );

  // ── contextmenu（右键菜单） ──
  const handleContextMenu = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      if (!app || !canvasRef.current || !onContextMenuCallback) return;
      const scene = app.getCurrentScene();
      if (!scene) return;

      const point = event2Point(e);
      const bufferCtx = app.renderer.getCanvasContext().getBufferContext();

      // 命中检测：判断右键点击了什么
      let targetType: "node" | "edge" | "canvas" = "canvas";
      let targetId: string | null = null;

      for (const view of scene.children) {
        const { view: hit } = view.interact(point, bufferCtx);
        if (hit) {
          if (view instanceof NodeView) {
            targetType = "node";
            targetId = view.id;
            // 如果右键的节点未被选中，先选中它
            if (!view.actived) {
              scene.select(view);
              onInteractionEnd?.();
            }
          } else if (view instanceof EdgeView) {
            targetType = "edge";
            targetId = view.id ?? null;
            if (!view.actived) {
              scene.select(view);
              onInteractionEnd?.();
            }
          }
          break;
        }
      }

      const position = {
        x: e.clientX,
        y: e.clientY,
      };

      onContextMenuCallback({ position, targetType, targetId });
    },
    [app, canvasRef, onInteractionEnd, onContextMenuCallback],
  );

  // ── keydown（Delete/Backspace 删除选中的连线或节点）──
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (!app) return;
      const scene = app.getCurrentScene();
      if (!scene) return;

      const actived = scene.getAllActived();
      if (actived.length === 0) return;

      // 阻止浏览器默认行为（如 Backspace 后退）
      e.preventDefault();

      let changed = false;
      for (const view of [...actived]) {
        if (view instanceof EdgeView) {
          // 删除连线
          scene.removeChild(view, false);
          changed = true;
        } else if (view instanceof NodeView) {
          // 删除节点时，同时删除关联的连线
          const nodeId = view.id;
          const relatedEdges = scene.children.filter(
            (v) =>
              v instanceof EdgeView &&
              (v.fromPortId?.startsWith(nodeId + "_") ||
                v.toPortId?.startsWith(nodeId + "_")),
          );
          for (const edge of relatedEdges) {
            scene.removeChild(edge, false);
          }
          scene.removeChild(view, false);
          changed = true;
        }
      }

      if (changed) {
        onInteractionEnd?.();
        onNodeSelect?.(null);
      }
    },
    [app, onInteractionEnd, onNodeSelect],
  );

  // ── dragover + drop（物料面板拖入创建节点） ──
  const handleDragOver = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    },
    [],
  );

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      if (!dragType || !app) return;

      const kind = e.dataTransfer?.getData(dragType);
      if (!kind) return;

      const scene = app.getCurrentScene();
      if (!scene) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      // 计算画布内坐标（兼容 CSS 缩放）
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;

      // 创建节点
      const newNode = buildDefaultNode(kind as FlowNode["kind"]);
      if (!newNode) return;

      const nodeView = new NodeView({
        schema: newNode,
        style: { width: 140, height: 60 },
      });
      nodeView.translate(x, y, 0);
      scene.addChild(nodeView, false);

      onInteractionEnd?.();
    },
    [app, canvasRef, dragType, onInteractionEnd],
  );

  // ── 绑定/解绑 ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !app) return;

    canvas.addEventListener("mousedown", onMouseDown, { passive: true });
    canvas.addEventListener("mousemove", onMouseMove, { passive: true });
    canvas.addEventListener("mouseup", onMouseUp, { passive: true });
    canvas.addEventListener("click", onClick, { passive: true });
    canvas.addEventListener("contextmenu", handleContextMenu);
    // keydown 需要绑定在 document 上（canvas 默认不可聚焦）
    document.addEventListener("keydown", onKeyDown);

    // drop 事件（仅当配置了 dragType 时绑定）
    if (dragType) {
      canvas.addEventListener("dragover", handleDragOver);
      canvas.addEventListener("drop", handleDrop);
    }

    return () => {
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("keydown", onKeyDown);
      canvas.removeEventListener("dragover", handleDragOver);
      canvas.removeEventListener("drop", handleDrop);
    };
  }, [app, canvasRef, onMouseDown, onMouseMove, onMouseUp, onClick, handleContextMenu, onKeyDown, dragType, handleDragOver, handleDrop]);
}

// ── 内部辅助 ──

/** 生成简单唯一 id */
function genId(): string {
  return `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * 根据 kind 构建带默认参数的 FlowNode
 */
function buildDefaultNode(kind: FlowNode["kind"]): FlowNode | null {
  const id = genId();
  const base = { id, x: 0, y: 0 };

  switch (kind) {
    case "setData":
      return { ...base, kind: "setData", viewId: "self", key: "", value: { kind: "literal", value: "" } };
    case "setVisible":
      return { ...base, kind: "setVisible", viewId: "self", visible: true };
    case "navigate":
      return { ...base, kind: "navigate", pageId: "" };
    case "animate":
      return { ...base, kind: "animate", viewId: "self", animationId: "" };
    case "dbQuery":
      return { ...base, kind: "dbQuery", collection: "", filter: {}, outputVariable: "queryResult" };
    case "dbInsert":
      return { ...base, kind: "dbInsert", collection: "", document: {}, outputVariable: "insertedId" };
    case "dbUpdate":
      return { ...base, kind: "dbUpdate", collection: "", filter: {}, update: {}, outputVariable: "modifiedCount" };
    case "dbDelete":
      return { ...base, kind: "dbDelete", collection: "", filter: {}, outputVariable: "deletedCount" };
    case "httpRequest":
      return { ...base, kind: "httpRequest", url: { kind: "literal", value: "" }, method: "GET", outputVariable: "response" };
    case "transform":
      return { ...base, kind: "transform", expression: "", variables: {}, outputVariable: "result" };
    case "script":
      return { ...base, kind: "script", code: "", inputBindings: {}, outputBindings: {} };
    case "condition":
      return {
        ...base,
        kind: "condition",
        condition: {
          left: { kind: "literal", value: "" },
          op: "==",
          right: { kind: "literal", value: "" },
        },
      };
    case "delay":
      return { ...base, kind: "delay", ms: 500 };
    case "variable":
      return { ...base, kind: "variable", viewId: "self", key: "" };
    case "pageVar":
      return { ...base, kind: "pageVar", key: "" };
    case "eventParam":
      return { ...base, kind: "eventParam", index: 0 };
    case "setVariable":
      return { ...base, kind: "setVariable", scope: "local", key: "", value: { kind: "literal", value: "" } };
    case "callFlow":
      return { ...base, kind: "callFlow", flowId: "", inputBindings: {}, outputBindings: {} };
    case "subFlow":
      return {
        ...base,
        kind: "subFlow",
        name: "子流程",
        body: { nodes: [], edges: [] },
        inputs: [],
        outputs: [],
      };
    default:
      return null;
  }
}
