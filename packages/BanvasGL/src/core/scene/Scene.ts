import View from "@/core/views/View/View";
import { BaseCamera } from "@/core/camera";
import { LayerManager, TransactionManager } from "./operations";
import { generateId } from "@/core/utils";
import {
  flattenViewTree,
  clearAllStates,
  clearSelectedStates,
  isViewInTree,
} from "./operations";
import { ISerializable } from "@/core/interfaces";
import { SCENETYPE } from "@/core/constants";

export interface SceneOptions {
  camera?: BaseCamera;
  data?: any;
  onLoad?: (params: any) => void;
  onUnload?: () => void;
  onShow?: () => void;
  onHide?: () => void;
}

export default class Scene implements ISerializable {
  // 基本属性
  public readonly type: SCENETYPE = SCENETYPE.SCENE;
  public id: string = "";
  public children: View[] = [];
  public camera: BaseCamera;
  public data: any = {};
  private transactionManager: TransactionManager;
  private layerManager: LayerManager;

  // 私有属性
  private _isLoaded: boolean = false;
  private _isVisible: boolean = false;
  private _loadParams: any = null;

  // 传入的生命周期回调函数
  private _onLoad?: (params: any) => void;
  private _onUnload?: () => void;
  private _onShow?: () => void;
  private _onHide?: () => void;

  constructor(camera: BaseCamera, options: SceneOptions = {}) {
    this.camera = camera;
    this.layerManager = new LayerManager(() => this);
    this.transactionManager = new TransactionManager({
      findViewById: (id: string) => this.findViewById(id),
      removeChild: (child: View) => this.removeChild(child, false),
      insertChildAt: (child: View, index: number) =>
        this.insertChildAt(child, index),
      findContainerById: (id: string) => this.findContainerById(id),
    });

    // 设置选项
    if (options.data) {
      this.data = options.data;
    }

    // 保存生命周期回调函数
    this._onLoad = options.onLoad;
    this._onUnload = options.onUnload;
    this._onShow = options.onShow;
    this._onHide = options.onHide;

    // 生成唯一ID
    this.id = generateId(this.type);
  }

  // 生命周期方法
  public onLoad(params: any): void {
    this._loadParams = params;
    this._isLoaded = true;

    // 执行用户提供的回调函数
    if (this._onLoad) {
      this._onLoad(params);
    }
  }

  public onUnload(): void {
    this._isLoaded = false;
    this._loadParams = null;

    // 清理子视图
    this.clearChildren();
    // 清空操作栈
    this.transactionManager.clear();

    // 执行用户提供的回调函数
    if (this._onUnload) {
      this._onUnload();
    }
  }

  public onShow(): void {
    this._isVisible = true;

    // 执行用户提供的回调函数
    if (this._onShow) {
      this._onShow();
    }
  }

  public onHide(): void {
    this._isVisible = false;

    // 执行用户提供的回调函数
    if (this._onHide) {
      this._onHide();
    }
  }

  public getAllActived() {
    return flattenViewTree(this).filter((v) => v.actived);
  }
  public getSelectedView() {
    return flattenViewTree(this).find((v) => v.selected);
  }

  public select(
    view: View | undefined = undefined,
    multiple: boolean = false,
    deselect: boolean = false,
  ) {
    if (!view) {
      clearAllStates(this);
      return;
    }
    // 查看传入的view是不是在这个列表中
    if (!isViewInTree(this, view)) {
      console.warn("指定的视图不在当前场景中");
      return;
    }

    if (multiple) {
      clearSelectedStates(this, view);
      if (deselect && view.actived === true) {
        view.setActived(false).setSelected(false);
        // 把 selected 转移给剩余 actived 中的最后一个
        const remaining = this.getAllActived();
        if (remaining.length > 0) {
          remaining[remaining.length - 1].setSelected(true);
        }
      } else {
        view.setActived(true).setSelected(true);
      }
    } else {
      const selectedView = this.getSelectedView();
      if (selectedView && selectedView === view) {
        return;
      }
      clearAllStates(this, view);
      view.setActived(true).setSelected(true);
    }
  }

  // 渲染方法
  public render(): void {
    if (!this._isVisible) {
      return;
    }

    // 渲染前将 Camera 的 VP 矩阵广播到所有子 View
    this.broadcastVPMatrix();

    this.children.forEach((view) => {
      view.render();
    });
  }

  /**
   * 将当前 Camera 的 viewProjectionMatrix 广播到所有子 View。
   * 每帧渲染前调用一次，确保渲染和交互时使用的 VP 矩阵一致。
   */
  public broadcastVPMatrix(): void {
    const vpMatrix = this.camera.viewProjectionMatrix;
    this.children.forEach((view) => view.setVPMatrix(vpMatrix));
  }

  // 子视图管理
  public addChild(child: View, record: boolean = true): this {
    if (!this.children.includes(child)) {
      this.children.push(child);
      child.parent = this;
      // 新加入的 View 立即获得当前 Camera 的 VP 矩阵
      child.setVPMatrix(this.camera.viewProjectionMatrix);
      child.onAttach();
      // 自动录入操作栈
      if (record) {
        this.transactionManager.recordAdd(
          this.id,
          child,
          this.children.indexOf(child),
        );
      }
    }
    return this;
  }

