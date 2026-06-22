import { Scene } from "@/engine/scene/Scene";
import { Serializer } from "@/engine/serialization/Serializer";
import { Renderer } from "@/engine/renderer/Renderer";
import { OrthographicCamera } from "@/engine/camera/OrthographicCamera.js";
import type {
  IAppOptions,
  IAppLifetimes,
  INavigationOptions,
} from "@/types/engine/app.js";
import type { IRendererOptions } from "@/types/engine/renderer.js";
import type { ISerializable } from "@/types/foundation/serializable.js";
import { AppType } from "@/foundation/constants";
import { createClientFlowRunner } from "@/foundation/flow/presets/client.js";
import type { FlowRunner } from "@/foundation/flow/FlowRunner/index.js";
import type { FrontendCapProxy } from "@/types/foundation/flow/context.js";
import { AnimationManager } from "@/foundation/animation";
import { flattenViewTree } from "@/engine/scene/utils";
import type View from "@/view/View/View";
import type { IPlatformCanvas } from "@/types/platform/canvas.js";

export class App implements ISerializable {
  // 类型标识（用于 Serializer 注册）
  public readonly type: AppType = AppType.APP;

  // 基本属性
  public scenes: Scene[] = [];
  public renderer: Renderer;
  public pageStack: Scene[] = [];
  public readonly animationManager: AnimationManager =
    AnimationManager.getInstance();

  /** 流程执行器（前端预设，通过 initFlowRunner 延迟注入） */
  public flowRunner: FlowRunner<FrontendCapProxy> | null = null;

  /**
   * 是否允许 FlowSchema 执行。
   *
   * 编辑态传 false，运行态传 true。
   * gate 在 Scene.triggerSchema 与 App 生命周期触发处统一拦截。
   */
  public readonly flowEnabled: boolean;

  /**
   * 应用 ID（可选）
   *
   * 由消费方（如 banyan 前端）设置，用于 cloudFunction 节点标识应用。
   */
  public appId: string | undefined = undefined;

  /**
   * 后端端点地址（可选）
   *
   * cloudFunction 节点通过 httpClient 调用 `${endpoint}/api/functions/${functionId}`。
   * 未设置时 httpClient 请求将使用相对路径。
   */
  public backendEndpoint: string | undefined = undefined;

  /**
   * 应用设计尺寸（目标设备逻辑分辨率）
   *
   * 表达「这个应用为什么尺寸的设备设计」，是全局级属性，对所有 Scene 生效。
   * 持久化到 appJSON，构建时直接读取。
   *
   * - 编辑态 / 预览态：useCanvasInit 读取此值设置 canvas 物理像素 + camera bounds
   * - 构建态：scaffold 读取此值设置窗口 / viewport 尺寸
   *
   * 默认值 1280×800（标准 PC 横屏）
   */
  private _designSize: { width: number; height: number } = { width: 1280, height: 800 };

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

  /**
   * App 生命周期钩子
   *
   * 与 Scene.lifetimes / View.lifetimes 设计一致。
   * 可在构造时通过 options.lifetimes 初始化，也可在运行时直接赋值。
   */
  public lifetimes: IAppLifetimes = { onLaunch: null, onUnlaunch: null };

  constructor(renderer: Renderer, options: IAppOptions) {
    this.renderer = renderer;
    this._enablePageStack = options.enablePageStack !== false;
    this._maxPageStackSize = options.maxPageStackSize || 50;
    this.flowEnabled = options.flowEnabled !== false; // 默认 true

    // 初始化 lifetimes（FlowSchema）
    this.lifetimes = {
      onLaunch: options.lifetimes?.onLaunch ?? null,
      onUnlaunch: options.lifetimes?.onUnlaunch ?? null,
    };
  }

  /**
   * 延迟注入前端能力代理，创建 FlowRunner。
   *
   * App 构造时不依赖 cap（引擎层环境无关），
   * 由宿主层（如 useCanvasCore）在 App 实例化后调用，
   * 传入闭包捕获 App 的 FrontendCapProxy。
   */
  public initFlowRunner(cap: FrontendCapProxy): void {
    this.flowRunner = createClientFlowRunner(cap);
  }

