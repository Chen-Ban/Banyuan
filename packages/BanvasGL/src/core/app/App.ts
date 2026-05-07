import Scene from "@/core/scene/Scene";
import Serializer from "@/core/serializer";
import Renderer from "@/core/renderer/Renderer";
import {
  IAppOptions,
  INavigationOptions,
  IRendererOptions,
} from "@/core/interfaces";
import AnimationManager from "@/core/animation/AnimationManager";

export default class App {
  // 基本属性
  public scenes: Scene[] = [];
  public renderer: Renderer;
  public pageStack: Scene[] = [];
  public readonly animationManager: AnimationManager =
    AnimationManager.getInstance();

  // 私有属性
  private _currentScene: Scene | null = null;
  private _currentPageIndex: number = -1; // 当前页面在栈中的索引
  private _isLaunched: boolean = false;
  private _launchParams: any = null;
  private _maxPageStackSize: number = 50;
  private _enablePageStack: boolean = true;
  private _pageStackHistory: Set<string> = new Set(); // 记录已经在栈中的页面ID

  // 循环渲染相关属性
  private _animationFrameId: number | null = null;
  private _isRendering: boolean = false;
  private _renderLoop: boolean = false;
  private _lastRenderTime: number = 0;
  private _targetFPS: number = 60;
  private _frameInterval: number = 1000 / 60; // 16.67ms for 60fps

  // 外部订阅（useSyncExternalStore 支持）
  private _listeners: Set<() => void> = new Set();
  private _version: number = 0;

  // 用户自定义生命周期回调函数
  private _userOnLaunch?: (params: any) => void;
  private _userOnUnlaunch?: () => void;

  constructor(renderer: Renderer, options: IAppOptions = {}) {
    this.renderer = renderer;
    this._enablePageStack = options.enablePageStack !== false;
    this._maxPageStackSize = options.maxPageStackSize || 50;

    // 保存用户自定义的生命周期回调函数
    if (options.onLaunch) {
      this._userOnLaunch = options.onLaunch;
    }
    if (options.onUnlaunch) {
      this._userOnUnlaunch = options.onUnlaunch;
    }
  }

  // 内置生命周期方法
  public onLaunch(params: any): void {
    // 内置逻辑
    this._launchParams = params;
    this._isLaunched = true;

    // 自动启动循环渲染
    this.startRenderLoop();
    console.log("App已启动，自动开始循环渲染");

    // 调用用户自定义的生命周期回调函数
    if (this._userOnLaunch) {
      try {
        this._userOnLaunch(params);
      } catch (error) {
        console.error("用户onLaunch回调函数执行失败:", error);
      }
    }
  }

  public onUnlaunch(): void {
    this._isLaunched = false;
    this._launchParams = null;

    // 停止渲染循环
    this.stopRenderLoop();

    // 清理所有场景
    this.scenes.forEach((scene) => {
      scene.unload();
    });
    this.scenes = [];

    // 清空页面栈
    this.pageStack = [];
    this._currentScene = null;

    // 清空页面栈历史记录
    this._pageStackHistory.clear();

    // 调用用户自定义的生命周期回调函数
    if (this._userOnUnlaunch) {
      try {
        this._userOnUnlaunch();
      } catch (error) {
        console.error("用户onUnlaunch回调函数执行失败:", error);
      }
    }
  }

  // 启动应用
  public launch(params: any = {}): App {
    console.log("App launched");
    this.onLaunch(params);
    return this;
  }

  // 关闭应用
  public unlaunch(): App {
    console.log("App unlaunched");
    this.onUnlaunch();
    return this;
  }

  // 场景管理
  public addScene(scene: Scene): App {
    if (!this.scenes.includes(scene)) {
      this.scenes.push(scene);
    }
    return this;
  }

  public removeScene(scene: Scene): App {
    const index = this.scenes.indexOf(scene);
    if (index > -1) {
      this.scenes.splice(index, 1);
      scene.unload();
    }
    return this;
  }

  public getScene(id: string): Scene | null {
    return this.scenes.find((scene) => scene.id === id) || null;
  }

  public getScenes(): Scene[] {
    return [...this.scenes];
  }

  public clearScenes(): App {
    this.scenes.forEach((scene) => scene.unload());
    this.scenes = [];
    return this;
  }

