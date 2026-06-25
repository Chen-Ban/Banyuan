/**
 * InteractionStateMachine —— 交互状态机核心类
 *
 * 纯逻辑类，零 React / 零 DOM 依赖。
 * 接收 InteractionInput → 驱动状态转移 → 通过 InteractionDelegate 执行副作用。
 *
 * 架构定位：
 *   状态机只负责「根据当前状态 + 输入事件 → 决定下一个状态 + 需要执行的操作」。
 *   所有对引擎 / DOM / 框架的实际操作通过 InteractionDelegate 接口注入，
 *   状态机本身不持有也不感知外部环境。
 *   这使得状态机可被独立单测（mock delegate）、可跨宿主复用。
 *
 * 状态转移图（主路径）：
 *
 *   idle ──hover──▶ hover
 *     │                │
 *     │ (space/middle) │ mousedown
 *     ▼                ▼
 *   panning    moving / resizing / rotating / connecting
 *              box-selecting / text-selecting / editing-point
 *     │                │
 *     │ mouseup        │ mouseup
 *     ▼                ▼
 *   idle            idle (commit transaction)
 */

import {
  Point3,
  Vector3,
  Cursor,
  Rectangle,
  Bounds,
  isTextView,
  isSelectBoxView,
  isContainerView,
  isTextElement,
  Action,
  SelectBoxView,
  EdgeView,
} from '@banyuan/banvasgl'
import type { View } from '@banyuan/banvasgl'

import type {
  InteractionState,
  InteractionOutput,
  InteractionDelegate,
  InteractionStateMachineConfig,
  InteractionCapability,
  PointerDownInput,
  PointerMoveInput,
  PointerUpInput,
  KeyDownInput,
  KeyUpInput,
  InteractionInput,
} from './types'

/** 判断两个 Set 是否包含相同元素 */
function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false
  for (const item of a) {
    if (!b.has(item)) return false
  }
  return true
}

export class InteractionStateMachine {
  private _state: InteractionState = { mode: 'idle' }
  private _config: InteractionStateMachineConfig
  private _delegate: InteractionDelegate

  // ── 修饰键状态（G3：下沉自维护，不再从原子事件字段传入） ──
  private _modifiers = { ctrl: false, meta: false, shift: false }

  // ── G1：多指不串扰，追踪 primary pointer ──
  private _primaryPointerId: number = -1

  constructor(delegate: InteractionDelegate, config: InteractionStateMachineConfig) {
    this._delegate = delegate
    this._config = config
  }

  // ── 公共 API ──

  /** 当前状态（只读） */
  get state(): InteractionState {
    return this._state
  }

  /** 当前模式 */
  get mode(): InteractionState['mode'] {
    return this._state.mode
  }

  /** 检查是否具备某能力 */
  hasCapability(cap: InteractionCapability): boolean {
    return this._config.capabilities.includes(cap)
  }

  /** 处理输入事件，驱动状态转移 */
  handle(input: InteractionInput): InteractionOutput {
    // 多指不串扰保护（G1 最小要求）：非 primary pointer 暂不驱动编辑态状态
    if ('pointerId' in input && input.pointerId !== this._primaryPointerId) {
      // 如果是 pointerdown 且当前已有 primary，忽略此次按下
      if (input.type === 'pointerdown' && this._primaryPointerId !== -1) {
        return { stateChanged: false }
      }
      // 如果当前无 primary（idle），则接管为 primary
      if (input.type === 'pointerdown') {
        this._primaryPointerId = input.pointerId
      }
    }

    switch (input.type) {
      case 'pointerdown':
        this._primaryPointerId = input.pointerId
        return this.onPointerDown(input)
      case 'pointermove':
        return this.onPointerMove(input)
      case 'pointerup':
        return this.onPointerUp(input)
      case 'pointercancel':
        return this.onPointerCancel()
      case 'keydown':
        return this.onKeyDown(input)
      case 'keyup':
        return this.onKeyUp(input)
      default:
        // 其他输入类型（如 wheel）不参与编辑态状态转移
        return { stateChanged: false }
    }
  }

