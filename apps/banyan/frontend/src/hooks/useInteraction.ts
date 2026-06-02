/**
 * useInteraction —— 统一交互 Hook
 *
 * 支持 Design 和 Flow 两种模式，通过 options 注入场景差异。
 *
 * 职责：
 * 1. 实例化 InteractionStateMachine + InteractionDelegate 适配器
 * 2. 绑定/解绑 DOM 事件（canvas + window keyboard）
 * 3. 根据 StateMachine 输出设置 canvas cursor
 * 4. 派发场景特定回调（contextMenu / click / drop / delete）
 * 5. Design 模式：绑定文本编辑 input 事件（IME / 键盘）
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  InteractionStateMachine,
  resolveActivationTarget,
  Point3,
  Vector3,
  Matrix4,
  Cursor,
  View,
  SelectBoxView,
  EdgeView,
  NodeView,
  PortView,
  isPortView,
  isEdgeView,
  isNodeView,
  isTextView,
  ViewType,
} from "@banyuan/banvasgl";
import type {
  InteractionState,
  InteractionOutput,
  InteractionDelegate,
  InteractionCapability,
  HoverTarget,
  IBanvasActions,
  IGraph,
  IViewAddon,
  IMaterialTemplate,
  IPortView,
  ITextView,
} from "@banyuan/banvasgl";
// ────────────────────────────────────────────
//  公共类型导出
// ────────────────────────────────────────────

export type InteractionMode = "design" | "flow";

/** Design 模式的右键菜单命中信息 */
export interface ContextMenuHitResult {
  target: "canvas" | "view";
  view: View | null;
  position: { x: number; y: number };
  canvasPosition: { x: number; y: number };
}

/** Flow 模式的右键菜单事件信息 */
export interface FlowContextMenuEvent {
  position: { x: number; y: number };
  targetType: "node" | "edge" | "canvas";
  targetId: string | null;
}

// ────────────────────────────────────────────
//  业务场景能力集
// ────────────────────────────────────────────

/** Design 场景能力集 */
const DESIGN_CAPABILITIES: readonly InteractionCapability[] = [
  "pan",
  "move",
  "resize",
  "rotate",
  "connect",
  "box-select",
  "text-selection",
  "edit-point",
  "drop",
] as const;

/** Flow 场景能力集 */
const FLOW_CAPABILITIES: readonly InteractionCapability[] = [
  "pan",
  "move",
  "connect",
  "drop",
] as const;

// ────────────────────────────────────────────
//  Hook Options
// ────────────────────────────────────────────

export interface UseInteractionOptions {
  canvas: HTMLCanvasElement | null;
  actions: IBanvasActions | null;
  mode: InteractionMode;

  // ── Design 模式回调 ──
  /** 文本编辑 input DOM 节点（由 useCanvasInit 的 textInput 选项提供） */
  inputElement?: HTMLInputElement | null;
  onContextMenuHit?: (hit: ContextMenuHitResult) => void;

  // ── Flow 模式回调 ──
  /** 右键菜单回调（Flow 模式） */
  onFlowContextMenu?: (event: FlowContextMenuEvent) => void;
}

// ────────────────────────────────────────────
//  Hook 实现
// ────────────────────────────────────────────

