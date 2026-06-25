import View from '@/view/View/View'
import { BaseCamera, OrthographicCamera } from '@/engine/camera'
import { LayerManager } from './layer'
import { generateId, generateName } from '@/foundation/utils'
import { TransactionManager } from './transaction'
import {
  flattenViewTree,
  clearAllStates,
  clearSelectedStates,
  isViewInTree,
  groupViews,
  ungroupView,
} from './utils'
import type { ISerializable } from '@/types/foundation/serializable'
import type { ISceneLifetimes } from '@/types/engine/scene'
import type { IView, FlowSchema } from '@/types/view/view'
import { isCombinedView, isContainerView } from '@/foundation/guards'
import { AnimationDescriptor } from '@/foundation/animation'
import AnimationAddon from '@/view/addon/AnimationAddon'
import { SceneType } from '@/foundation/constants'
import { SnapAlignManager } from './snap'
import CombinedView from '@/view/CombinedViews'
import type { IDrawingSurface } from '@/types/platform/surface.js'

export interface SceneOptions {
  name?: string
  camera?: BaseCamera
  data?: any
  lifetimes?: Partial<ISceneLifetimes>
}

export class Scene implements ISerializable {
  // 基本属性
  public readonly type: SceneType = SceneType.SCENE
  public id: string = ''
  public name: string = ''
  public children: View[] = []
  public camera: BaseCamera
  public data: any = {}
  public readonly snapAlign = new SnapAlignManager()
  private transactionManager: TransactionManager
  private layerManager: LayerManager

  // 私有属性
  private _isVisible: boolean = false

  /**
   * 反向引用持有本 Scene 的 App 实例
   *
   * 由 App.addScene 注入，供 FlowRunner 执行 navigate 节点和 markDirty 使用。
   * 使用 any 避免循环依赖（Scene → App → Scene）。
   */
  public _app: any = null

  // 用户自定义生命周期回调
  public lifetimes: ISceneLifetimes

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
  private _animationRegistry: Map<string, AnimationDescriptor> = new Map()

  constructor(camera: BaseCamera, options: SceneOptions = {}) {
    this.camera = camera
    this.layerManager = new LayerManager(() => this)
    this.transactionManager = new TransactionManager({
      findViewById: (id: string) => this.findViewById(id),
      removeChild: (child: View) => this.removeChild(child, false),
      insertChildAt: (child: View, index: number) => this.insertChildAt(child, index),
      findContainerById: (id: string) => this.findContainerById(id),
    })

    // 设置选项
    if (options.data) {
      this.data = options.data
    }

    // 初始化生命周期回调
    this.lifetimes = {
      onLoad: options.lifetimes?.onLoad ?? null,
      onUnload: options.lifetimes?.onUnload ?? null,
      onShow: options.lifetimes?.onShow ?? null,
      onHide: options.lifetimes?.onHide ?? null,
    }

    // 生成唯一ID
    this.id = generateId(this.type)
    this.name = options.name || generateName(this.type)
  }

  // 生命周期方法
  public onLoad(params: any): void {
    // 触发 FlowRunner 执行 onLoad schema
    // Scene 自身作为 view 传入，params 作为 eventArgs 传入
    this.triggerSchema(
      this as unknown as IView,
      this.lifetimes.onLoad,
      Array.isArray(params) ? params : [params],
    )
  }

  public onUnload(): void {
    // 触发 FlowRunner 执行 onUnload schema（在清理前执行，确保 schema 可访问子视图）
    this.triggerSchema(this as unknown as IView, this.lifetimes.onUnload)

    // 清理子视图
    this.clearChildren()
    // 清空操作栈
    this.transactionManager.clear()
  }

  public onShow(): void {
    this._isVisible = true

    // 触发 FlowRunner 执行 onShow schema
    this.triggerSchema(this as unknown as IView, this.lifetimes.onShow)
  }

  public onHide(): void {
    this._isVisible = false

    // 触发 FlowRunner 执行 onHide schema
    this.triggerSchema(this as unknown as IView, this.lifetimes.onHide)
  }

  public getAllActived() {
    return flattenViewTree(this).filter((v) => v.actived)
  }
  public getSelectedView() {
    return flattenViewTree(this).find((v) => v.selected)
  }