  // 内置生命周期方法
  public onLaunch(params: any): void {
    // 内置逻辑
    this._launchParams = params;
    this._isLaunched = true;

    // 自动启动循环渲染
    this.startRenderLoop();
    console.log("App已启动，自动开始循环渲染");

    // 调用 lifetimes.onLaunch（FlowSchema）
    if (this.flowEnabled && this.lifetimes.onLaunch) {
      try {
        this.flowRunner!.run(this.lifetimes.onLaunch)
          .catch((err: unknown) => console.error('[App] onLaunch schema 执行出错:', err));
      } catch (error) {
        console.error("lifetimes.onLaunch 执行失败:", error);
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

    // 调用 lifetimes.onUnlaunch（FlowSchema）
    if (this.flowEnabled && this.lifetimes.onUnlaunch) {
      try {
        this.flowRunner!.run(this.lifetimes.onUnlaunch)
          .catch((err: unknown) => console.error('[App] onUnlaunch schema 执行出错:', err));
      } catch (error) {
        console.error("lifetimes.onUnlaunch 执行失败:", error);
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
      scene._app = this;
    }
    return this;
  }

  public removeScene(scene: Scene): App {
    const index = this.scenes.indexOf(scene);
    if (index > -1) {
      this.scenes.splice(index, 1);
      scene._app = null;
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

  // 调整画布物理像素尺寸，并可选更新渲染 DPR
  // 引擎只关心虚拟尺寸（物理像素），CSS 样式尺寸由外层控制
  public handleResize(width: number, height: number, dpr?: number): App {
    this.renderer.resize(width, height);
    if (dpr !== undefined) {
      this.renderer.setDPR(dpr);
    }
    return this;
  }

  // ── designSize（应用设计尺寸）──────────────────────────────────────────────

  /** 获取当前应用设计尺寸 */
  public getDesignSize(): { width: number; height: number } {
    return { ...this._designSize };
  }

  /**
   * 设置应用设计尺寸，并同步更新 Renderer 物理像素 + 当前 Scene Camera bounds。
   *
   * @param width  目标设备逻辑宽度（px）
   * @param height 目标设备逻辑高度（px）
   * @param dpr    设备像素比（可选，默认不变）
   */
  public setDesignSize(width: number, height: number, dpr?: number): App {
    this._designSize = { width, height };

    // 同步 canvas 物理像素
    const effectiveDpr = dpr ?? this.renderer.getDPR();
    this.renderer.resize(width * effectiveDpr, height * effectiveDpr);
    if (dpr !== undefined) {
      this.renderer.setDPR(dpr);
    }

    // 同步当前 Scene 的 Camera bounds
    const scene = this.getCurrentScene();
    if (scene) {
      if (scene.camera instanceof OrthographicCamera) {
        scene.camera.setBounds(0, width, height, 0);
      }
      scene.markDirty();
    }

    // 通知 React 订阅层（useSyncExternalStore）状态变更，
    // 驱动 canvasStyle 重计算 + resize effect 重触发
    this.notify();

    return this;
  }

  // 销毁应用
  public destroy(): App {
    this.unlaunch();
    this.renderer.destroy();
    return this;
  }


  /**
   * 序列化整个 App 为 JSON 字符串（通过 Serializer）
   *
   * 输出格式：{ type: "APP", version, data: app.toJSON(), metadata }
   * 一个应用对应一个完整 JSON 字符串。
   */
  public serialize(): string {
    return Serializer.getInstance().serialize(this);
  }

  /**
   * 从序列化 JSON 字符串恢复 App 状态
   *
   * Serializer.deserialize 会递归还原内部的 Scene/Camera/View 实例。
   * 返回的是 { lifetimes, scenes: Scene[] } 纯数据，赋值给当前实例。
   */
  public initFromSerialized(json: string): App {
    const serializer = Serializer.getInstance();
    const appData = serializer.deserialize<{ designSize?: { width: number; height: number }; lifetimes: IAppLifetimes; scenes: Scene[] }>(json);

    // 恢复 designSize
    if (appData.designSize) {
      this._designSize = appData.designSize;
    }

    // 恢复 lifetimes
    this.lifetimes = {
      onLaunch: appData.lifetimes?.onLaunch ?? null,
      onUnlaunch: appData.lifetimes?.onUnlaunch ?? null,
    };

    // 恢复 scenes
    this.getScenes().forEach((scene) => this.removeScene(scene));
    if (Array.isArray(appData.scenes)) {
      appData.scenes.forEach((scene) => this.addScene(scene));
      if (appData.scenes.length > 0) {
        this.setCurrentScene(appData.scenes[0]);
      }
    }

    return this;
  }

  /**
   * ISerializable 实现：将 App 转为可序列化的纯数据对象
   *
   * 序列化范围：
   *   - lifetimes: App 级生命周期 FlowSchema
   *   - scenes: 所有页面（带 $type/$value 包装，走 Serializer 递归）
   *
   * 不序列化（运行时对象）：
   *   - renderer / animationManager / flowRunner
   *   - pageStack / _currentScene / _isLaunched
   *   - appId（由消费方注入）
   */
  public toJSON(): any {
    return {
      designSize: this._designSize,
      lifetimes: this.lifetimes,
      scenes: this.scenes.map((scene) => ({
        $type: scene.type,
        $value: scene.toJSON(),
      })),
    };
  }

  /**
   * 从 toJSON() 产出的纯数据恢复 App 状态（静态工厂）
   *
   * 注意：data.scenes 在到达此方法前已被 Serializer 的 deserializeValue
   * 递归处理——$type/$value 包装已还原为 Scene 实例。
   *
   * 此方法返回的是一个部分初始化的结构对象（不含 renderer），
   * Serializer 内部使用。消费方应使用 app.initFromSerialized(json)。
   */
  static fromJSON(data: any): { designSize?: { width: number; height: number }; lifetimes: IAppLifetimes; scenes: Scene[] } {
    return {
      designSize: data.designSize ?? undefined,
      lifetimes: {
        onLaunch: data.lifetimes?.onLaunch ?? null,
        onUnlaunch: data.lifetimes?.onUnlaunch ?? null,
      },
      scenes: Array.isArray(data.scenes) ? data.scenes : [],
    };
  }

  public toString(): string {
    return this.serialize();
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

  // ──── App 级别 FlowContext 构造 ────


  /**
   * 平台无关工厂：从 IPlatformCanvas 创建应用
   *
   * 各平台（Web / React Native / Skia / Node）通过此方法注入平台画布。
   */
  public static create(
    platform: IPlatformCanvas,
    options: IAppOptions,
    rendererOptions: IRendererOptions = {},
  ): App {
    const renderer = Renderer.fromPlatform(platform, rendererOptions);
    return new App(renderer, options);
  }
}