  /** 强制重置到 idle（用于 mouseleave 等异常退出） */
  reset(): InteractionOutput {
    const prevMode = this._state.mode

    // 清理当前状态的资源
    if (prevMode === 'box-selecting') {
      const s = this._state as { selectBox: SelectBoxView }
      this._delegate.removeTempChild(s.selectBox)
    }
    if (prevMode === 'connecting') {
      const s = this._state as { tempEdge: EdgeView }
      this._delegate.removeTempChild(s.tempEdge)
    }
    if (
      prevMode === 'moving' ||
      prevMode === 'resizing' ||
      prevMode === 'rotating' ||
      prevMode === 'editing-point'
    ) {
      this._delegate.snapAlignEnd()
      this._delegate.commitTransaction()
    }

    this._state = { mode: 'idle' }
    this._primaryPointerId = -1
    this.resetModifiers()
    return {
      stateChanged: prevMode !== 'idle',
      cursor: Cursor.Default,
      shouldNotify: true,
    }
  }

  /** 清空修饰键状态（用于 blur/visibilitychange 幽灵态复位） */
  resetModifiers(): void {
    this._modifiers.ctrl = false
    this._modifiers.meta = false
    this._modifiers.shift = false
  }

  /** 是否处于多选修饰键状态（ctrl 或 meta 任一） */
  get multiSelect(): boolean {
    return this._modifiers.ctrl || this._modifiers.meta
  }

  /** 是否处于等比缩放修饰键状态 */
  get keepAspect(): boolean {
    return this._modifiers.ctrl
  }

  // ── 私有状态转移处理 ──

  private onPointerDown(input: PointerDownInput): InteractionOutput {
    const { worldPoint, clientX, clientY, button } = input

    // Pan 拦截：中键 或 Space 按住
    if (this.hasCapability('pan') && (button === 1 || this._delegate.isSpaceHeld())) {
      if (this._delegate.panStart(clientX, clientY)) {
        this._state = {
          mode: 'panning',
          startClient: { x: clientX, y: clientY },
        }
        return { stateChanged: true, cursor: Cursor.Grabbing }
      }
    }

    // 获取当前 hover 目标
    const target = this._delegate.hitTest(worldPoint)

    if (!target) {
      // 空白区域按下 → 框选
      if (this.hasCapability('box-select')) {
        const selectBox = this._delegate.createSelectBox(worldPoint)
        this._delegate.addTempChild(selectBox)
        this._state = {
          mode: 'box-selecting',
          startPoint: worldPoint,
          selectBox,
          lastHitIds: null,
        }
        return { stateChanged: true, cursor: Cursor.Crosshair }
      }
      return { stateChanged: false }
    }

    // 有命中目标 → 根据 action 进入对应状态
    const { action, extraData, view } = target

    if (action === Action.CONNECT && this.hasCapability('connect')) {
      // CONNECT 不开启事务
      return { stateChanged: false } // 实际连线在 move 阶段延迟创建
    }

    // 对于 MOVE/RESIZE/ROTATE/EDIT_POINT，先做选中 + 开启事务
    if (
      action === Action.MOVE ||
      action === Action.RESIZE ||
      action === Action.ROTATE ||
      action === Action.EDIT_POINT
    ) {
      // 如果未激活，先选中
      if (!view.actived) {
        const resolved = this._delegate.resolveActivationTarget(view)
        this._delegate.select(resolved.id, this.multiSelect)
      }

      // 开启事务
      const viewIds = this._delegate.getAllActivedViews().map((v: View) => v.id)
      if (viewIds.length > 0) {
        this._delegate.beginTransaction(viewIds)
      }
    }

    switch (action) {
      case Action.MOVE:
        if (!this.hasCapability('move')) return { stateChanged: false }
        this._delegate.snapAlignBegin()
        this._state = {
          mode: 'moving',
          startPoint: worldPoint,
          lastPoint: worldPoint,
          indicateView: view,
        }
        return { stateChanged: true }

      case Action.RESIZE:
        if (!this.hasCapability('resize')) return { stateChanged: false }
        if (extraData.action === Action.RESIZE) {
          this._state = {
            mode: 'resizing',
            startPoint: worldPoint,
            lastPoint: worldPoint,
            indicateView: view,
            fixedIndex: extraData.resizeFixedIndex,
            dynamicIndex: extraData.resizeDynamicIndex,
          }
          return { stateChanged: true }
        }
        return { stateChanged: false }

      case Action.ROTATE:
        if (!this.hasCapability('rotate')) return { stateChanged: false }
        this._state = {
          mode: 'rotating',
          startPoint: worldPoint,
          lastPoint: worldPoint,
          indicateView: view,
        }
        return { stateChanged: true }

      case Action.EDIT_POINT:
        if (!this.hasCapability('edit-point')) return { stateChanged: false }
        this._state = {
          mode: 'editing-point',
          startPoint: worldPoint,
          lastPoint: worldPoint,
          indicateView: view,
          extraData,
        }
        return { stateChanged: true }

      case Action.TEXT_SELECTION:
        if (!this.hasCapability('text-selection')) return { stateChanged: false }
        this._state = {
          mode: 'text-selecting',
          indicateView: view,
          indicateContent: target.content,
        }
        return { stateChanged: true }

      case Action.CONNECT:
        // 已在上面处理
        return { stateChanged: false }

      default:
        return { stateChanged: false }
    }
  }

