import View from "@/core/views/View/View";
import { BaseCamera } from "@/core/camera";
import { LayerManager, TransactionManager } from "./operations";
import { generateId, generateName } from "@/core/utils";
import {
  flattenViewTree,
  clearAllStates,
  clearSelectedStates,
  isViewInTree,
  groupViews,
  ungroupView,
} from "./operations";
import { ISerializable, isCombinedView, type ISceneLifetimes } from "@/core/interfaces";
import Animation from "@/core/animation/Animation";
import { SCENETYPE } from "@/core/constants";
import { SnapAlignManager } from "@/core/snapAlign";
import Serializer from "@/core/serializer";
import CombinedView from "@/core/views/CombinedViews";

export interface SceneOptions {
  name?: string;
  camera?: BaseCamera;
  data?: any;
  lifetimes?: Partial<ISceneLifetimes>;
}

export default class Scene implements ISerializable {
  // 基本属性
  public readonly type: SCENETYPE = SCENETYPE.SCENE;
  public id: string = "";
  public name: string = "";
  public children: View[] = [];
  public camera: BaseCamera;
  public data: any = {};
  public readonly snapAlign = new SnapAlignManager();
  private transactionManager: TransactionManager;
  private layerManager: LayerManager;

  // 私有属性
  private _isVisible: boolean = false;

  /**
   * 反向引用持有本 Scene 的 App 实例
   *
   * 由 App.addScene 注入，供 FlowRunner 执行 navigate 节点和 markDirty 使用。
   * 使用 any 避免循环依赖（Scene → App → Scene）。
   */
  public _app: any = null;

  // 用户自定义生命周期回调
  public lifetimes: ISceneLifetimes;

  /**
   * 运行时动画注册表
   *
   * key 格式：`${viewId}:${animationId}`
   * value：Animation 实例（尚未播放，每次 playAnimation 时重新 play）
   *
   * 与 View.data / View.events 等设计时 schema 不同，
   * Animation 实例是纯运行时对象，不可序列化，因此统一托管在 Scene 而非 View 上。
   * 由外部（用户代码或引擎初始化逻辑）调用 registerAnimation 写入，
   * 由 FlowRunner 的 animate 节点通过 playAnimation 触发。
   */
  private _animationRegistry: Map<string, Animation> = new Map();

  constructor(camera: BaseCamera, options: SceneOptions = {}) {
    this.camera = camera;
    this.layerManager = new LayerManager(() => this);
    this.transactionManager = new TransactionManager(
      {
        findViewById: (id: string) => this.findViewById(id),
        removeChild: (child: View) => this.removeChild(child, false),
        insertChildAt: (child: View, index: number) =>
          this.insertChildAt(child, index),
        findContainerById: (id: string) => this.findContainerById(id),
      },
      // 工厂函数：延迟到 undo/redo 执行时才取 Serializer，确保其已初始化
      () => Serializer.getInstance()
    );

    // 设置选项
    if (options.data) {
      this.data = options.data;
    }

    // 初始化生命周期回调
    this.lifetimes = {
      onLoad: options.lifetimes?.onLoad ?? null,
      onUnload: options.lifetimes?.onUnload ?? null,
      onShow: options.lifetimes?.onShow ?? null,
      onHide: options.lifetimes?.onHide ?? null,
    };

    // 生成唯一ID
    this.id = generateId(this.type);
    this.name = options.name || generateName(this.type);
  }

  // 生命周期方法
  public onLoad(params: any): void {
    // TODO: 接入 FlowRunner，将 this.lifetimes.onLoad 编译执行（params 作为 eventArg 传入）
  }

  public onUnload(): void {
    // 清理子视图
    this.clearChildren();
    // 清空操作栈
    this.transactionManager.clear();

    // TODO: 接入 FlowRunner，将 this.lifetimes.onUnload 编译执行
  }

  public onShow(): void {
    this._isVisible = true;

    // TODO: 接入 FlowRunner，将 this.lifetimes.onShow 编译执行
  }