  // 导航方法
  public navigateTo(page: Scene, options: INavigationOptions = {}): App {
    if (!this._enablePageStack) {
      return this.replaceTo(page, options);
    }

    // 隐藏当前场景
    if (this._currentScene) {
      this._currentScene.hide();
    }

    // 检查目标页面是否已经在栈中
    const isPageAlreadyInStack = this.isPageInStack(page);

    if (isPageAlreadyInStack) {
      // 如果页面已经在栈中，将其从栈中移除
      this.removePageFromStack(page);
    }

    // 将新页面推入栈顶
    this.pushToPageStack(page);

    // 设置当前页面指针指向栈顶（新页面）
    this._currentScene = page;
    this._currentPageIndex = this.pageStack.length - 1;
    this._currentScene.show();

    // 根据页面是否首次入栈决定调用onload还是onshow
    if (!isPageAlreadyInStack) {
      // 首次入栈，调用onload方法
      this._currentScene.load(options.params ?? {});
    } else {
      // 已在栈中，调用onshow方法
      this._currentScene.onShow();
    }

    return this;
  }

  public navigateBack(page?: Scene): App {
    if (
      !this._enablePageStack ||
      this.pageStack.length <= 1 ||
      this._currentPageIndex <= 0
    ) {
      return this;
    }

    // 隐藏当前场景
    if (this._currentScene) {
      this._currentScene.hide();
    }

    // 移动指针到上一个页面
    this._currentPageIndex--;
    const previousPage = this.pageStack[this._currentPageIndex];
    if (previousPage) {
      this._currentScene = previousPage;
      this._currentScene.show();
      // 返回时调用onshow方法
      this._currentScene.onShow();
    }

    return this;
  }

  public navigateForward(): App {
    if (
      !this._enablePageStack ||
      this.pageStack.length <= 1 ||
      this._currentPageIndex >= this.pageStack.length - 1
    ) {
      return this;
    }

    // 隐藏当前场景
    if (this._currentScene) {
      this._currentScene.hide();
    }

    // 移动指针到下一个页面
    this._currentPageIndex++;
    const nextPage = this.pageStack[this._currentPageIndex];
    if (nextPage) {
      this._currentScene = nextPage;
      this._currentScene.show();
      // 前进时调用onshow方法
      this._currentScene.onShow();
    }

    return this;
  }

  public replaceTo(page: Scene, options: INavigationOptions = {}): App {
    // 隐藏当前场景
    if (this._currentScene) {
      this._currentScene.hide();
    }

    // 清空页面栈（如果指定）
    if (options.clearStack) {
      this.clearPageStack();
    } else {
      // 替换当前页面：从栈顶弹出当前页面
      if (this.pageStack.length > 0) {
        this.popFromPageStack();
      }
    }

    // 将新页面推入栈顶
    this.pushToPageStack(page);

    // 设置当前页面指针指向栈顶（新页面）
    this._currentScene = page;
    this._currentPageIndex = this.pageStack.length - 1;
    this._currentScene.show();

    // 替换页面时，根据页面是否在栈中决定调用onload还是onshow
    const isFirstTimeInStack = !this.isPageInStack(page);
    if (isFirstTimeInStack) {
      // 首次入栈，调用onload方法
      this._currentScene.load(options.params ?? {});
    } else {
      // 已在栈中，调用onshow方法
      this._currentScene.onShow();
    }

    return this;
  }

  public navigate(n: number): App {
    if (n > 0) {
      // 后退n个页面（n为正数表示后退）
      for (let i = 0; i < n; i++) {
        this.navigateBack();
      }
    } else if (n < 0) {
      // 前进n个页面（n为负数表示前进）
      for (let i = 0; i < Math.abs(n); i++) {
        this.navigateForward();
      }
    }
    return this;
  }

  // 页面栈管理
  private pushToPageStack(page: Scene): void {
    if (!this._enablePageStack) {
      return;
    }

    this.pageStack.push(page);
    this._pageStackHistory.add(page.id);

    // 限制栈大小
    if (this.pageStack.length > this._maxPageStackSize) {
      const removedPage = this.pageStack.shift();
      if (removedPage) {
        removedPage.unload();
        this._pageStackHistory.delete(removedPage.id);
      }
    }
  }

  private popFromPageStack(): Scene | null {
    const page = this.pageStack.pop() || null;
    if (page) {
      this._pageStackHistory.delete(page.id);
      // 更新当前页面索引
      if (this._currentPageIndex >= this.pageStack.length) {
        this._currentPageIndex = this.pageStack.length - 1;
      }
    }
    return page;
  }