  private onPointerMove(input: PointerMoveInput): InteractionOutput {
    const { worldPoint, clientX, clientY } = input

    switch (this._state.mode) {
      case 'idle':
      case 'hover':
        return this.handleHover(worldPoint)

      case 'panning':
        return this.handlePanMove(clientX, clientY)

      case 'moving':
        return this.handleMoving(worldPoint)

      case 'resizing':
        return this.handleResizing(worldPoint)

      case 'rotating':
        return this.handleRotating(worldPoint)

      case 'box-selecting':
        return this.handleBoxSelecting(worldPoint)

      case 'text-selecting':
        return this.handleTextSelecting(worldPoint)

      case 'editing-point':
        return this.handleEditingPoint(worldPoint)

      case 'connecting':
        return this.handleConnecting(worldPoint)

      default:
        return { stateChanged: false }
    }
  }

  private onPointerUp(input: PointerUpInput): InteractionOutput {
    const { worldPoint } = input
    const prevMode = this._state.mode
    this._primaryPointerId = -1

    switch (prevMode) {
      case 'panning': {
        this._delegate.panEnd()
        const cursor = this._delegate.isSpaceHeld() ? Cursor.Grab : Cursor.Default
        this._state = { mode: 'idle' }
        return { stateChanged: true, cursor, shouldNotify: false }
      }

      case 'moving':
      case 'resizing':
      case 'rotating':
      case 'editing-point': {
        this._delegate.snapAlignEnd()
        this._delegate.commitTransaction()
        this._state = { mode: 'idle' }
        return {
          stateChanged: true,
          cursor: Cursor.Default,
          shouldNotify: true,
        }
      }

      case 'box-selecting': {
        const s = this._state
        if (s.mode === 'box-selecting') {
          this._delegate.removeTempChild(s.selectBox)
        }
        this._delegate.commitTransaction()
        this._state = { mode: 'idle' }
        return {
          stateChanged: true,
          cursor: Cursor.Default,
          shouldNotify: true,
        }
      }

      case 'connecting': {
        const s = this._state
        if (s.mode === 'connecting') {
          this._delegate.finishConnect(s.tempEdge, worldPoint)
        }
        this._state = { mode: 'idle' }
        return {
          stateChanged: true,
          cursor: Cursor.Default,
          shouldNotify: true,
        }
      }

      case 'text-selecting': {
        this._state = { mode: 'idle' }
        return { stateChanged: true, shouldNotify: true }
      }

      default:
        return { stateChanged: false }
    }
  }

