import View from "../views/View/View";
import { BaseCamera } from "../camera";
import { OperationStack, Operation, LayerManager } from "./utils";
import Matrix4 from "../math/Matrix4";
import { v4 as uuidv4 } from "uuid";
import { CombinedView } from "../views";
import { ViewTreeUtils } from "../utils/ViewTreeUtils";
import { tree2List } from "@/utils/utils";

export type Scene = {
  id: string
  children: View[]
  camera: BaseCamera;
  data: any
  operationStack: OperationStack;
}

export function isScene(obj: any): obj is Scene {
  return obj instanceof _Scene;
}

export interface SceneOptions {
  camera?: BaseCamera;
  data?: any;
  onLoad?: (params: any) => void;
  onUnload?: () => void;
  onShow?: () => void;
  onHide?: () => void;
}

export default class _Scene {
  // 基本属性
  public id: string = "";
  public children: View[] = [];
  public camera: BaseCamera;
  public data: any = {};
  public operationStack: OperationStack;

  // 私有属性
  private _isLoaded: boolean = false;
  private _isVisible: boolean = false;
  private _loadParams: any = null;
  private _selectedHistory: View[] = [];

  // 传入的生命周期回调函数
  private _onLoad?: (params: any) => void;
  private _onUnload?: () => void;
  private _onShow?: () => void;
  private _onHide?: () => void;

  constructor(camera: BaseCamera, options: SceneOptions = {}) {
    this.camera = camera;
    this.operationStack = new OperationStack(this.applyOperation.bind(this));

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
    this.id = this.generateId();
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
    this.operationStack.clear();

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
    return tree2List(this.children).filter((v) => v.actived);
  }
  public getSelectedView() {
    return tree2List(this.children).filter((v) => v.selected);
  }

  public select(view: View | undefined = undefined, multiple: boolean = false, deselect: boolean = false) {
    if (!view) {
      ViewTreeUtils.clearAllStates(this);
      return;
    }
    // 查看传入的view是不是在这个列表中
    if (!ViewTreeUtils.isViewInTree(this, view)) {
      console.warn("指定的视图不在当前场景中");
      return;
    }

    if (multiple) {
      ViewTreeUtils.clearSelectedStates(this, view);
      if (deselect && view.actived === true) {
        view.setActived(false).setSelected(false);
        this._selectedHistory.pop();
        if (this._selectedHistory.length > 0) {
          this._selectedHistory[this._selectedHistory.length - 1].setSelected(true);
        }
      } else {
        view.setActived(true).setSelected(true);
        this._selectedHistory.push(view);
      }
    } else {
      const selectedViews = this.getSelectedView();
      if (selectedViews.length === 1 && selectedViews[0] === view) {
        return;
      }
      ViewTreeUtils.clearAllStates(this, view);
      view.setActived(true).setSelected(true);
    }
  }

  // 渲染方法
  public render(): void {
    if (!this._isVisible) {
      return;
    }

    this.children.forEach((view) => {
      view.render();
    });
  }

  // 子视图管理
  public addChild(child: View): Scene {
    if (!this.children.includes(child)) {
      // 设置子视图的层级
      this.setChildLayer(child);
      this.children.push(child);
      child.parent = this;
      child.onAttach();
    }
    return this;
  }

  public removeChild(child: View): Scene {
    const index = this.children.indexOf(child);
    if (index > -1) {
      this.children.splice(index, 1);
      child.parent = null;
    }
    return this;
  }

  public clearChildren(): Scene {
    this.children.forEach((child) => {
      child.parent = null;
    });
    this.children = [];
    return this;
  }

  private applyOperation(operation: Operation): void {
    //将operation应用到scene上
    for (let diff of operation.diffs) {
    }
  }

  // 操作栈管理
  public recordOperation(operation: Operation): boolean {
    return this.operationStack.do(operation);
  }

  public undo(): boolean {
    return this.operationStack.undo();
  }

  public redo(): boolean {
    return this.operationStack.redo();
  }
  // 数据管理
  public setData(data: any): Scene {
    this.data = data;
    return this;
  }
  // 场景管理
  public load(params: any = {}): Scene {
    this.onLoad(params);
    return this;
  }
  public unload(): Scene {
    this.onUnload();
    return this;
  }

  public show(): Scene {
    this.onShow();
    return this;
  }

  public hide(): Scene {
    this.onHide();
    return this;
  }

  // 复制场景
  public copy(): Scene {
    const newScene = new _Scene(this.camera);

    // 复制基本属性
    newScene.id = this.generateId();
    newScene.data = { ...this.data };

    // 复制子视图
    this.children.forEach((child) => {
      newScene.addChild(child.copy());
    });

    return newScene;
  }

  // 生成唯一ID
  private generateId(): string {
    return uuidv4();
  }