  private removePageFromStack(page: Scene): void {
    // 从页面栈中移除指定页面
    const index = this.pageStack.findIndex((p) => p.id === page.id);
    if (index !== -1) {
      this.pageStack.splice(index, 1);
      // 更新当前页面索引
      if (index < this._currentPageIndex) {
        this._currentPageIndex--;
      } else if (index === this._currentPageIndex) {
        // 如果移除的是当前页面，调整索引
        this._currentPageIndex = Math.min(
          this._currentPageIndex,
          this.pageStack.length - 1,
        );
      }
    }

    // 从历史记录中移除
    this._pageStackHistory.delete(page.id);
  }

  // 检查页面是否在栈中
  private isPageInStack(page: Scene): boolean {
    return this._pageStackHistory.has(page.id);
  }

  public clearPageStack(): App {
    this.pageStack.forEach((page) => page.unload());
    this.pageStack = [];
    this._pageStackHistory.clear();
    return this;
  }

  public getPageStack(): Scene[] {
    return [...this.pageStack];
  }

  public getPageStackSize(): number {
    return this.pageStack.length;
  }

  // 当前场景管理
  public getCurrentScene(): Scene | null {
    return this._currentScene;
  }

  public setCurrentScene(scene: Scene): App {
    if (this._currentScene) {
      this._currentScene.hide();
    }

    this._currentScene = scene;
    this._currentScene.show();

    return this;
  }

  // 渲染
  public render(): App {
    if (this._currentScene) {
      this.renderer.render(this._currentScene);
    } else {
      this.renderer.clear();
    }
    return this;
  }

  /**
   * 开始循环渲染
   * @param fps 目标帧率，默认为60fps
   */
  public startRenderLoop(fps: number = 60): App {
    if (this._renderLoop) {
      console.warn("渲染循环已经在运行中");
      return this;
    }

    this._targetFPS = fps;
    this._frameInterval = 1000 / fps;
    this._renderLoop = true;
    this._lastRenderTime = 0;

    this._requestAnimationFrame();

    return this;
  }

  /**
   * 停止循环渲染
   */
  public stopRenderLoop(): App {
    if (!this._renderLoop) {
      console.warn("渲染循环未在运行");
      return this;
    }

    this._renderLoop = false;

    if (this._animationFrameId !== null) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = null;
    }