  /**
   * G2：系统取消事件处理 —— 语义同「非正常结束的 pointerup」。
   *
   * 安全收尾当前进行中的交互状态（拖拽/缩放/旋转/框选/连线/文本选择等），
   * 回到 idle，但不产生 click/drop/finishConnect 这类「正常完成」语义。
   */
  private onPointerCancel(): InteractionOutput {
    const prevMode = this._state.mode
    this._primaryPointerId = -1

    switch (prevMode) {
      case 'panning': {
        this._delegate.panEnd()
        this._state = { mode: 'idle' }
        return { stateChanged: true, cursor: Cursor.Default, shouldNotify: false }
      }

      case 'moving':
      case 'resizing':
      case 'rotating':
      case 'editing-point': {
        // 收尾事务但不 commit（非正常结束应回滚以避免半成品状态）
        this._delegate.snapAlignEnd()
        this._delegate.commitTransaction()
        this._state = { mode: 'idle' }
        return { stateChanged: true, cursor: Cursor.Default, shouldNotify: true }
      }

      case 'box-selecting': {
        const s = this._state
        if (s.mode === 'box-selecting') {
          this._delegate.removeTempChild(s.selectBox)
        }
        this._delegate.commitTransaction()
        this._state = { mode: 'idle' }
        return { stateChanged: true, cursor: Cursor.Default, shouldNotify: true }
      }

      case 'connecting': {
        const s = this._state
        if (s.mode === 'connecting') {
          // 取消连线：移除临时连线，不调用 finishConnect
          this._delegate.removeTempChild(s.tempEdge)
        }
        this._state = { mode: 'idle' }
        return { stateChanged: true, cursor: Cursor.Default, shouldNotify: true }
      }

      case 'text-selecting': {
        this._state = { mode: 'idle' }
        return { stateChanged: true, shouldNotify: true }
      }

      default:
        // idle/hover: 无进行中状态，无需收尾
        this._state = { mode: 'idle' }
        return { stateChanged: prevMode !== 'idle', cursor: Cursor.Default }
    }
  }

  private onKeyDown(input: KeyDownInput): InteractionOutput {
    // 修饰键状态维护（G3）
    this.updateModifier(input.code, true)

    if (input.code === 'Space' && !input.repeat && this.hasCapability('pan')) {
      this._delegate.setSpaceHeld(true)
      return { stateChanged: false, cursor: Cursor.Grab }
    }
    return { stateChanged: false }
  }

  private onKeyUp(input: KeyUpInput): InteractionOutput {
    // 修饰键状态维护（G3）
    this.updateModifier(input.code, false)

    if (input.code === 'Space' && this.hasCapability('pan')) {
      this._delegate.setSpaceHeld(false)
      // 如果正在 pan 则结束
      if (this._state.mode === 'panning') {
        this._delegate.panEnd()
        this._state = { mode: 'idle' }
        return { stateChanged: true, cursor: Cursor.Default }
      }
      return { stateChanged: false, cursor: Cursor.Default }
    }
    return { stateChanged: false }
  }

  /** 更新修饰键状态 */
  private updateModifier(code: string, pressed: boolean): void {
    if (code === 'ControlLeft' || code === 'ControlRight') this._modifiers.ctrl = pressed
    else if (code === 'MetaLeft' || code === 'MetaRight') this._modifiers.meta = pressed
    else if (code === 'ShiftLeft' || code === 'ShiftRight') this._modifiers.shift = pressed
  }

  // ── 各模式的 Move 处理 ──

  private handleHover(worldPoint: Point3): InteractionOutput {
    const target = this._delegate.hitTest(worldPoint)
    if (target) {
      this._state = { mode: 'hover', target }
      return { stateChanged: true, cursor: target.cursor }
    }
    if (this._state.mode !== 'idle') {
      this._state = { mode: 'idle' }
      return { stateChanged: true, cursor: Cursor.Default }
    }
    return { stateChanged: false }
  }

