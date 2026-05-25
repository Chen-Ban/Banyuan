import {
  View,
  SelectBoxView,
  Point3,
  Action,
  Cursor,
  GraphType,
  isTextView,
  isSelectBoxView,
  isGraphType,
  isPortView,
  Rectangle,
  Graph,
  Bounds,
  clearAllStates,
  createView,
} from "@banyuan/banvasgl";
import type {
  Scene,
  ExtraData,
  IViewAddon,
  IGraph,
  IEdgeView,
} from "@banyuan/banvasgl";

export interface InteractionContext {
  getIndicateView(): View | null;
  getIndicateContent(): IGraph | IViewAddon | null;
  getLastPoint(): Point3 | null;
  getExtraData(): ExtraData | null;
  getSelectionRectView(): SelectBoxView | null;
  setCursor(cursor: Cursor): void;
  selectView(scene: Scene, view: View, multiple: boolean): void;
  clearSelection(scene: Scene): void;
  getTempEdge(): IEdgeView | null;
  setTempEdge(edge: IEdgeView | null): void;
  getBufferCtx(): CanvasRenderingContext2D;
}

export class InteractionDispatcher {
  constructor(private ctx: InteractionContext) {}

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
        return this.handleBoxSelect(scene, point);
      case Action.CONNECT:
        return this.handleConnect(scene, point);
      case Action.EDIT_VIEWPORT:
      case Action.NONE:
      default:
        return;
    }
  }

  private handleConnect(scene: Scene, point: Point3): void {
    this.ctx.setCursor(Cursor.Crosshair);
    const extraData = this.ctx.getExtraData();
    if (!extraData || extraData.action !== Action.CONNECT) return;

    let edge = this.ctx.getTempEdge();
    if (!edge) {
      edge = createView<IEdgeView>("EDGEVIEW", {
        fromPortId: extraData.portViewId,
      });
      if (!edge) return;
      scene.addChild(edge as unknown as View, false);
      this.ctx.setTempEdge(edge);
    }
    edge.setTempTarget(point);
  }

  finishConnect(
    scene: Scene,
    point: Point3,
    bufferCtx?: CanvasRenderingContext2D,
  ): void {
    const edge = this.ctx.getTempEdge();
    if (!edge) return;

    const ctx = bufferCtx ?? this.ctx.getBufferCtx();
    let targetPortId: string | null = null;
    for (const view of scene.children) {
      const { view: hit } = view.interact(point, ctx);
      if (hit && isPortView(hit) && hit.id !== edge.fromPortId) {
        targetPortId = hit.id;
        break;
      }
    }

    const edgeAsView = edge as unknown as View;
    if (targetPortId && edge.fromPortId) {
      scene.removeChild(edgeAsView, false);
      edge.connect(edge.fromPortId, targetPortId);
      scene.addChild(edgeAsView, true);
    } else {
      scene.removeChild(edgeAsView, false);
    }
    this.ctx.setTempEdge(null);
  }

  private handleMove(
    _e: MouseEvent,
    scene: Scene,
    point: Point3,
    mouseDownPoint: Point3,
  ): void {
    const moveVector = point.subtract(
      this.ctx.getLastPoint() || mouseDownPoint,
    );
    const indicateView = this.ctx.getIndicateView();
    if (!indicateView) return;

    for (const activeView of scene.getAllActived()) {
      activeView.translate(moveVector.x, moveVector.y, 0);
    }

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
      indicateContent !== null &&
      (isGraphType(indicateContent as any, GraphType.PRINTABLE_TEXTELEMENT) ||
        isGraphType(indicateContent as any, GraphType.NONPRINTABLE_TEXTELEMENT))
    ) {
      if (!indicateView.actived) {
        scene.select(indicateView as unknown as View);
        const fixedIndex = indicateView.element2Index(
          indicateContent as any,
          point,
        );
        indicateView.setSelection(fixedIndex, fixedIndex);
        return;
      }

      const bufferCtx = this.ctx.getBufferCtx();
      const { content } = indicateView.interact(point, bufferCtx);

      let targetContent = content;
      let targetPoint = point;

      if (
        !isGraphType(content as any, GraphType.PRINTABLE_TEXTELEMENT) &&
        !isGraphType(content as any, GraphType.NONPRINTABLE_TEXTELEMENT)
      ) {
        const relativePoint = indicateView
          .getMVPMatrix()
          .inverse()
          .multiply(point);
        const constrainedRelative = indicateView.constraintPoint(relativePoint);
        targetPoint = indicateView.getMVPMatrix().multiply(constrainedRelative);
        const result = indicateView.interact(targetPoint, bufferCtx);
        targetContent = result.content;
      }

      if (
        isGraphType(targetContent as any, GraphType.PRINTABLE_TEXTELEMENT) ||
        isGraphType(targetContent as any, GraphType.NONPRINTABLE_TEXTELEMENT)
      ) {
        const dynamicIndex = indicateView.element2Index(
          targetContent as any,
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
        if (!view.boundingBox) return;
        const fixedPoint =
          view.boundingBox.handles[resizeFixedIndex].getCenter();
        const dynamicPoint =
          view.boundingBox.handles[resizeDynamicIndex].getCenter();
        if (!fixedPoint || !dynamicPoint) return;
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

  private handleBoxSelect(scene: Scene, point: Point3): void {
    this.ctx.setCursor(Cursor.Crosshair);
    const selectionRectView = this.ctx.getSelectionRectView();
    if (!selectionRectView) return;

    // point 是 canvas 物理像素坐标（世界坐标），与 SelectBoxView.matrix 平移分量同一坐标系
    selectionRectView.updateSelect(point);

    const selectionRect = selectionRectView.content;
    const selectionWorldMatrix = selectionRectView.getWorldMatrix();
    const worldSelectionRect = selectionRect
      .copy()
      .transform(selectionWorldMatrix);

    const viewsToActivate: View[] = [];

    for (const view of scene.children) {
      if (isSelectBoxView(view)) continue;
      const worldMatrix = view.getWorldMatrix();

      if (!view.actived) {
        // 未激活：用内容包围盒检测是否与框选矩形相交
        const contentBounds = view.content?.bounds;
        if (!contentBounds) continue;
        const contentRect = Rectangle.fromBounds(contentBounds);
        const worldContentRect = contentRect.transform(worldMatrix);

        if (worldSelectionRect.intersect(worldContentRect).length > 0) {
          viewsToActivate.push(view);
          continue;
        }
      } else {
        // 已激活：用视口包围盒检测是否与框选矩形相交
        const viewportBounds = view.viewport ?? Bounds.empty();
        const viewportRect = Rectangle.fromBounds(viewportBounds);
        const worldViewportRect = viewportRect.transform(worldMatrix);

        if (worldSelectionRect.intersect(worldViewportRect).length > 0) {
          viewsToActivate.push(view);
          continue;
        }
      }

      // 兜底：框选矩形完全包含视口时（边不相交但视口在框选内）
      const vpBounds = view.viewport ?? Bounds.empty();
      const vpRect = Rectangle.fromBounds(vpBounds);
      const worldVpRect = vpRect.transform(worldMatrix);
      if (worldSelectionRect.containsPoint(worldVpRect.getCentroid())) {
        viewsToActivate.push(view);
      }
    }

    clearAllStates(scene);
    for (const view of viewsToActivate) {
      scene.select(view, true);
    }
  }
}