    console.log("停止循环渲染");
    return this;
  }

  /**
   * 暂停循环渲染
   */
  public pauseRenderLoop(): App {
    if (this._animationFrameId !== null) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = null;
    }
    this._isRendering = false;
    console.log("暂停循环渲染");
    return this;
  }

  /**
   * 恢复循环渲染
   */
  public resumeRenderLoop(): App {
    if (this._renderLoop && !this._isRendering) {
      this._requestAnimationFrame();
      console.log("恢复循环渲染");
    }
    return this;
  }

  /**
   * 设置目标帧率
   * @param fps 目标帧率
   */
  public setTargetFPS(fps: number): App {
    this._targetFPS = Math.max(1, Math.min(120, fps)); // 限制在1-120fps之间
    this._frameInterval = 1000 / this._targetFPS;
    console.log(`设置目标帧率为: ${this._targetFPS}fps`);
    return this;
  }

  /**
   * 获取当前渲染状态
   */
  public getRenderStatus(): {
    isRendering: boolean;
    renderLoop: boolean;
    targetFPS: number;
    frameInterval: number;
  } {
    return {
      isRendering: this._isRendering,
      renderLoop: this._renderLoop,
      targetFPS: this._targetFPS,
      frameInterval: this._frameInterval,
    };
  }

  /**
   * 内部方法：请求动画帧
   */
  private _requestAnimationFrame(): void {
    if (!this._renderLoop) return;

    this._animationFrameId = requestAnimationFrame((timestamp) => {
      this._renderFrame(timestamp);
    });
  }

  /**
   * 内部方法：渲染帧
   */
  private _renderFrame(timestamp: number): void {
    if (!this._renderLoop) return;

    // 检查是否应该渲染这一帧（基于目标FPS）
    if (timestamp - this._lastRenderTime >= this._frameInterval) {
      this._isRendering = true;

      // 动画 tick —— 在渲染之前驱动所有动画计算
      this.animationManager.tick(timestamp);

      this.render();
      this._lastRenderTime = timestamp;
      this._isRendering = false;
    }

    // 继续下一帧
    this._requestAnimationFrame();
  }

  /**
   * 设置用户自定义的onLaunch回调函数
   * @param callback 用户自定义的onLaunch回调函数
   */
  public setUserOnLaunch(callback: (params: any) => void): App {
    this._userOnLaunch = callback;
    return this;
  }

  /**
   * 设置用户自定义的onUnlaunch回调函数
   * @param callback 用户自定义的onUnlaunch回调函数
   */
  public setUserOnUnlaunch(callback: () => void): App {
    this._userOnUnlaunch = callback;
    return this;
  }

  /**
   * 移除用户自定义的onLaunch回调函数
   */
  public removeUserOnLaunch(): App {
    this._userOnLaunch = undefined;
    return this;
  }

  /**
   * 移除用户自定义的onUnlaunch回调函数
   */
  public removeUserOnUnlaunch(): App {
    this._userOnUnlaunch = undefined;
    return this;
  }

  /**
   * 获取用户自定义的生命周期回调函数状态
   */
  public getUserLifecycleStatus(): {
    hasUserOnLaunch: boolean;
    hasUserOnUnlaunch: boolean;
  } {
    return {
      hasUserOnLaunch: !!this._userOnLaunch,
      hasUserOnUnlaunch: !!this._userOnUnlaunch,
    };
  }

  // 从序列化的 Scene JSON 初始化
  public initFromSerializedScenes(serializedScenes: string[]): App {
    try {
      const scenes = (serializedScenes || []).map((json) =>
        Serializer.getInstance().deserialize(json),
      );
      scenes.forEach((scene) => this.addScene(scene));
      if (scenes.length > 0) {
        this.setCurrentScene(scenes[0]);
      }
    } catch (e) {
      console.warn("Failed to init scenes from serialized JSON:", e);
    }
    return this;
  }

  // 状态查询
  public isLaunched(): boolean {
    return this._isLaunched;
  }

  public getLaunchParams(): any {
    return this._launchParams;
  }

  public hasCurrentScene(): boolean {
    return this._currentScene !== null;
  }

  public canNavigateBack(): boolean {
    return this.pageStack.length > 0;
  }

  // 页面栈配置
  public setPageStackEnabled(enabled: boolean): App {
    this._enablePageStack = enabled;
    if (!enabled) {
      this.clearPageStack();
    }
    return this;
  }

  public getCurrentPage(): Scene {
    return this.pageStack[this.pageStack.length - 1];
  }

  public setMaxPageStackSize(size: number): App {
    this._maxPageStackSize = Math.max(1, size);

    // 如果当前栈大小超过限制，移除多余的页面
    while (this.pageStack.length > this._maxPageStackSize) {
      const removedPage = this.pageStack.shift();
      if (removedPage) {
        removedPage.unload();
      }
    }

    return this;
  }

  public isPageStackEnabled(): boolean {
    return this._enablePageStack;
  }

  public getMaxPageStackSize(): number {
    return this._maxPageStackSize;
  }

  // 渲染器管理
  public getRenderer(): Renderer {
    return this.renderer;
  }

  public setRenderer(renderer: Renderer): App {
    this.renderer = renderer;
    return this;
  }

  // 批量操作
  public beginBatchOperation(): App {
    // 暂停自动渲染
    return this;
  }

  public endBatchOperation(): App {
    // 恢复自动渲染并渲染一次
    this.render();
    return this;
  }

  // 事件处理
  public handleResize(width: number, height: number): App {
    this.renderer.resize(width, height);
    return this;
  }

  // 销毁应用
  public destroy(): App {
    this.unlaunch();
    this.renderer.destroy();
    return this;
  }

  /**
   * 获取所有 Scene 的序列化 JSON 字符串数组
   * 每个元素是一个 Scene 的完整序列化 JSON，可直接存入后端
   */
  public getSerializedScenes(): string[] {
    return this.scenes.map((scene) =>
      Serializer.getInstance().serialize(scene),
    );
  }

  public toString() {
    return Serializer.getInstance().serialize(this);
  }

  // ──── 外部订阅（useSyncExternalStore）────

  /**
   * 订阅状态变更通知。返回取消订阅函数。
   * 用法：useSyncExternalStore(app.subscribe, app.getVersion)
   */
  public subscribe = (listener: () => void): (() => void) => {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  };

  /**
   * 通知所有订阅者状态已变更。
   * 在 actions 修改引擎状态后调用。
   */
  public notify(): void {
    this._version++;
    this._listeners.forEach((l) => l());
  }

  /**
   * 返回当前版本号，用作 useSyncExternalStore 的 snapshot。
   */
  public getVersion = (): number => {
    return this._version;
  };

  // 静态方法：创建应用
  public static create(
    canvas: HTMLCanvasElement,
    options: IAppOptions = {},
    rendererOptions: IRendererOptions = {},
  ): App {
    const renderer = new Renderer(canvas, rendererOptions);
    return new App(renderer, options);
  }
}