export function useInteraction({
  canvas,
  actions,
  mode,
  inputElement,
  onContextMenuHit,
  onFlowContextMenu,
}: UseInteractionOptions) {
  const [interactionState, setInteractionState] = useState<InteractionState>({
    mode: "idle",
  });

  // ref 稳定化回调
  const onContextMenuHitRef = useRef(onContextMenuHit);
  onContextMenuHitRef.current = onContextMenuHit;
  const onFlowContextMenuRef = useRef(onFlowContextMenu);
  onFlowContextMenuRef.current = onFlowContextMenu;
  const isComposingRef = useRef(false);

  // ── 创建 Delegate + StateMachine ──
  // Delegate 是状态机与宿主之间的操作契约。
  // 部分方法是 actions 的简单转发（保持依赖边界一致性），
  // 部分包含适配/业务逻辑（hitTest、finishConnect、resolveActivationTarget 等）。
  const machine = useMemo(() => {
    if (!actions) return null;

    const capabilities: readonly InteractionCapability[] =
      mode === "design" ? DESIGN_CAPABILITIES : FLOW_CAPABILITIES;

    const delegate: InteractionDelegate = {
      // ── 命中检测（结构转换：hitTestDetailed → HoverTarget） ──
      hitTest(worldPoint: Point3): HoverTarget | null {
        const result = actions.view.hitTestDetailed(worldPoint);
        if (result.view && result.content && result.extraData) {
          return {
            view: result.view as View,
            content: result.content,
            action: result.extraData.action,
            extraData: result.extraData,
            cursor: result.cursor,
          };
        }
        return null;
      },

      // ── 选择 ──
      select(viewId: string, multiple?: boolean) {
        actions.view.select(viewId, multiple);
      },
      deselect() {
        actions.view.deselect();
      },
      getAllActivedViews(): View[] {
        return actions.view.getAllActivedViews();
      },

      // ── 移动 ──
      translateActived(dx: number, dy: number) {
        actions.view.translateActived(dx, dy);
      },
      snapAlignBegin() {
        actions.view.snapAlignBegin();
      },
      snapAlignSnap(viewId: string) {
        return actions.view.snapAlignSnap(viewId);
      },
      snapAlignEnd() {
        actions.view.snapAlignEnd();
      },

      // ── 缩放 ──
      resize(
        view: View,
        fixedPoint: Point3,
        dynamicPoint: Point3,
        vector: Vector3,
        proportional: boolean,
      ) {
        view.resize(fixedPoint, dynamicPoint, vector, proportional);
      },

      // ── 旋转 ──
      rotate(view: View, angle: number, center: Point3) {
        view.rotate(0, 0, angle, center);
      },

      // ── 编辑顶点 ──
      editPoint(view: View, point: Point3, delta: Vector3) {
        view.editPoint(point, delta);
      },

      // ── 文本选择 ──
      textInteract(
        view: View,
        point: Point3,
        bufferCtx: CanvasRenderingContext2D,
      ) {
        return view.interact(point, bufferCtx);
      },
      element2Index(view: View, content: IGraph | IViewAddon, point: Point3) {
        return (view as any).element2Index(content, point);
      },
      setSelection(view: View, fixedIndex: any, dynamicIndex: any) {
        (view as any).setSelection(fixedIndex, dynamicIndex);
      },

      // ── 框选 ──
      createSelectBox(startPoint: Point3): SelectBoxView {
        const selectBox = new SelectBoxView();
        selectBox.matrix = Matrix4.translation(startPoint.x, startPoint.y, 0);
        return selectBox;
      },
      addTempChild(view: View) {
        actions.view.addTempChild(view);
      },
      removeTempChild(view: View) {
        actions.view.removeTempChild(view);
      },
      getTopLevelViews(): View[] {
        return actions.page.getTopLevelViews();
      },

      // ── 连线 ──
      createTempEdge(fromPortId: string): EdgeView {
        const edge = new EdgeView({ fromPortId });
        actions.view.addTempChild(edge as unknown as View);
        return edge;
      },
      setTempTarget(edge: EdgeView, point: Point3) {
        edge.setTempTarget(point);
      },
      finishConnect(edge: EdgeView, point: Point3) {
        const bufferCtx = actions.view.getBufferContext();
        if (!bufferCtx) return;

        const children = actions.page.getTopLevelViews();
        let targetPortId: string | null = null;

        if (mode === "flow") {
          // Flow 模式：严格的端口方向校验 + 同节点禁连 + maxConnections
          let fromPort: IPortView | null = null;
          outer: for (const v of children) {
            if ("children" in v) {
              for (const child of (v as any).children) {
                if (isPortView(child) && child.id === edge.fromPortId) {
                  fromPort = child;
                  break outer;
                }
              }
            }
          }

          for (const view of children) {
            const { view: hit } = view.interact(point, bufferCtx);
            if (!hit || !isPortView(hit)) continue;
            if (hit.id === edge.fromPortId) continue;

            // 方向校验
            const fromDir = fromPort?.portDirection;
            const toDir = hit.portDirection;
            if (fromDir === "output" && toDir !== "input") continue;
            if (fromDir === "input" && toDir !== "output") continue;

            // 同节点禁连
            const fromNodeId = edge.fromPortId?.replace(/_[^_]+$/, "");
            const toNodeId = hit.id.replace(/_[^_]+$/, "");
            if (fromNodeId && fromNodeId === toNodeId) continue;

            // maxConnections 校验
            const targetPortView = hit as unknown as PortView;
            if (
              targetPortView.maxConnections != null &&
              targetPortView.maxConnections !== Infinity
            ) {
              const existingCount = children.filter(
                (v) =>
                  v instanceof EdgeView &&
                  (v.toPortId === hit.id || v.fromPortId === hit.id),
              ).length;
              if (existingCount >= targetPortView.maxConnections) continue;
            }

            targetPortId = hit.id;
            break;
          }
        } else {
          // Design 模式：简单匹配
          for (const view of children) {
            const { view: hit } = view.interact(point, bufferCtx);
            if (hit && isPortView(hit) && hit.id !== edge.fromPortId) {
              targetPortId = hit.id;
              break;
            }
          }
        }

        const edgeAsView = edge as unknown as View;
        if (targetPortId && edge.fromPortId) {
          actions.view.removeTempChild(edgeAsView);
          edge.connect(edge.fromPortId, targetPortId);
          actions.view.addTempChild(edgeAsView);
        } else {
          actions.view.removeTempChild(edgeAsView);
        }
      },

      // ── Pan ──
      panStart(clientX: number, clientY: number): boolean {
        return actions.page.panStart(clientX, clientY);
      },
      panMove(
        clientX: number,
        clientY: number,
        canvasWidth: number,
        canvasHeight: number,
      ): boolean {
        return actions.page.panMove(
          clientX,
          clientY,
          canvasWidth,
          canvasHeight,
        );
      },
      panEnd(): boolean {
        return actions.page.panEnd();
      },
      isSpaceHeld(): boolean {
        return actions.page.isSpaceHeld;
      },
      setSpaceHeld(held: boolean) {
        actions.page.setSpaceHeld(held);
      },

      // ── 事务 ──
      beginTransaction(viewIds: string[]) {
        actions.page.beginTransaction(viewIds);
      },
      commitTransaction() {
        actions.page.commitTransaction();
      },

      // ── 辅助 ──
      getBufferCtx(): CanvasRenderingContext2D | null {
        return actions.view.getBufferContext();
      },
      resolveActivationTarget(view: View): View {
        return resolveActivationTarget(view);
      },
    };

    return new InteractionStateMachine(delegate, { capabilities });
  }, [actions, mode]);

  // ── 处理状态机输出 ──
  const applyOutput = useCallback(
    (output: InteractionOutput) => {
      if (output.cursor !== undefined && canvas) {
        canvas.style.cursor = output.cursor;
      }
      if (output.stateChanged && machine) {
        setInteractionState(machine.state);
      }
      if (output.shouldNotify) {
        if (mode === "flow") {
          actions?.app.notify();
        }
      }
    },
    [canvas, machine, mode, actions],
  );

  // ── DOM 事件绑定 ──
  useEffect(() => {
    if (!canvas || !actions || !machine) return;

    const onMouseDown = (e: MouseEvent) => {
      const multiSelect = navigator.platform.startsWith("Mac")
        ? e.metaKey
        : e.ctrlKey;

      const worldPoint = actions.view.screenToWorld(e);
      const output = machine.handle({
        type: "pointerdown",
        worldPoint,
        clientX: e.clientX,
        clientY: e.clientY,
        button: e.button,
        multiSelect,
      });
      applyOutput(output);
    };

    const onMouseMove = (e: MouseEvent) => {
      const worldPoint = actions.view.screenToWorld(e);
      const output = machine.handle({
        type: "pointermove",
        worldPoint,
        clientX: e.clientX,
        clientY: e.clientY,
        canvasWidth: canvas.clientWidth,
        canvasHeight: canvas.clientHeight,
        ctrlKey: e.ctrlKey,
      });
      applyOutput(output);
    };

    const onMouseUp = (e: MouseEvent) => {
      const worldPoint = actions.view.screenToWorld(e);
      const output = machine.handle({
        type: "pointerup",
        worldPoint,
        clientX: e.clientX,
        clientY: e.clientY,
      });
      applyOutput(output);
    };

    const onMouseLeave = () => {
      const output = machine.reset();
      applyOutput(output);
    };

    const onClick = (e: MouseEvent) => {
      // Pan 模式下不触发 click
      if (actions.page.isPanning) return;

      if (mode === "flow") {
        // Flow click：选中/取消选中 + 通知业务层
        const point = actions.view.screenToWorld(e);
        let hitView: View | null = null;
        const bufferCtx = actions.view.getBufferContext();
        const children = actions.page.getTopLevelViews();
        if (bufferCtx) {
          for (const view of children) {
            const { view: _view } = view.interact(point, bufferCtx);
            if (_view) hitView = _view as View;
          }
        }

        if (hitView) {
          const isMultiSelect = navigator.platform.startsWith("Mac")
            ? e.metaKey
            : e.ctrlKey;
          actions.view.select(hitView.id, isMultiSelect);
        } else {
          actions.view.deselect();
        }
        canvas.style.cursor = Cursor.Default;
      }
      // Design click 已在状态机的 pointerUp 中处理（旧 useCanvasEvents 的 onClick 逻辑）
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // Space → pan
      if (
        e.code === "Space" &&
        !e.repeat &&
        (!e.target || (e.target as HTMLElement).tagName === "CANVAS")
      ) {
        const output = machine.handle({
          type: "keydown",
          code: e.code,
          repeat: e.repeat,
        });
        applyOutput(output);
        return;
      }

      // Delete/Backspace → 删除选中（Flow 模式）
      if (mode === "flow" && (e.key === "Delete" || e.key === "Backspace")) {
        const actived = actions.view.getAllActivedViews();
        if (actived.length === 0) return;
        e.preventDefault();

        let changed = false;
        const children = actions.page.getTopLevelViews();
        for (const view of [...actived]) {
          if (isEdgeView(view)) {
            actions.view.removeTempChild(view as unknown as View);
            changed = true;
          } else if (isNodeView(view)) {
            const nodeId = view.id;
            const relatedEdges = children.filter(
              (v): v is EdgeView =>
                isEdgeView(v) &&
                !!(
                  v.fromPortId?.startsWith(nodeId + "_") ||
                  v.toPortId?.startsWith(nodeId + "_")
                ),
            );
            for (const edge of relatedEdges) {
              actions.view.removeTempChild(edge as unknown as View);
            }
            actions.view.removeTempChild(view as unknown as View);
            changed = true;
          }
        }

        if (changed) {
          actions.app.notify();
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        const output = machine.handle({
          type: "keyup",
          code: e.code,
        });
        applyOutput(output);
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();

      const point = actions.view.screenToWorld(e);
      const children = actions.page.getTopLevelViews();
      const bufferCtx = actions.view.getBufferContext();

      if (mode === "flow") {
        // Flow 右键菜单
        if (!onFlowContextMenuRef.current) return;

        let targetType: "node" | "edge" | "canvas" = "canvas";
        let targetId: string | null = null;

        if (bufferCtx) {
          for (const view of children) {
            const { view: hit } = view.interact(point, bufferCtx);
            if (hit) {
              if (view instanceof NodeView) {
                targetType = "node";
                targetId = view.id;
                if (!view.actived) actions.view.select(view.id);
              } else if (view instanceof EdgeView) {
                targetType = "edge";
                targetId = view.id ?? null;
                if (!view.actived) actions.view.select(view.id);
              }
              break;
            }
          }
        }

        onFlowContextMenuRef.current({
          position: { x: e.clientX, y: e.clientY },
          targetType,
          targetId,
        });
      } else {
        // Design 右键菜单
        if (!onContextMenuHitRef.current) return;

        let hitView: View | null = null;
        if (bufferCtx) {
          for (const view of children) {
            const { view: _view } = view.interact(point, bufferCtx);
            if (_view) hitView = _view as View;
          }
        }

        onContextMenuHitRef.current({
          target: hitView ? "view" : "canvas",
          view: hitView,
          position: { x: e.clientX, y: e.clientY },
          canvasPosition: { x: point.x, y: point.y },
        });
      }
    };

    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };

    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      if (!e.dataTransfer) return;

      // 统一 Drop 协议：application/json + materialId 或 template
      try {
        const dataStr = e.dataTransfer.getData("application/json");
        if (!dataStr) return;

        const parsed = JSON.parse(dataStr) as {
          template?: IMaterialTemplate;
          materialId?: string;
        };

        const worldPoint = actions.view.screenToWorld(e);
        const x = worldPoint.x;
        const y = worldPoint.y;

        if (parsed.materialId) {
          import("@/api/materials").then(({ fetchMaterial }) => {
            fetchMaterial(parsed.materialId!)
              .then((res) => {
                if (res.data) {
                  actions.view.instantiateMaterial(res.data, { x, y });
                }
              })
              .catch((err) => {
                console.error("[useInteraction] 物料实例化失败:", err);
              });
          });
        } else if (parsed.template) {
          actions.view.instantiateMaterial(parsed.template, { x, y });
        }
      } catch (error) {
        console.error("[useInteraction] 拖拽创建组件失败:", error);
      }
    };

    // 绑定事件
    canvas.addEventListener("mousedown", onMouseDown, { passive: true });
    canvas.addEventListener("mousemove", onMouseMove, { passive: true });
    canvas.addEventListener("mouseup", onMouseUp, { passive: true });
    canvas.addEventListener("mouseleave", onMouseLeave, { passive: true });
    canvas.addEventListener("click", onClick, { passive: true });
    canvas.addEventListener("contextmenu", onContextMenu, { passive: false });
    canvas.addEventListener("dragover", onDragOver);
    canvas.addEventListener("drop", onDrop);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // ── Design 模式：文本编辑 input 事件绑定 ──
    const inputEl = mode === "design" ? (inputElement ?? null) : null;

    const onInputEvent = (e: Event) => {
      const selectedView =
        actions?.view.getSelectedView(ViewType.TEXTVIEW) ?? null;
      if (!selectedView || !selectedView.selection.isSelection) return;
      if (!(e instanceof InputEvent)) return;
      if (e.inputType === "insertText") {
        const text = e.data || "";
        if (text.length > 0) {
          actions.page.beginTransaction([selectedView.id]);
          selectedView.input(text, false);
          actions.page.commitTransaction();
        }
      }
    };

    const onCompositionStart = () => {
      isComposingRef.current = true;
      const selectedView =
        actions?.view.getSelectedView(ViewType.TEXTVIEW) ?? null;
      if (selectedView && selectedView.selection.isSelection) {
        actions.page.beginTransaction([selectedView.id]);
      }
    };

    const onCompositionUpdate = (e: Event) => {
      const selectedView =
        actions?.view.getSelectedView(ViewType.TEXTVIEW) ?? null;
      if (!selectedView || !selectedView.selection.isSelection) return;
      const text = (e as CompositionEvent).data || "";
      if (text.length > 0) {
        selectedView.input(text, true);
      }
    };

    const onCompositionEnd = (e: Event) => {
      isComposingRef.current = false;
      const selectedView =
        actions?.view.getSelectedView(ViewType.TEXTVIEW) ?? null;
      if (!selectedView || !selectedView.selection.isSelection) return;
      const text = (e as CompositionEvent).data || "";
      if (text.length > 0) {
        selectedView.input(text, false);
      }
      actions.page.commitTransaction();
    };

    const onInputKeyDown = (e: Event) => {
      const ke = e as KeyboardEvent;
      const selectedView =
        actions?.view.getSelectedView(ViewType.TEXTVIEW) ?? null;
      if (!selectedView || !selectedView.selection.isSelection || !inputEl)
        return;

      if (isComposingRef.current && ke.key !== "Escape") return;

      switch (ke.key) {
        case "ArrowUp":
        case "ArrowDown":
          ke.preventDefault();
          break;
        case "End":
          ke.preventDefault();
          inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
          break;
        case "Backspace":
          actions.page.beginTransaction([selectedView.id]);
          selectedView.delete(true);
          actions.page.commitTransaction();
          break;
        case "Delete":
          actions.page.beginTransaction([selectedView.id]);
          selectedView.delete(false);
          actions.page.commitTransaction();
          break;
        case "Enter":
          ke.preventDefault();
          actions.page.beginTransaction([selectedView.id]);
          selectedView.newLine();
          actions.page.commitTransaction();
          break;
        case "Escape":
          if (!isComposingRef.current) {
            selectedView.selection.fixedIndex = undefined;
            selectedView.selection.dynamicIndex = undefined;
            selectedView.setSelection(undefined, undefined);
          }
          break;
        case "Tab":
          ke.preventDefault();
          {
            const allViews = actions.view.flattenViewTree();
            const editableViews = allViews.filter((v) => isTextView(v));
            if (editableViews.length > 0) {
              const currentIndex = editableViews.findIndex(
                (v) => v === selectedView,
              );
              const nextIndex =
                (ke.shiftKey ? currentIndex - 1 : currentIndex + 1) %
                editableViews.length;
              const nextView = editableViews[nextIndex] as ITextView;
              actions.view.select(nextView.id);
              const bounds = nextView.boundingBox?.getBounds();
              if (bounds && canvas) {
                const worldMatrix = nextView.getWorldMatrix();
                const relativeBottomLeft = new Point3(
                  bounds.x,
                  bounds.y + bounds.height,
                  0,
                );
                const worldBottomLeft =
                  worldMatrix.multiply(relativeBottomLeft);
                const layoutBounds = nextView.layoutArea;
                if (layoutBounds) {
                  const screenPos = actions.view.worldToScreen(
                    worldBottomLeft.x,
                    worldBottomLeft.y,
                  );
                  const scaleX = canvas.clientWidth / canvas.width;
                  inputEl.style.left = `${screenPos.x}px`;
                  inputEl.style.top = `${screenPos.y}px`;
                  inputEl.style.width = `${layoutBounds.width * scaleX}px`;
                  inputEl.style.height = `16px`;
                  inputEl.style.display = "block";
                  inputEl.focus();
                  const contentText = nextView.getContentText();
                  inputEl.value = contentText[0];
                }
              }
            }
          }
          break;
        default:
          break;
      }
    };

    if (inputEl) {
      inputEl.addEventListener("input", onInputEvent);
      inputEl.addEventListener("compositionstart", onCompositionStart);
      inputEl.addEventListener("compositionupdate", onCompositionUpdate);
      inputEl.addEventListener("compositionend", onCompositionEnd);
      inputEl.addEventListener("keydown", onInputKeyDown);
    }

    return () => {
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("mouseleave", onMouseLeave);
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("contextmenu", onContextMenu);
      canvas.removeEventListener("dragover", onDragOver);
      canvas.removeEventListener("drop", onDrop);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      if (inputEl) {
        inputEl.removeEventListener("input", onInputEvent);
        inputEl.removeEventListener("compositionstart", onCompositionStart);
        inputEl.removeEventListener("compositionupdate", onCompositionUpdate);
        inputEl.removeEventListener("compositionend", onCompositionEnd);
        inputEl.removeEventListener("keydown", onInputKeyDown);
      }
    };
  }, [canvas, actions, machine, mode, applyOutput]);

  return {
    /** 当前交互状态（只读） */
    interactionState,
    /** 状态机实例 */
    machine,
  };
}
