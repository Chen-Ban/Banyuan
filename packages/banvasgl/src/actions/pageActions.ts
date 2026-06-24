/**
 * Page（Scene）级别操作
 */

import { OrthographicCamera } from "@/engine/camera";
import { Scene } from "@/engine/scene/Scene";
import type { IPageActions } from "@/types/actions/actions";
import type {
  IFieldSchema,
  IFieldSchemaMap,
  EventHandler,
} from "@/types/view/view";
import type { ISceneLifetimes } from "@/types/engine/scene";
import type { App } from "@/engine/App";

export function createPageActions(getApp: () => App | null): IPageActions {
  const notify = () => getApp()?.notify();

  // ── Pan 内部状态（闭包私有） ──
  let _isPanning = false;
  let _panStart: { x: number; y: number } | null = null;
  let _spaceHeld = false;

  return {
    getPageIds(): string[] {
      const app = getApp();
      if (!app) return [];
      return app.scenes.map((s) => s.id);
    },

    getPageViewIds(pageId: string): string[] {
      const app = getApp();
      if (!app) return [];
      const scene = app.getScene(pageId);
      if (!scene) return [];
      return (scene as Scene).children.map((child) => child.id);
    },

    getTopLevelViews() {
      const app = getApp();
      if (!app) return [];
      const scene = app.getCurrentScene();
      if (!scene) return [];
      return [...(scene as Scene).children];
    },

    getPageCount(): number {
      const app = getApp();
      if (!app) return 0;
      return app.scenes.length;
    },

    navigateTo(pageId: string): void {
      const app = getApp();
      if (!app) return;
      const scene = app.getScene(pageId);
      if (scene) {
        app.navigateTo(scene as Scene);
        notify();
      }
    },

    add(name?: string): string | null {
      const app = getApp();
      if (!app) return null;
      // 新建页面使用正交相机，初始视口 800×600（首次 resize 时会被 syncCameraToContainer 覆盖）
      const camera = new OrthographicCamera({
        left: 0,
        right: 800,
        top: 0,
        bottom: 600,
      });
      const scene = new Scene(camera, { name });
      app.addScene(scene);
      app.navigateTo(scene);
      notify();
      return scene.id;
    },

    remove(pageId: string): void {
      const app = getApp();
      if (!app) return;
      const scene = app.getScene(pageId);
      if (scene) {
        app.removeScene(scene);
        notify();
      }
    },

    rename(pageId: string, name: string): void {
      const app = getApp();
      if (!app) return;
      const scene = app.getScene(pageId);
      if (scene) {
        scene.name = name;
        notify();
      }
    },

    reorder(pageId: string, newIndex: number): void {
      const app = getApp();
      if (!app) return;
      const currentIndex = app.scenes.findIndex((s) => s.id === pageId);
      if (currentIndex === -1 || currentIndex === newIndex) return;

      const [scene] = app.scenes.splice(currentIndex, 1);
      const safeIndex = Math.min(newIndex, app.scenes.length);
      app.scenes.splice(safeIndex, 0, scene);
      notify();
    },

    duplicate(pageId: string): string | null {
      const app = getApp();
      if (!app) return null;
      const scene = app.getScene(pageId);
      if (!scene) return null;

      const newScene = scene.copy();
      app.addScene(newScene);
      notify();
      return newScene.id;
    },

    getPageData(pageId: string): IFieldSchemaMap {
      const app = getApp();
      if (!app) return {};
      const scene = app.getScene(pageId);
      return scene ? ({ ...scene.data } as IFieldSchemaMap) : {};
    },

    setPageData(pageId: string, key: string, schema: IFieldSchema): void {
      const app = getApp();
      if (!app) return;
      const scene = app.getScene(pageId);
      if (!scene) return;
      scene.data = { ...scene.data, [key]: schema };
      notify();
    },

    deletePageData(pageId: string, key: string): void {
      const app = getApp();
      if (!app) return;
      const scene = app.getScene(pageId);
      if (!scene) return;
      const next = { ...scene.data } as IFieldSchemaMap;
      delete next[key];
      scene.data = next;
      notify();
    },

    getPageLifetimes(pageId: string): ISceneLifetimes {
      const app = getApp();
      if (!app)
        return { onLoad: null, onUnload: null, onShow: null, onHide: null };
      const scene = app.getScene(pageId);
      if (!scene)
        return { onLoad: null, onUnload: null, onShow: null, onHide: null };
      return { ...scene.lifetimes };
    },

    setPageLifetime(
      pageId: string,
      lifetimeName: keyof ISceneLifetimes,
      handler: EventHandler,
    ): void {
      const app = getApp();
      if (!app) return;
      const scene = app.getScene(pageId);
      if (!scene) return;
      scene.lifetimes = { ...scene.lifetimes, [lifetimeName]: handler };
      notify();
    },

    deletePageLifetime(
      pageId: string,
      lifetimeName: keyof ISceneLifetimes,
    ): void {
      const app = getApp();
      if (!app) return;
      const scene = app.getScene(pageId);
      if (!scene) return;
      scene.lifetimes = { ...scene.lifetimes, [lifetimeName]: null };
      notify();
    },

    // ── 历史/事务操作 ──

    undo(): boolean {
      const scene = getApp()?.getCurrentScene();
      if (!scene) return false;
      const result = scene.undo();
      if (result) notify();
      return result;
    },

    redo(): boolean {
      const scene = getApp()?.getCurrentScene();
      if (!scene) return false;
      const result = scene.redo();
      if (result) notify();
      return result;
    },

    get canUndo(): boolean {
      return getApp()?.getCurrentScene()?.canUndo ?? false;
    },

    get canRedo(): boolean {
      return getApp()?.getCurrentScene()?.canRedo ?? false;
    },

    beginTransaction(viewIds: string[]): void {
      const scene = getApp()?.getCurrentScene();
      if (!scene || viewIds.length === 0) return;
      scene.beginTransaction(viewIds);
    },

    commitTransaction(): void {
      const scene = getApp()?.getCurrentScene();
      if (!scene) return;
      scene.commitTransaction();
    },

    rollbackTransaction(): void {
      const scene = getApp()?.getCurrentScene();
      if (!scene) return;
      scene.rollbackTransaction();
    },

    // ── 视口平移（Pan） ──

    get isPanning(): boolean {
      return _isPanning;
    },

    panStart(clientX: number, clientY: number): boolean {
      if (!_spaceHeld) return false;
      _isPanning = true;
      _panStart = { x: clientX, y: clientY };
      return true;
    },

    panMove(
      clientX: number,
      clientY: number,
    ): boolean {
      if (!_isPanning || !_panStart) return false;
      const app = getApp();
      if (!app || !app.renderer) return false;
      const scene = app.getCurrentScene();
      if (!scene) return false;
      const camera = scene.camera;
      if (!(camera instanceof OrthographicCamera)) return false;

      const dx = clientX - _panStart.x;
      const dy = clientY - _panStart.y;
      _panStart = { x: clientX, y: clientY };

      // 画布逻辑尺寸（canvasWidth 外移：由内部获取，不再从原子事件传入）
      const physicalSize = app.renderer.getSize();
      const dpr = app.renderer.getDPR();
      const canvasClientWidth = physicalSize.width / dpr;
      const canvasClientHeight = physicalSize.height / dpr;

      // 屏幕像素差 → 世界坐标差
      const worldPerPixelX = (camera.right - camera.left) / canvasClientWidth;
      const worldPerPixelY = (camera.bottom - camera.top) / canvasClientHeight;
      camera.pan(-dx * worldPerPixelX, -dy * worldPerPixelY);
      scene.markDirty();
      return true;
    },

    panEnd(): boolean {
      if (!_isPanning) return false;
      _isPanning = false;
      _panStart = null;
      return true;
    },

    setSpaceHeld(held: boolean): void {
      _spaceHeld = held;
      if (!held) {
        // Space 释放时强制结束 pan
        _isPanning = false;
        _panStart = null;
      }
    },

    get isSpaceHeld(): boolean {
      return _spaceHeld;
    },
  };
}