  public select(view: View | undefined = undefined, multiple: boolean = false, deselect: boolean = false) {
    if (!view) {
      clearAllStates(this)
      return
    }
    // 查看传入的view是不是在这个列表中
    if (!isViewInTree(this, view)) {
      console.warn('指定的视图不在当前场景中')
      return
    }

    if (multiple) {
      clearSelectedStates(this, view)
      if (deselect && view.actived === true) {
        view.setActived(false).setSelected(false)
        // 把 selected 转移给剩余 actived 中的最后一个
        const remaining = this.getAllActived()
        if (remaining.length > 0) {
          remaining[remaining.length - 1].setSelected(true)
        }
      } else {
        view.setActived(true).setSelected(true)
      }
    } else {
      const selectedView = this.getSelectedView()
      if (selectedView && selectedView === view) {
        return
      }
      clearAllStates(this, view)
      view.setActived(true).setSelected(true)
    }
  }

  /**
   * 批量激活：一次树遍历完成 deselect 所有旧选中 + select 新命中视图。
   * 比多次调用 select() 减少 N 次 flattenViewTree。
   */
  public batchActivate(viewIds: Set<string>): void {
    const idSet = viewIds.size > 0 ? viewIds : null
    let selectedView: View | null = null
    const views = flattenViewTree(this)
    for (const v of views) {
      const hit = idSet !== null && idSet.has(v.id)
      if (hit) {
        v.setActived(true)
        selectedView = v
      } else {
        v.setActived(false)
        v.setSelected(false)
      }
    }
    if (selectedView) {
      selectedView.setSelected(true)
    }
  }

  // 渲染方法
  public render(surface?: IDrawingSurface): void {
    if (!this._isVisible) {
      return
    }

    // 渲染前将 Camera 的 VP 矩阵广播到所有子 View
    this.broadcastVPMatrix()

    // 视口裁剪优化：仅渲染与相机视口相交的 View
    const camera = this.camera
    if (camera instanceof OrthographicCamera) {
      const bounds = camera.getViewportBounds()
      for (const view of this.children) {
        if (this._isViewInViewport(view, bounds)) {
          view.render(surface)
        }
      }
    } else {
      // 非正交相机（BaseCamera）：渲染全部
      this.children.forEach((view) => {
        view.render(surface)
      })
    }
  }