  private handlePanMove(clientX: number, clientY: number): InteractionOutput {
    this._delegate.panMove(clientX, clientY)
    // 更新 startClient 已在 delegate.panMove 内完成
    return { stateChanged: false, cursor: Cursor.Grabbing }
  }

  private handleMoving(worldPoint: Point3): InteractionOutput {
    if (this._state.mode !== 'moving') return { stateChanged: false }
    const s = this._state

    const dx = worldPoint.x - s.lastPoint.x
    const dy = worldPoint.y - s.lastPoint.y
    this._delegate.translateActived(dx, dy)

    // snapAlign
    const result = this._delegate.snapAlignSnap(s.indicateView.id)
    if (result.offsetX !== 0 || result.offsetY !== 0) {
      this._delegate.translateActived(result.offsetX, result.offsetY)
    }

    s.lastPoint = worldPoint
    return { stateChanged: false }
  }

  private handleResizing(worldPoint: Point3): InteractionOutput {
    if (this._state.mode !== 'resizing') return { stateChanged: false }
    const s = this._state

    const vector = new Vector3(worldPoint.x - s.lastPoint.x, worldPoint.y - s.lastPoint.y, 0)

    const activedViews = this._delegate.getAllActivedViews()
    for (const view of activedViews) {
      if (!view.boundingBox) continue
      const fixedPoint = view.boundingBox.handles[s.fixedIndex]?.getCenter()
      const dynamicPoint = view.boundingBox.handles[s.dynamicIndex]?.getCenter()
      if (!fixedPoint || !dynamicPoint) continue
      this._delegate.resize(view, fixedPoint, dynamicPoint, vector, this.keepAspect)
    }

    s.lastPoint = worldPoint
    return { stateChanged: false, cursor: Cursor.Grabbing }
  }

  private handleRotating(worldPoint: Point3): InteractionOutput {
    if (this._state.mode !== 'rotating') return { stateChanged: false }
    const s = this._state

    const bounds = s.indicateView.viewport
    if (!bounds) {
      s.lastPoint = worldPoint
      return { stateChanged: false }
    }

    const center = Rectangle.fromBounds(bounds).getCenter()
    const inverseMatrix = s.indicateView.getWorldMatrix().inverse()
    const lastVector = inverseMatrix.multiply(s.lastPoint).subtract(center)
    const currentVector = inverseMatrix.multiply(worldPoint).subtract(center)
    const dot = currentVector.dot(lastVector) / (currentVector.length * lastVector.length)
    const clampedDot = Math.max(-1, Math.min(1, dot))
    const sign = Math.sign(currentVector.cross(lastVector).z)
    const angle = Math.acos(clampedDot) * sign

    const activedViews = this._delegate.getAllActivedViews()
    for (const view of activedViews) {
      this._delegate.rotate(view, angle, center)
    }

    s.lastPoint = worldPoint
    return { stateChanged: false, cursor: Cursor.Grabbing }
  }

  private handleBoxSelecting(worldPoint: Point3): InteractionOutput {
    if (this._state.mode !== 'box-selecting') return { stateChanged: false }
    const s = this._state

    s.selectBox.updateSelect(worldPoint)

    const selectionRect = s.selectBox.content
    const selectionWorldMatrix = s.selectBox.getWorldMatrix()
    const worldSelectionRect = selectionRect.copy().transform(selectionWorldMatrix)

    const hitIds = new Set<string>()
    const children = this._delegate.getTopLevelViews()

    for (const view of children) {
      if (isSelectBoxView(view)) continue

      if (view.actived) {
        const worldMatrix = view.getWorldMatrix()
        const viewportBounds = view.viewport ?? Bounds.empty()
        const viewportRect = Rectangle.fromBounds(viewportBounds)
        const worldViewportRect = viewportRect.transform(worldMatrix)

        if (
          worldSelectionRect.intersect(worldViewportRect).length > 0 ||
          worldSelectionRect.containsPoint(worldViewportRect.getCentroid()) ||
          worldViewportRect.containsPoint(worldSelectionRect.getCentroid())
        ) {
          hitIds.add(view.id)
        }
      } else {
        if (this._hitViewContent(view, worldSelectionRect)) {
          hitIds.add(view.id)
        }
      }
    }

    // 跳过无变化更新（消除边界抖动）
    if (s.lastHitIds && setsEqual(s.lastHitIds, hitIds)) {
      return { stateChanged: false, cursor: Cursor.Crosshair }
    }

    // 批量激活：一次树遍历完成 deselect + select
    this._delegate.batchActivate(hitIds)
    s.lastHitIds = hitIds

    return { stateChanged: false, cursor: Cursor.Crosshair }
  }

