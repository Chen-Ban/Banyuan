import { View, SelectBoxView } from "@/core/views";
import type Scene from "@/core/scene/Scene";
import { Point3 } from "@/core/math";
import {
  Action,
  Cursor,
  isTextView,
  isSelectBoxView,
  isPortView,
  ExtraData,
  IViewAddon,
  IGraph,
} from "@/core/interfaces";
import { Rectangle, Graph } from "@/core/graph";
import { clearAllStates } from "@/core/scene/operations";
import Bounds from "@/core/graph/base/Bounds";
import {
  isNonPrintableTextElement,
  isPrintableTextElement,
} from "@/core/graph";
import EdgeView from "@/core/views/flow/EdgeView";

export interface InteractionContext {
  /** Get the current indicated (hovered) view */
  getIndicateView(): View | null;
  /** Get the current indicated content */
  getIndicateContent(): IGraph | IViewAddon | null;
  /** Get the last mouse point */
  getLastPoint(): Point3 | null;
  /** Get extra data from the interact result */
  getExtraData(): ExtraData | null;
  /** Get the selection rect view for box-select */
  getSelectionRectView(): SelectBoxView | null;
  /** Set cursor style on the canvas */
  setCursor(cursor: Cursor): void;
  /** Select a view in the scene and update React state */
  selectView(scene: Scene, view: View, multiple: boolean): void;
  /** Clear selection state */
  clearSelection(scene: Scene): void;
  /** Get the temporary EdgeView being drawn */
  getTempEdge(): EdgeView | null;
  /** Set the temporary EdgeView being drawn */
  setTempEdge(edge: EdgeView | null): void;
}

export class InteractionDispatcher {
  constructor(private ctx: InteractionContext) {}

  /**
   * Dispatch based on action type
   */
  dispatch(
    action: Action,
    e: MouseEvent,
    scene: Scene,
    point: Point3,
    mouseDownPoint: Point3,
  ): void {
    switch (action) {
      case Action.MOVE:
        return this.handleMove(e, scene, point, mouseDownPoint);
      case Action.TEXT_SELECTION:
        return this.handleTextSelection(scene, point);
      case Action.EDIT_POINT:
        return this.handleEditPoint(point, mouseDownPoint);
      case Action.RESIZE:
        return this.handleResize(e, scene, point, mouseDownPoint);
      case Action.ROTATE:
        return this.handleRotate(scene, point);
      case Action.SELECT:
        return this.handleBoxSelect(scene, point, mouseDownPoint);
      case Action.CONNECT:
        return this.handleConnect(scene, point);
      case Action.EDIT_VIEWPORT:
      case Action.NONE:
      default:
        return;
    }
  }

  /**
   * 连线拖拽中：创建或更新临时 EdgeView
   */
  private handleConnect(scene: Scene, point: Point3): void {
    this.ctx.setCursor(Cursor.Crosshair);
    const extraData = this.ctx.getExtraData();
    if (!extraData || extraData.action !== Action.CONNECT) return;

    let edge = this.ctx.getTempEdge();
    if (!edge) {
      // 首次移动时创建临时 EdgeView
      edge = new EdgeView({ fromPortId: extraData.portViewId });
      scene.addChild(edge, false);
      this.ctx.setTempEdge(edge);
    }
    edge.setTempTarget(point);
  }

  /**
   * 连线完成：在 mouseUp 时调用
   * 命中目标端口则建立正式连线（录入操作栈），否则删除临时 EdgeView
   */
  finishConnect(scene: Scene, point: Point3): void {
    const edge = this.ctx.getTempEdge();
    if (!edge) return;

    // 命中检测：找到鼠标下方的 PortView
    let targetPortId: string | null = null;
    for (const view of scene.children) {
      const { view: hit } = view.interact(point);
      if (hit && isPortView(hit) && hit.id !== edge.fromPortId) {
        targetPortId = hit.id;
        break;
      }
    }

    if (targetPortId && edge.fromPortId) {
      // 先将临时边从 scene 移除（不录入），再正式连线后重新加入（录入操作栈）
      scene.removeChild(edge, false);
      edge.connect(edge.fromPortId, targetPortId);
      scene.addChild(edge, true);
    } else {
      // 未命中端口，删除临时 EdgeView（不录入）
      scene.removeChild(edge, false);
    }
    this.ctx.setTempEdge(null);
  }