  /**
   * 判断 View 是否与相机视口相交（用于视口裁剪）
   *
   * 通过 View 的 matrix 平移分量 + viewport 尺寸构造世界空间 AABB，
   * 与相机的 left/right/top/bottom 做矩形相交测试。
   *
   * 注意：此方法忽略旋转/缩放对包围盒的影响（保守策略：
   * 对于有旋转的 View 可能略微过度渲染，但不会遗漏）。
   */
  private _isViewInViewport(
    view: View,
    cameraBounds: { left: number; right: number; bottom: number; top: number },
  ): boolean {
    // 选中态的 View 始终渲染（避免拖拽到视口外时消失）
    if (view.actived || view.selected) return true

    const viewport = view.viewport
    if (!viewport) return true // 无 viewport 信息则保守渲染

    // 从 matrix 提取世界坐标平移分量（行主序：row0col3 = tx, row1col3 = ty）
    const tx = view.matrix.get(0, 3)
    const ty = view.matrix.get(1, 3)

    // 构造世界空间 AABB（左上角坐标系，y 向下）
    const viewLeft = tx
    const viewRight = tx + viewport.width
    const viewTop = ty
    const viewBottom = ty + viewport.height

    // AABB 相交测试（注意：camera 的 top < bottom 因为 y 轴向下）
    // OrthographicCamera 的 top 是较小的 y 值，bottom 是较大的 y 值
    return !(
      viewRight < cameraBounds.left ||
      viewLeft > cameraBounds.right ||
      viewBottom < cameraBounds.top ||
      viewTop > cameraBounds.bottom
    )
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
  public registerAnimation(viewId: string, animationId: string, animation: AnimationDescriptor): void {
    this._animationRegistry.set(`${viewId}:${animationId}`, animation)
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
    const anim = this._animationRegistry.get(`${viewId}:${animationId}`)
    if (!anim) {
      console.warn(`[Scene] playAnimation: 找不到动画 "${viewId}:${animationId}"`)
      return false
    }
    const view = this.findViewById(viewId)
    if (!view) {
      console.warn(`[Scene] playAnimation: 找不到 View "${viewId}"`)
      return false
    }
    // 确保目标 View 已挂载 AnimationAddon
    if (!view.animation) {
      view.animation = new AnimationAddon(view)
    }
    if (anim.isActive) {
      anim.cancel()
    }
    // 通过 AnimationAddon 播放（采集 initialValues + 挂载 + 注册到 Manager）
    view.animation.animate(anim.definition, {
      duration: anim.duration,
      delay: anim.delay,
      fillMode: anim.fillMode,
      direction: anim.direction,
      iterations: anim.iterations,
      easing: anim.easing,
      referenceFrame: anim.referenceFrame,
      onStart: anim.onStart ?? undefined,
      onUpdate: anim.onUpdate ?? undefined,
      onFinish: anim.onFinish ?? undefined,
      onCancel: anim.onCancel ?? undefined,
      onIteration: anim.onIteration ?? undefined,
    })
    return true
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
  public markDirty(_view?: IView): void {
    this._app?.render()
  }

  /**
   * 执行一个 FlowSchema
   *
   * 统一的 schema 执行入口，生命周期（onAttach / onDestroy 等）和
   * 交互事件（onClick 等）本质相同，都通过此方法触发。
   *
   * @param view      触发事件的 View
   * @param schema    要执行的 FlowSchema（null 时静默跳过）
   * @param eventArgs 事件参数列表（生命周期传空数组）
   */
  public triggerSchema(_view: IView, schema: FlowSchema | null, eventArgs: unknown[] = []): void {
    if (!schema) return
    if (this._app?.flowEnabled === false) return // 编辑态统一短路
    const runner = this._app?.flowRunner
    if (!runner) {
      console.warn('[Scene] triggerSchema: App 未绑定或 flowRunner 不可用')
      return
    }

    runner.run(schema, { args: eventArgs }).catch((err: unknown) => {
      console.error('[Scene] schema 执行出错:', err)
    })
  }

  /**
   * 将当前 Camera 的 viewProjectionMatrix 广播到所有子 View。
   * 每帧渲染前调用一次，确保渲染和交互时使用的 VP 矩阵一致。
   */
  public broadcastVPMatrix(): void {
    const vpMatrix = this.camera.viewProjectionMatrix
    this.children.forEach((view) => view.setVPMatrix(vpMatrix))
  }

  // 子视图管理
  public addChild(child: View, record: boolean = true): this {
    if (!this.children.includes(child)) {
      this.children.push(child)
      child.parent = this
      // 新加入的 View 立即获得当前 Camera 的 VP 矩阵
      child.setVPMatrix(this.camera.viewProjectionMatrix)
      child.onAttach()
      // 自动录入操作栈
      if (record) {
        this.transactionManager.recordAdd(this.id, child, this.children.indexOf(child))
      }
    }
    return this
  }

  public removeChild(child: View, record: boolean = true): this {
    const index = this.children.indexOf(child)
    if (index > -1) {
      // 录入必须在 splice 之前（需要快照）
      if (record) {
        this.transactionManager.recordRemove(this.id, child, index)
      }
      this.children.splice(index, 1)
      child.parent = null
    }
    return this
  }

  public clearChildren(): this {
    for (let i = this.children.length - 1; i >= 0; i--) {
      this.removeChild(this.children[i], false)
    }
    return this
  }

  /**
   * 在指定位置插入子视图（用于 undo/redo 恢复）
   */
  private insertChildAt(child: View, index: number): void {
    child.parent = this
    child.setVPMatrix(this.camera.viewProjectionMatrix)
    // 确保 index 不越界
    const safeIndex = Math.min(index, this.children.length)
    this.children.splice(safeIndex, 0, child)
    child.onAttach()
  }

  // 事务管理的便捷代理方法
  public beginTransaction(viewIds: string[]): void {
    this.transactionManager.beginTransaction(viewIds)
  }

  public commitTransaction(): boolean {
    return this.transactionManager.commitTransaction()
  }

  public rollbackTransaction(): void {
    this.transactionManager.rollbackTransaction()
  }

  // 操作栈管理
  public undo(): boolean {
    return this.transactionManager.undo()
  }

  public redo(): boolean {
    return this.transactionManager.redo()
  }

  get canUndo(): boolean {
    return this.transactionManager.canUndo
  }

  get canRedo(): boolean {
    return this.transactionManager.canRedo
  }

  // 数据管理
  public setData(data: any): this {
    this.data = data
    return this
  }
  // 场景管理
  public load(params: any = {}): this {
    this.onLoad(params)
    return this
  }
  public unload(): this {
    this.onUnload()
    return this
  }

  public show(): this {
    this.onShow()
    return this
  }

  public hide(): this {
    this.onHide()
    return this
  }

  // 复制场景
  public copy(): Scene {
    const newScene = new Scene(this.camera)

    // 复制基本属性
    newScene.id = generateId(this.type)
    newScene.data = { ...this.data }

    // 复制子视图
    this.children.forEach((child) => {
      newScene.addChild(child.copy(), false)
    })

    return newScene
  }

  public findViewById(id: string) {
    return flattenViewTree(this).find((view) => view.id === id)
  }

  /**
   * 获取目标 View 在全局深度优先遍历中的层级序号（从 0 开始）。
   * 层级由容器树结构派生，无需额外存储。
   * 找不到时返回 -1。
   */
  public getGlobalLayer(target: View): number {
    let index = 0
    function dfs(node: { children: View[] }): boolean {
      for (const child of node.children) {
        if (child === target) return true
        index++
        if (
          isContainerView(child) &&
          child.children.length > 0 &&
          dfs(child as unknown as { children: View[] })
        )
          return true
      }
      return false
    }
    return dfs(this) ? index : -1
  }

  // 层级管理代理
  public bringToFront(view: View): this {
    const changes = this.layerManager.bringToFront(view)
    this.transactionManager.recordReorder(changes)
    return this
  }

  public sendToBack(view: View): this {
    const changes = this.layerManager.sendToBack(view)
    this.transactionManager.recordReorder(changes)
    return this
  }

  public bringForward(view: View): this {
    const changes = this.layerManager.bringForward(view)
    this.transactionManager.recordReorder(changes)
    return this
  }

  public sendBackward(view: View): this {
    const changes = this.layerManager.sendBackward(view)
    this.transactionManager.recordReorder(changes)
    return this
  }

  // ==================== 组合/取消组合 ====================

  /**
   * 将多个 View 组合为一个 CombinedView。
   * 组合后的 CombinedView 插入到原最高层级 View 的位置。
   */
  public group(views: View[]): View | null {
    const combined = new CombinedView({})
    const result = groupViews(views, combined, this.camera.viewProjectionMatrix)
    if (!result) return null

    // 录入操作栈
    this.transactionManager.recordAdd(this.id, result.combined, result.insertIndex)
    return result.combined
  }

  /**
   * 取消组合：将 CombinedView 解散，其子 View 回到 Scene 的 children 中。
   * 子 View 插入到 CombinedView 原来的位置。
   */
  public ungroup(view: View): View[] | null {
    if (!isCombinedView(view)) return null

    const result = ungroupView(view, this.camera.viewProjectionMatrix)
    if (!result) return null

    // 录入操作栈
    this.transactionManager.recordRemove(this.id, view, result.index)
    return result.children
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
    }
  }

  /**
   * 通过 id 查找容器节点（可能是 Scene 自身或嵌套的 View）
   * 供 DiffApplier 回放 ReorderDiff 时定位 parent
   */
  private findContainerById(id: string): { children: View[] } | undefined {
    if (id === this.id) return this
    // 在整棵树中查找，只有 ContainerView 才有 children
    const view = this.findViewById(id)
    if (view && isContainerView(view)) return view as unknown as { children: View[] }
    return undefined
  }

  /**
   * 从纯数据对象恢复 Scene 实例。
   * data.camera 和 data.children 应由 Serializer 预先解析为实例后传入。
   */
  static fromJSON(data: any): Scene {
    // data.camera 已经由递归反序列化恢复为 BaseCamera 实例
    const scene = new Scene(data.camera, {
      lifetimes: data.lifetimes ?? undefined,
    })
    scene.id = data.id
    if (data.data) scene.data = data.data
    if (data.children) {
      data.children.forEach((child: View) => {
        scene.addChild(child, false)
      })
    }
    return scene
  }
}