  public onHide(): void {
    this._isVisible = false;

    // TODO: 接入 FlowRunner，将 this.lifetimes.onHide 编译执行
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

  // ── 运行时动画注册表 ──

  /**
   * 注册一个预定义动画，供 FlowSchema 的 animate 节点按 id 触发
   *
   * 同一 viewId + animationId 组合重复注册时覆盖旧值。
   *
   * @param viewId      目标 View 的 id
   * @param animationId 动画唯一标识（在同一 View 内不可重复）
   * @param animation   Animation 实例（尚未播放）
   */
  public registerAnimation(viewId: string, animationId: string, animation: Animation): void {
    this._animationRegistry.set(`${viewId}:${animationId}`, animation);
  }

  /**
   * 按 viewId + animationId 播放已注册的预定义动画
   *
   * 每次调用都从头播放（cancel 当前进度后重新 play）。
   *
   * @param viewId      目标 View 的 id（FlowRunner 传入时 'self' 已由调用方展开为实际 id）
   * @param animationId registerAnimation 时使用的 animationId
   * @returns           找到并播放返回 true，view 或 animation 不存在返回 false
   */
  public playAnimation(viewId: string, animationId: string): boolean {
    const anim = this._animationRegistry.get(`${viewId}:${animationId}`);
    if (!anim) {
      console.warn(`[Scene] playAnimation: 找不到动画 "${viewId}:${animationId}"`);
      return false;
    }
    const view = this.findViewById(viewId);
    if (!view) {
      console.warn(`[Scene] playAnimation: 找不到 View "${viewId}"`);
      return false;
    }
    if (anim.isActive) {
      anim.cancel();
    }
    view.animate(anim);
    return true;
  }

  /**
   * 标记某个 View 的状态已变更，需要重绘
   *
   * 运行时（FlowRunner）在 setData / setVisible 等节点执行后调用。
   * App 已有 60fps 循环渲染，此处直接触发一次即时渲染确保变更立即可见，
   * 无需等待下一帧。
   *
   * @param _view 发生变更的 View（保留参数，未来可做局部重绘优化）
   */
  public markDirty(_view?: View): void {
    this._app?.render()
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

  // ==================== 组合/取消组合 ====================

  /**
   * 将多个 View 组合为一个 CombinedView。
   * 组合后的 CombinedView 插入到原最高层级 View 的位置。
   */
  public group(views: View[]): View | null {
    const combined = new CombinedView({});
    const result = groupViews(views, combined, this.camera.viewProjectionMatrix);
    if (!result) return null;

    // 录入操作栈
    this.transactionManager.recordAdd(this.id, result.combined, result.insertIndex);
    return result.combined;
  }

  /**
   * 取消组合：将 CombinedView 解散，其子 View 回到 Scene 的 children 中。
   * 子 View 插入到 CombinedView 原来的位置。
   */
  public ungroup(view: View): View[] | null {
    if (!isCombinedView(view)) return null;

    const result = ungroupView(view, this.camera.viewProjectionMatrix);
    if (!result) return null;

    // 录入操作栈
    this.transactionManager.recordRemove(this.id, view, result.index);
    return result.children;
  }

  // ==================== 序列化 ====================

  /**
   * 将 Scene 实例序列化为纯数据对象。
   */
  public toJSON(): any {
    return {
      id: this.id,
      data: this.data,
      lifetimes: this.lifetimes,
      camera: {
        $type: (this.camera as any).type,
        $value: (this.camera as any).toJSON(),
      },
      children: this.children.map((child) => ({
        $type: child.type,
        $value: child.toJSON(),
      })),
    };
  }

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

  /**
   * 从纯数据对象恢复 Scene 实例。
   * data.camera 和 data.children 应由 Serializer 预先解析为实例后传入。
   */
  static fromJSON(data: any): Scene {
    // data.camera 已经由递归反序列化恢复为 BaseCamera 实例
    const scene = new Scene(data.camera, {
      lifetimes: data.lifetimes ?? undefined,
    });
    scene.id = data.id;
    if (data.data) scene.data = data.data;
    if (data.children) {
      data.children.forEach((child: View) => {
        scene.addChild(child, false);
      });
    }
    return scene;
  }
}