  private handleMove(
    e: MouseEvent,
    scene: Scene,
    point: Point3,
    mouseDownPoint: Point3,
  ): void {
    const moveVector = point.subtract(
      this.ctx.getLastPoint() || mouseDownPoint,
    );
    const indicateView = this.ctx.getIndicateView();
    if (!indicateView) return;

    if (!indicateView.actived) {
      scene.select(indicateView, e.ctrlKey || e.metaKey);
    }

    // 先移动
    for (const activeView of scene.getAllActived()) {
      activeView.translate(moveVector.x, moveVector.y, 0);
    }

    // 再吸附（X/Y 轴独立）
    const result = scene.snapAlign.snap(indicateView);
    if (result.offsetX !== 0 || result.offsetY !== 0) {
      for (const activeView of scene.getAllActived()) {
        activeView.translate(result.offsetX, result.offsetY, 0);
      }
    }
  }

  private handleTextSelection(scene: Scene, point: Point3): void {
    const indicateView = this.ctx.getIndicateView();
    const indicateContent = this.ctx.getIndicateContent();
    if (
      isTextView(indicateView) &&
      (isPrintableTextElement(indicateContent) ||
        isNonPrintableTextElement(indicateContent))
    ) {
      // 首次进入（未激活）：选中 View 并设置光标起点
      if (!indicateView.actived) {
        scene.select(indicateView as unknown as View);
        const fixedIndex = indicateView.element2Index(indicateContent, point);
        indicateView.setSelection(fixedIndex, fixedIndex);
        return;
      }

      // 拖拽选区阶段：尝试命中文本域
      const { content } = indicateView.interact(point);

      let targetContent = content;
      let targetPoint = point;

      // 鼠标拖出文本域时，约束坐标到文本域边界再求 index
      if (
        !isPrintableTextElement(content) &&
        !isNonPrintableTextElement(content)
      ) {
        const relativePoint = indicateView
          .getMVPMatrix()
          .inverse()
          .multiply(point);
        const constrainedRelative = indicateView.constraintPoint(relativePoint);
        targetPoint = indicateView.getMVPMatrix().multiply(constrainedRelative);
        const result = indicateView.interact(targetPoint);
        targetContent = result.content;
      }

      if (
        isPrintableTextElement(targetContent) ||
        isNonPrintableTextElement(targetContent)
      ) {
        const dynamicIndex = indicateView.element2Index(
          targetContent,
          targetPoint,
        );
        indicateView.setSelection(
          indicateView.selection.fixedIndex,
          dynamicIndex,
        );
      }
    }
  }

  private handleEditPoint(point: Point3, mouseDownPoint: Point3): void {
    this.ctx.setCursor(Cursor.Grabbing);
    const extraData = this.ctx.getExtraData();
    if (extraData && extraData.action === Action.EDIT_POINT) {
      const delta = point.subtract(this.ctx.getLastPoint() || mouseDownPoint);
      this.ctx.getIndicateView()?.editPoint(point, delta);
    }
  }

  private handleResize(
    e: MouseEvent,
    scene: Scene,
    point: Point3,
    mouseDownPoint: Point3,
  ): void {
    this.ctx.setCursor(Cursor.Grabbing);
    const extraData = this.ctx.getExtraData();
    if (extraData && extraData.action === Action.RESIZE) {
      const vector = point.subtract(this.ctx.getLastPoint() || mouseDownPoint);
      const { resizeFixedIndex, resizeDynamicIndex } = extraData;
      scene.getAllActived().forEach((view) => {
        const fixedPoint =
          view.boundingBox?.handles[resizeFixedIndex].getCenter();
        const dynamicPoint =
          view.boundingBox?.handles[resizeDynamicIndex].getCenter();
        if (!fixedPoint || !dynamicPoint)
          throw new Error("固定点或活动点不存在");
        console.log(e.ctrlKey);

        view.resize(fixedPoint, dynamicPoint, vector, e.ctrlKey);
      });
    }
  }