  // 层级管理方法
  /**
   * 设置子视图的层级（在添加时自动调用）
   */
  private setChildLayer(child: View): void {
    if (this.children.length === 0) {
      // 第一个子视图，层级设为0
      child.layer = 0;
    } else {
      // 获取当前最大层级
      const maxLayer = Math.max(...this.children.map((c) => c.layer));
      // 新子视图的层级设为最大层级+1
      child.layer = maxLayer + 1;
    }
  }

  /**
   * 按层级顺序获取子视图（层级低的先返回）
   */
  public getChildrenSortedByLayer(): View[] {
    return [...this.children].sort((a, b) => a.layer - b.layer);
  }

  /**
   * 将视图移到最前面（置顶）
   */
  public bringToFront(view: View): Scene {
    LayerManager.bringToFront(this.children, view);
    return this;
  }

  /**
   * 将视图移到最后面（置底）
   */
  public sendToBack(view: View): Scene {
    LayerManager.sendToBack(this.children, view);
    return this;
  }

  /**
   * 将视图上移一层
   */
  public bringForward(view: View): Scene {
    LayerManager.bringForward(this.children, view);
    return this;
  }

  /**
   * 将视图下移一层
   */
  public sendBackward(view: View): Scene {
    LayerManager.sendBackward(this.children, view);
    return this;
  }

  /**
   * 设置视图到指定层级
   */
  public setLayer(view: View, layer: number): Scene {
    LayerManager.setLayer(this.children, view, layer);
    return this;
  }

  /**
   * 合并多个视图
   * 计算合并后view的matrix，并调整原view的matrix
   */
  public static mergeViews(views: View[]): CombinedView {
    if (views.length === 0) {
      return new CombinedView([]);
    }

    if (views.length === 1) {
      const singleView = views[0];
      const combinedView = new CombinedView([singleView]);
      // 直接使用单个view的matrix
      combinedView.setTransform(singleView.matrix.copy());
      // 将单个view的matrix重置为单位矩阵，因为变换已经应用到CombinedView
      singleView.setTransform(Matrix4.identity());
      return combinedView;
    }

    // 计算所有view的边界框
    let minX = Infinity,
      minY = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity;

    views.forEach((view) => {
      const bounds = view.getContentBounds();
      if (bounds) {
        minX = Math.min(minX, bounds.x);
        minY = Math.min(minY, bounds.y);
        maxX = Math.max(maxX, bounds.x + bounds.width);
        maxY = Math.max(maxY, bounds.y + bounds.height);
      }
    });

    if (minX === Infinity) {
      return new CombinedView(views);
    }

    // 计算合并后view的中心点
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // 创建合并后的CombinedView
    const mergedView = new CombinedView([]);

    // 调整每个原view的matrix，使其相对于合并后view的坐标系
    views.forEach((view) => {
      // 保存原view的matrix
      const originalMatrix = view.matrix.copy();

      // 计算原view相对于合并中心的偏移
      const bounds = view.getContentBounds();
      if (bounds) {
        const viewCenterX = bounds.x + bounds.width / 2;
        const viewCenterY = bounds.y + bounds.height / 2;

        // 计算偏移量
        const offsetX = viewCenterX - centerX;
        const offsetY = viewCenterY - centerY;

        // 创建新的matrix：先应用原变换，再应用偏移
        const newMatrix = originalMatrix.copy();
        newMatrix.translate(offsetX, offsetY, 0);

        // 设置新的matrix
        view.setTransform(newMatrix);
      }

      // 添加到合并后的view
      mergedView.addChild(view);
    });

    // 设置合并后view的matrix为合并中心的位置
    mergedView.setTransform(Matrix4.translation(centerX, centerY, 0));

    return mergedView;
  }

  /**
   * 拆分组合视图
   * 将子view的matrix正确变换回独立状态
   */
  public static splitView(view: any): View[] {
    if (!view || !view.content || !Array.isArray(view.content)) {
      return [view];
    }

    const combinedView = view as CombinedView;
    const childViews = [...combinedView.children];

    // 获取父view的世界矩阵
    const parentWorldMatrix = combinedView.getWorldMatrix();

    // 为每个子view计算独立后的matrix
    childViews.forEach((childView) => {
      // 获取子view的当前世界矩阵
      const childWorldMatrix = childView.getWorldMatrix();

      // 计算子view的本地matrix（相对于父view的变换）
      const childLocalMatrix = childView.matrix.copy();

      // 计算子view独立后的matrix
      // 独立后的matrix = 子view的世界矩阵（因为父view的变换已经包含在内）
      const independentMatrix = childWorldMatrix.copy();

      // 设置子view的matrix为独立后的matrix
      childView.setTransform(independentMatrix);

      // 清除父引用
      childView.parent = null;
    });

    return childViews;
  }
}