  public removeChild(child: View, record: boolean = true): this {
    const index = this.children.indexOf(child);
    if (index > -1) {
      // 录入必须在 splice 之前（需要快照）
      if (record) {
        this.transactionManager.recordRemove(this.id, child, index);
      }
      this.children.splice(index, 1);
      child.parent = null;
    }
    return this;
  }

  public clearChildren(): this {
    for (let i = this.children.length - 1; i >= 0; i--) {
      this.removeChild(this.children[i], false);
    }
    return this;
  }

  /**
   * 在指定位置插入子视图（用于 undo/redo 恢复）
   */
  private insertChildAt(child: View, index: number): void {
    child.parent = this;
    child.setVPMatrix(this.camera.viewProjectionMatrix);
    // 确保 index 不越界
    const safeIndex = Math.min(index, this.children.length);
    this.children.splice(safeIndex, 0, child);
    child.onAttach();
  }

  // 事务管理的便捷代理方法
  public beginTransaction(viewIds: string[]): void {
    this.transactionManager.beginTransaction(viewIds);
  }

  public commitTransaction(): boolean {
    return this.transactionManager.commitTransaction();
  }

  public rollbackTransaction(): void {
    this.transactionManager.rollbackTransaction();
  }

  // 操作栈管理
  public undo(): boolean {
    return this.transactionManager.undo();
  }

  public redo(): boolean {
    return this.transactionManager.redo();
  }

  get canUndo(): boolean {
    return this.transactionManager.canUndo;
  }

  get canRedo(): boolean {
    return this.transactionManager.canRedo;
  }

  // 数据管理
  public setData(data: any): this {
    this.data = data;
    return this;
  }
  // 场景管理
  public load(params: any = {}): this {
    this.onLoad(params);
    return this;
  }
  public unload(): this {
    this.onUnload();
    return this;
  }

  public show(): this {
    this.onShow();
    return this;
  }

  public hide(): this {
    this.onHide();
    return this;
  }

  // 复制场景
  public copy(): Scene {
    const newScene = new Scene(this.camera);

    // 复制基本属性
    newScene.id = generateId(this.type);
    newScene.data = { ...this.data };

    // 复制子视图
    this.children.forEach((child) => {
      newScene.addChild(child.copy(), false);
    });

    return newScene;
  }


  public findViewById(id: string) {
    return flattenViewTree(this).find((view) => view.id === id);
  }

  /**
   * 获取目标 View 在全局深度优先遍历中的层级序号（从 0 开始）。
   * 层级由容器树结构派生，无需额外存储。
   * 找不到时返回 -1。
   */
  public getGlobalLayer(target: View): number {
    let index = 0;
    function dfs(node: { children: View[] }): boolean {
      for (const child of node.children) {
        if (child === target) return true;
        index++;
        if (child.children.length > 0 && dfs(child)) return true;
      }
      return false;
    }
    return dfs(this) ? index : -1;
  }

  // 层级管理代理
  public bringToFront(view: View): this {
    const changes = this.layerManager.bringToFront(view);
    this.transactionManager.recordReorder(changes);
    return this;
  }

  public sendToBack(view: View): this {
    const changes = this.layerManager.sendToBack(view);
    this.transactionManager.recordReorder(changes);
    return this;
  }

  public bringForward(view: View): this {
    const changes = this.layerManager.bringForward(view);
    this.transactionManager.recordReorder(changes);
    return this;
  }

  public sendBackward(view: View): this {
    const changes = this.layerManager.sendBackward(view);
    this.transactionManager.recordReorder(changes);
    return this;
  }

  // ==================== 序列化 ====================

  /**
   * 将 Scene 实例序列化为纯数据对象。
   */
  public toJSON(): any {
    return {
      id: this.id,
      data: this.data,
      camera: {
        $type: (this.camera as any).type,
        $value: {
          position: [
            this.camera.position.x,
            this.camera.position.y,
            this.camera.position.z,
          ],
          target: [
            this.camera.target.x,
            this.camera.target.y,
            this.camera.target.z,
          ],
          up: [this.camera.up.x, this.camera.up.y, this.camera.up.z],
        },
      },
      children: this.children.map((child) => ({
        $type: child.type,
        $value: child.toJSON(),
      })),
    };
  }

  /**
   * 从纯数据对象恢复 Scene 实例。
   * data.camera 和 data.children 应由 Serializer 预先解析为实例后传入。
   */
  /**
   * 通过 id 查找容器节点（可能是 Scene 自身或嵌套的 View）
   * 供 DiffApplier 回放 ReorderDiff 时定位 parent
   */
  private findContainerById(id: string): { children: View[] } | undefined {
    if (id === this.id) return this;
    // 在整棵树中查找
    const view = this.findViewById(id);
    if (view && Array.isArray(view.children)) return view;
    return undefined;
  }

  static fromJSON(data: any): Scene {
    const scene = new Scene(data.camera);
    scene.id = data.id;
    if (data.data) scene.data = data.data;
    if (data.children) {
      data.children.forEach((child: View) => {
        // 层级现在由数组顺序决定，直接按序添加即可
        scene.addChild(child, false);
      });
    }
    return scene;
  }
}