  private handleRotate(scene: Scene, point: Point3): void {
    this.ctx.setCursor(Cursor.Grabbing);
    const indicateView = this.ctx.getIndicateView();
    const bounds = indicateView?.viewport;
    const lastPoint = this.ctx.getLastPoint();

    if (bounds && lastPoint && indicateView) {
      const center = Rectangle.fromBounds(bounds).getCenter();
      const inverseMatrix = indicateView.getWorldMatrix().inverse();
      const lastVector = inverseMatrix.multiply(lastPoint).subtract(center);
      const currentVector = inverseMatrix.multiply(point).subtract(center);
      const dot =
        currentVector.dot(lastVector) /
        (currentVector.length * lastVector.length);
      const clampedDot = Math.max(-1, Math.min(1, dot));
      const sign = Math.sign(currentVector.cross(lastVector).z);
      const angle = Math.acos(clampedDot) * sign;
      scene.getAllActived().forEach((view) => view.rotate(0, 0, angle, center));
    }
  }

  private handleBoxSelect(
    scene: Scene,
    point: Point3,
    mouseDownPoint: Point3,
  ): void {
    this.ctx.setCursor(Cursor.Crosshair);
    const selectionRectView = this.ctx.getSelectionRectView();
    if (selectionRectView && mouseDownPoint) {
      selectionRectView.updateSelect(mouseDownPoint, point);
      const selectionRect = selectionRectView.content as Rectangle;
      const viewsToActivate: View[] = [];
      const allViews = scene.children;
      // 遍历所有视图，判断是否被框选命中（跳过 SelectBoxView 自身）
      for (const view of allViews) {
        if (isSelectBoxView(view)) continue;
        const worldMatrix = view.getWorldMatrix();

        const content = view.content;
        if (content && content.bounds) {
          // 有 content：判断框选矩形与 content 相交或包含 content
          const contentRect = Rectangle.fromBounds(content.bounds);
          const transformedContent = contentRect.transform(
            worldMatrix,
          ) as Graph;

          // 相交判断
          if (selectionRect.intersect(transformedContent).length > 0) {
            viewsToActivate.push(view);
            continue;
          }

          // 包含判断：框选矩形包含 content 中心点
          const cBounds = transformedContent.bounds;
          const contentCenter = new Point3(
            cBounds.x + cBounds.width / 2,
            cBounds.y + cBounds.height / 2,
            0,
          );
          if (selectionRect.containsPoint(contentCenter)) {
            viewsToActivate.push(view);
          }
        } else {
          // 无 content 的纯容器：fallback 到 viewport 判断
          const viewport = view.viewport ?? Bounds.empty();
          const viewportRect = Rectangle.fromBounds(viewport);
          const transformedViewport = viewportRect.transform(
            worldMatrix,
          ) as Graph;

          // 相交判断
          if (selectionRect.intersect(transformedViewport).length > 0) {
            viewsToActivate.push(view);
            continue;
          }

          // 包含判断：框选矩形包含 viewport 中心点
          const vBounds = transformedViewport.bounds;
          const viewportCenter = new Point3(
            vBounds.x + vBounds.width / 2,
            vBounds.y + vBounds.height / 2,
            0,
          );
          if (selectionRect.containsPoint(viewportCenter)) {
            viewsToActivate.push(view);
          }
        }
      }
      clearAllStates(scene);
      for (const view of viewsToActivate) {
        scene.select(view, true);
      }
    }
  }
}