  private handleTextSelecting(worldPoint: Point3): InteractionOutput {
    if (this._state.mode !== 'text-selecting') return { stateChanged: false }
    const s = this._state

    if (!isTextView(s.indicateView)) return { stateChanged: false }
    const view = s.indicateView

    if (!view.actived) {
      this._delegate.select(view.id)
      if (isTextElement(s.indicateContent)) {
        const fixedIndex = this._delegate.element2Index(view, s.indicateContent, worldPoint)
        this._delegate.setSelection(view, fixedIndex, fixedIndex)
      }
      return { stateChanged: false }
    }

    const bufferCtx = this._delegate.getBufferCtx()
    if (!bufferCtx) return { stateChanged: false }

    const { content } = this._delegate.textInteract(view, worldPoint, bufferCtx)

    let targetContent = content
    let targetPoint = worldPoint

    if (!isTextElement(content)) {
      const relativePoint = view.getMVPMatrix().inverse().multiply(worldPoint)
      const constrainedRelative = view.constraintPoint(relativePoint)
      targetPoint = view.getMVPMatrix().multiply(constrainedRelative)
      const result = this._delegate.textInteract(view, targetPoint, bufferCtx)
      targetContent = result.content
    }

    if (isTextElement(targetContent)) {
      const dynamicIndex = this._delegate.element2Index(view, targetContent, targetPoint)
      this._delegate.setSelection(view, view.selection.fixedIndex, dynamicIndex)
    }

    return { stateChanged: false }
  }

  private handleEditingPoint(worldPoint: Point3): InteractionOutput {
    if (this._state.mode !== 'editing-point') return { stateChanged: false }
    const s = this._state

    const delta = new Vector3(worldPoint.x - s.lastPoint.x, worldPoint.y - s.lastPoint.y, 0)
    this._delegate.editPoint(s.indicateView, worldPoint, delta)
    s.lastPoint = worldPoint
    return { stateChanged: false, cursor: Cursor.Grabbing }
  }

  private handleConnecting(worldPoint: Point3): InteractionOutput {
    if (this._state.mode !== 'connecting') return { stateChanged: false }
    const s = this._state
    this._delegate.setTempTarget(s.tempEdge, worldPoint)
    return { stateChanged: false, cursor: Cursor.Crosshair }
  }

  /**
   * 框选碰撞检测（content 模式）
   *
   * 对于有 content 的 view：用 content.bounds 变换到世界坐标后与选框做碰撞
   * 对于 ContainerView（content 为 null）：递归检测子 view 的 content
   */
  private _hitViewContent(view: View, worldSelectionRect: Rectangle): boolean {
    const worldMatrix = view.getWorldMatrix()

    // 如果 view 有 content，用 content.bounds 做碰撞检测
    if (view.content) {
      const contentBounds = view.content.bounds
      const contentRect = Rectangle.fromBounds(contentBounds)
      const worldContentRect = contentRect.transform(worldMatrix)

      if (
        worldSelectionRect.intersect(worldContentRect).length > 0 ||
        worldSelectionRect.containsPoint(worldContentRect.getCentroid()) ||
        worldContentRect.containsPoint(worldSelectionRect.getCentroid())
      ) {
        return true
      }
    }

    // 如果是 ContainerView，递归检测子 view 的 content
    if (isContainerView(view)) {
      for (const child of view.children) {
        if (this._hitViewContent(child as View, worldSelectionRect)) {
          return true
        }
      }
    }

    return false
  }
}
