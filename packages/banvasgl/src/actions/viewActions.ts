/**
 * View 级别操作
 *
 * 提供视图 CRUD、属性编辑、命中检测、物料序列化/实例化等操作。
 * 创建视图统一走 instantiateMaterial() 路径。
 */

import View from "@/view/View/View";
import { clearAllStates, flattenViewTree } from "@/engine/scene/utils";
import { adapterRegistry } from "@/view/property";
import type { IViewActions } from "@/types/hook/hook";
import type {
  IFieldSchema,
  IFieldSchemaMap,
  EventHandler,
  IViewEvents,
  IViewLifetimes,
  IInteractResult,
  ViewTypeMap,
} from "@/types/view/view";
import { Point3, ViewType, Cursor } from "@/foundation";
import type { App } from "@/engine/App";
import {
  screenToWorld as _screenToWorld,
  worldToScreen as _worldToScreen,
} from "@/engine/camera/cameraUtils.js";
import { createMaterialActions as _createMaterialActions } from "@/engine/material/index.js";

/** 内部剪贴板（模块级单例） */
let clipboard: View | null = null;

/** 获取当前剪贴板内容（供 contextMenu 判断是否可粘贴） */
export function getClipboard(): View | null {
  return clipboard;
}

export function createViewActions(getApp: () => App | null): IViewActions {
  const getScene = () => getApp()?.getCurrentScene() ?? null;
  const notify = () => getApp()?.notify();
  const materialActions = _createMaterialActions(getApp);

  return {
    select(viewId: string, multiple?: boolean): void {
      const scene = getScene();
      if (!scene) return;
      const view = scene.findViewById(viewId);
      if (view) {
        scene.select(view, multiple);
        notify();
      }
    },

    deselect(): void {
      const scene = getScene();
      if (!scene) return;
      clearAllStates(scene);
      notify();
    },

    batchActivate(viewIds: Set<string>): void {
      const scene = getScene();
      if (!scene) return;
      scene.batchActivate(viewIds);
      notify();
    },

    selectAll(): void {
      const scene = getScene();
      if (!scene) return;
      const allViews = flattenViewTree(scene);
      allViews.forEach((view) => {
        scene.select(view, true);
      });
      notify();
    },

    scrollTo(viewId: string): void {
      void viewId;
    },

    delete(viewId: string): void {
      const scene = getScene();
      if (!scene) return;
      const view = scene.findViewById(viewId);
      if (view) {
        scene.removeChild(view);
        notify();
      }
    },

    reorder(viewId: string, newIndex: number): void {
      const scene = getScene();
      if (!scene) return;
      const view = scene.findViewById(viewId);
      if (!view || !view.parent) return;

      const parent = view.parent;
      if (
        !parent ||
        !("children" in parent) ||
        !Array.isArray((parent as any).children)
      )
        return;
      // parent 可能是 ISceneNode（Scene）或 ContainerView，两者的 children 运行时均为 View[]
      const siblings = (parent as unknown as { children: View[] }).children;
      const currentIndex = siblings.indexOf(view);
      if (currentIndex === -1 || currentIndex === newIndex) return;

      siblings.splice(currentIndex, 1);
      const safeIndex = Math.min(newIndex, siblings.length);
      siblings.splice(safeIndex, 0, view);
      notify();
    },

    setVisible(viewId: string, visible: boolean): void {
      const scene = getScene();
      if (!scene) return;
      const view = scene.findViewById(viewId);
      if (view) {
        view.visible = visible;
        notify();
      }
    },

    setLocked(viewId: string, locked: boolean): void {
      const scene = getScene();
      if (!scene) return;
      const view = scene.findViewById(viewId);
      if (view) {
        view.freezed = locked;
        notify();
      }
    },

    rename(viewId: string, name: string): void {
      const scene = getScene();
      if (!scene) return;
      const view = scene.findViewById(viewId);
      if (view) {
        view.name = name;
        notify();
      }
    },

    copy(viewId: string): void {
      const scene = getScene();
      if (!scene) return;
      const view = scene.findViewById(viewId);
      if (view) {
        clipboard = view.copy();
      }
    },

    paste(
      target: { viewId: string } | { position: { x: number; y: number } },
    ): string | null {
      const scene = getScene();
      if (!scene || !clipboard) return null;

      const newView = clipboard.copy();

      if ("viewId" in target) {
        const targetView = scene.findViewById(target.viewId);
        if (!targetView) return null;
        newView.matrix = targetView.matrix.copy();
        scene.addChild(newView);
        scene.removeChild(targetView);
      } else {
        newView.translate(target.position.x, target.position.y, 0);
        scene.addChild(newView);
      }

      scene.select(newView);
      notify();
      return newView.id;
    },

    bringToFront(viewId: string): void {
      const scene = getScene();
      if (!scene) return;
      const view = scene.findViewById(viewId);
      if (view) {
        scene.bringToFront(view);
        notify();
      }
    },

    sendToBack(viewId: string): void {
      const scene = getScene();
      if (!scene) return;
      const view = scene.findViewById(viewId);
      if (view) {
        scene.sendToBack(view);
        notify();
      }
    },

    group(viewIds: string[]): string | null {
      const scene = getScene();
      if (!scene) return null;
      const views = viewIds
        .map((id) => scene.findViewById(id))
        .filter((v): v is View => v !== undefined);
      if (views.length < 2) return null;
      const combined = scene.group(views);
      if (combined) {
        notify();
        return combined.id;
      }
      return null;
    },

    ungroup(viewId: string): string[] | null {
      const scene = getScene();
      if (!scene) return null;
      const view = scene.findViewById(viewId);
      if (!view) return null;
      const children = scene.ungroup(view);
      if (children) {
        notify();
        return children.map((c) => c.id);
      }
      return null;
    },

    getViewInstance(viewId: string): View | null {
      const scene = getScene();
      if (!scene) return null;
      return scene.findViewById(viewId) ?? null;
    },

    getViewData(viewId: string): IFieldSchemaMap {
      const scene = getScene();
      if (!scene) return {};
      const view = scene.findViewById(viewId);
      return view ? ({ ...view.data } as IFieldSchemaMap) : {};
    },

    setViewData(viewId: string, key: string, schema: IFieldSchema): void {
      const scene = getScene();
      if (!scene) return;
      const view = scene.findViewById(viewId);
      if (!view) return;
      view.data = { ...view.data, [key]: schema };
      notify();
    },

    deleteViewData(viewId: string, key: string): void {
      const scene = getScene();
      if (!scene) return;
      const view = scene.findViewById(viewId);
      if (!view) return;
      const next = { ...view.data } as IFieldSchemaMap;
      delete next[key];
      view.data = next;
      notify();
    },

    getViewEvents(viewId: string): IViewEvents {
      const scene = getScene();
      const empty: IViewEvents = {
        onClick: null,
        onDoubleClick: null,
        onContextMenu: null,
        onMouseEnter: null,
        onMouseLeave: null,
        onMouseMove: null,
        onMouseDown: null,
        onMouseUp: null,
        onDragStart: null,
        onDrag: null,
        onDragEnd: null,
        onFocus: null,
        onBlur: null,
      };
      if (!scene) return empty;
      const view = scene.findViewById(viewId);
      return view ? { ...view.events } : empty;
    },

    setViewEvent(
      viewId: string,
      eventName: keyof IViewEvents,
      handler: EventHandler,
    ): void {
      const scene = getScene();
      if (!scene) return;
      const view = scene.findViewById(viewId);
      if (!view) return;
      view.events = { ...view.events, [eventName]: handler };
      notify();
    },

    deleteViewEvent(viewId: string, eventName: keyof IViewEvents): void {
      const scene = getScene();
      if (!scene) return;
      const view = scene.findViewById(viewId);
      if (!view) return;
      view.events = { ...view.events, [eventName]: null };
      notify();
    },

    getViewLifetimes(viewId: string): IViewLifetimes {
      const scene = getScene();
      if (!scene) return { onCreated: null, onAttach: null, onDestroy: null };
      const view = scene.findViewById(viewId);
      return view
        ? { ...view.lifetimes }
        : { onCreated: null, onAttach: null, onDestroy: null };
    },

    setViewLifetime(
      viewId: string,
      lifetimeName: keyof IViewLifetimes,
      handler: EventHandler,
    ): void {
      const scene = getScene();
      if (!scene) return;
      const view = scene.findViewById(viewId);
      if (!view) return;
      view.lifetimes = { ...view.lifetimes, [lifetimeName]: handler };
      notify();
    },

    deleteViewLifetime(
      viewId: string,
      lifetimeName: keyof IViewLifetimes,
    ): void {
      const scene = getScene();
      if (!scene) return;
      const view = scene.findViewById(viewId);
      if (!view) return;
      view.lifetimes = { ...view.lifetimes, [lifetimeName]: null };
      notify();
    },

    getProperty(viewId: string, prop: string): number | undefined {
      const scene = getScene();
      if (!scene) return undefined;
      const view = scene.findViewById(viewId);
      if (!view) return undefined;
      return adapterRegistry.get(view, prop);
    },

    getActivedViewIds(): string[] {
      const scene = getScene();
      if (!scene) return [];
      return scene.getAllActived().map((v) => v.id);
    },

    setProperty(prop: string, value: number): void {
      const scene = getScene();
      if (!scene) return;
      const selectedView = scene.getSelectedView();
      if (!selectedView) return;

      const oldValue = adapterRegistry.get(selectedView, prop);
      const category = adapterRegistry.getCategory(prop);

      adapterRegistry.set(selectedView, prop, value);

      const activedViews = scene.getAllActived();
      for (const view of activedViews) {
        if (view.id === selectedView.id) continue;
        const currentVal = adapterRegistry.get(view, prop);
        if (category === "size") {
          const ratio = oldValue !== 0 ? value / oldValue : 1;
          adapterRegistry.set(view, prop, currentVal * ratio);
        } else {
          const delta = value - oldValue;
          adapterRegistry.set(view, prop, currentVal + delta);
        }
      }

      notify();
    },

    setProperties(props: Record<string, number>): void {
      const scene = getScene();
      if (!scene) return;
      const selectedView = scene.getSelectedView();
      if (!selectedView) return;

      const activedViews = scene.getAllActived();

      for (const [prop, value] of Object.entries(props)) {
        const oldValue = adapterRegistry.get(selectedView, prop);
        const category = adapterRegistry.getCategory(prop);

        adapterRegistry.set(selectedView, prop, value);

        for (const view of activedViews) {
          if (view.id === selectedView.id) continue;
          const currentVal = adapterRegistry.get(view, prop);
          if (category === "size") {
            const ratio = oldValue !== 0 ? value / oldValue : 1;
            adapterRegistry.set(view, prop, currentVal * ratio);
          } else {
            const delta = value - oldValue;
            adapterRegistry.set(view, prop, currentVal + delta);
          }
        }
      }

      notify();
    },

    setContentMethod(method: string, args: any[]): void {
      const scene = getScene();
      if (!scene) return;
      const selectedView = scene.getSelectedView();
      if (!selectedView) return;

      const content = selectedView.content;
      if (!content || typeof (content as any)[method] !== "function") return;
      (content as any)[method](...args);
      notify();
    },

    setViewStyle(viewId: string, prop: string, value: unknown): void {
      const scene = getScene();
      if (!scene) return;
      const view = scene.findViewById(viewId);
      if (!view) return;
      if (!view.style) {
        (view as any).style = {};
      }
      (view.style as any)[prop] = value;
      notify();
    },

    beginPropertyEdit(): void {
      const scene = getScene();
      if (!scene) return;
      const activedIds = scene.getAllActived().map((v) => v.id);
      if (activedIds.length === 0) return;
      scene.beginTransaction(activedIds);
    },

    commitPropertyEdit(): void {
      const scene = getScene();
      if (!scene) return;
      scene.commitTransaction();
    },

    rollbackPropertyEdit(): void {
      const scene = getScene();
      if (!scene) return;
      scene.rollbackTransaction();
    },

    triggerEvent(viewId: string, eventKey: keyof IViewEvents, eventArgs: unknown[] = []): void {
      const scene = getScene();
      if (!scene) return;
      const view = scene.findViewById(viewId);
      if (!view) return;
      const schema = view.events[eventKey];
      scene.triggerSchema(view, schema, eventArgs);
    },

    hitTest(point: Point3): IInteractResult {
      const app = getApp();
      const scene = getScene();
      const empty: IInteractResult = {
        view: null,
        content: null,
        extraData: null,
      };
      if (!app || !scene) return empty;

      const bufferCtx = app.renderer.getCanvasContext().getBufferContext();
      let result: IInteractResult = empty;
      for (const view of scene.children) {
        const hit = view.interact(point, bufferCtx);
        if (hit.view && hit.content && hit.extraData) {
          result = hit;
        }
      }
      return result;
    },

    hitTestAll(point: Point3): IInteractResult[] {
      const app = getApp();
      const scene = getScene();
      if (!app || !scene) return [];

      const bufferCtx = app.renderer.getCanvasContext().getBufferContext();
      const results: IInteractResult[] = [];
      for (const view of scene.children) {
        const hit = view.interact(point, bufferCtx);
        if (hit.view && hit.content && hit.extraData) {
          results.push(hit);
        }
      }
      return results;
    },

    // ── 交互层底层支持 ──

    hitTestDetailed(point: Point3): IInteractResult & { cursor: Cursor } {
      const app = getApp();
      const scene = getScene();
      const empty: IInteractResult & { cursor: Cursor } = {
        view: null,
        content: null,
        extraData: null,
        cursor: Cursor.Default,
      };
      if (!app || !scene) return empty;

      const bufferCtx = app.renderer.getCanvasContext().getBufferContext();
      let result: IInteractResult & { cursor: Cursor } = empty;
      for (const view of scene.children) {
        const hit = view.interact(point, bufferCtx);
        if (hit.view && hit.content && hit.extraData) {
          result = { ...hit, cursor: hit.extraData.cursorStyle };
        }
      }
      return result;
    },

    getBufferContext(): CanvasRenderingContext2D | null {
      const app = getApp();
      if (!app) return null;
      return app.renderer.getCanvasContext().getBufferContext();
    },

    addTempChild(view: View): void {
      const scene = getScene();
      if (!scene) return;
      scene.addChild(view, false);
    },

    removeTempChild(view: View): void {
      const scene = getScene();
      if (!scene) return;
      scene.removeChild(view, false);
    },

    getAllActivedViews(): View[] {
      const scene = getScene();
      if (!scene) return [];
      return scene.getAllActived();
    },

    getSelectedView<T extends keyof ViewTypeMap>(
      viewType?: T,
    ): (T extends undefined ? View : ViewTypeMap[T]) | null {
      const scene = getScene();
      if (!scene) return null;
      const view = scene.getSelectedView() ?? null;
      if (!view) return null;
      if (viewType !== undefined && view.type !== viewType) return null;
      return view as any;
    },

    flattenViewTree(): View[] {
      const scene = getScene();
      if (!scene) return [];
      return flattenViewTree(scene);
    },

    translateActived(dx: number, dy: number): void {
      const scene = getScene();
      if (!scene) return;
      for (const view of scene.getAllActived()) {
        view.translate(dx, dy, 0);
      }
    },

    snapAlignBegin(): void {
      const scene = getScene();
      if (!scene) return;
      scene.snapAlign.begin(scene, scene.getAllActived());
    },

    snapAlignSnap(viewId: string): { offsetX: number; offsetY: number } {
      const scene = getScene();
      if (!scene) return { offsetX: 0, offsetY: 0 };
      const view = scene.findViewById(viewId);
      if (!view) return { offsetX: 0, offsetY: 0 };
      return scene.snapAlign.snap(view);
    },

    snapAlignEnd(): void {
      const scene = getScene();
      if (!scene) return;
      scene.snapAlign.end();
    },

    // ── 坐标转换 ──

    screenToWorld(e: MouseEvent): Point3 {
      const app = getApp();
      if (!app) return new Point3(0, 0, 0);
      const scene = app.getCurrentScene();
      if (!scene) return new Point3(0, 0, 0);
      const canvas = app.renderer.getCanvas();
      return _screenToWorld(e.clientX, e.clientY, scene, canvas);
    },

    worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
      const app = getApp();
      if (!app) return { x: 0, y: 0 };
      const scene = app.getCurrentScene();
      if (!scene) return { x: 0, y: 0 };
      const canvas = app.renderer.getCanvas();
      return _worldToScreen(worldX, worldY, scene, canvas);
    },

    // ── 物料操作（从 materialActions 合并） ──

    serializeMaterial: materialActions.serialize,
    instantiateMaterial: materialActions.instantiate,
  };
}
