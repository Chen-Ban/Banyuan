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

import { Point3 } from '@/foundation/math'
import Vector3 from '@/foundation/math/Vector3'
import { Action, Cursor } from '@/types/view/view'
import type View from '@/view/View/View'
import { isTextView, isSelectBoxView, isGraphType } from '@/types/guards'
import { GraphType } from '@/foundation/constants'
import { Rectangle } from '@/graph'
import Bounds from '@/graph/base/Bounds'

import type {
    InteractionState,
    InteractionInput,
    InteractionOutput,
    InteractionDelegate,
    InteractionStateMachineConfig,
    InteractionCapability,
    HoverTarget,
    PointerDownInput,
    PointerMoveInput,
    PointerUpInput,
    KeyDownInput,
    KeyUpInput,
} from '@/types/interaction'

export class InteractionStateMachine {
    private _state: InteractionState = { mode: 'idle' }
    private _config: InteractionStateMachineConfig
    private _delegate: InteractionDelegate

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
        switch (input.type) {
            case 'pointerdown':
                return this.onPointerDown(input)
            case 'pointermove':
                return this.onPointerMove(input)
            case 'pointerup':
                return this.onPointerUp(input)
            case 'keydown':
                return this.onKeyDown(input)
            case 'keyup':
                return this.onKeyUp(input)
        }
    }

    /** 强制重置到 idle（用于 mouseleave 等异常退出） */
    reset(): InteractionOutput {
        const prevMode = this._state.mode

        // 清理当前状态的资源
        if (prevMode === 'box-selecting') {
            const s = this._state as { selectBox: any }
            this._delegate.removeTempChild(s.selectBox)
        }
        if (prevMode === 'connecting') {
            const s = this._state as { tempEdge: any }
            this._delegate.removeTempChild(s.tempEdge)
        }
        if (prevMode === 'moving' || prevMode === 'resizing' || prevMode === 'rotating' || prevMode === 'editing-point') {
            this._delegate.snapAlignEnd()
            this._delegate.commitTransaction()
        }

        this._state = { mode: 'idle' }
        return { stateChanged: prevMode !== 'idle', cursor: Cursor.Default, shouldNotify: true }
    }

    // ── 私有状态转移处理 ──

    private onPointerDown(input: PointerDownInput): InteractionOutput {
        const { worldPoint, clientX, clientY, button, multiSelect } = input

        // Pan 拦截：中键 或 Space 按住
        if (this.hasCapability('pan') && (button === 1 || this._delegate.isSpaceHeld())) {
            if (this._delegate.panStart(clientX, clientY)) {
                this._state = { mode: 'panning', startClient: { x: clientX, y: clientY } }
                return { stateChanged: true, cursor: Cursor.Grabbing }
            }
        }

        // 获取当前 hover 目标
        const target = this._delegate.hitTest(worldPoint)

        if (!target) {
            // 空白区域按下 → 框选
            if (this.hasCapability('box-select')) {
                const selectBox = this._delegate.createSelectBox(worldPoint)
                this._delegate.addTempChild(selectBox as unknown as View)
                this._state = { mode: 'box-selecting', startPoint: worldPoint, selectBox }
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
                this._delegate.select(resolved.id, multiSelect)
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
        const { worldPoint, clientX, clientY, canvasWidth, canvasHeight, ctrlKey } = input

        switch (this._state.mode) {
            case 'idle':
            case 'hover':
                return this.handleHover(worldPoint)

            case 'panning':
                return this.handlePanMove(clientX, clientY, canvasWidth, canvasHeight)

            case 'moving':
                return this.handleMoving(worldPoint)

            case 'resizing':
                return this.handleResizing(worldPoint, ctrlKey)

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
                return { stateChanged: true, cursor: Cursor.Default, shouldNotify: true }
            }

            case 'box-selecting': {
                const s = this._state
                if (s.mode === 'box-selecting') {
                    this._delegate.removeTempChild(s.selectBox as unknown as View)
                }
                this._delegate.commitTransaction()
                this._state = { mode: 'idle' }
                return { stateChanged: true, cursor: Cursor.Default, shouldNotify: true }
            }

            case 'connecting': {
                const s = this._state
                if (s.mode === 'connecting') {
                    this._delegate.finishConnect(s.tempEdge, worldPoint)
                }
                this._state = { mode: 'idle' }
                return { stateChanged: true, cursor: Cursor.Default, shouldNotify: true }
            }

            case 'text-selecting': {
                this._state = { mode: 'idle' }
                return { stateChanged: true, shouldNotify: true }
            }

            default:
                return { stateChanged: false }
        }
    }

    private onKeyDown(input: KeyDownInput): InteractionOutput {
        if (input.code === 'Space' && !input.repeat && this.hasCapability('pan')) {
            this._delegate.setSpaceHeld(true)
            return { stateChanged: false, cursor: Cursor.Grab }
        }
        return { stateChanged: false }
    }

    private onKeyUp(input: KeyUpInput): InteractionOutput {
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

    private handlePanMove(clientX: number, clientY: number, canvasWidth: number, canvasHeight: number): InteractionOutput {
        this._delegate.panMove(clientX, clientY, canvasWidth, canvasHeight)
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

    private handleResizing(worldPoint: Point3, ctrlKey: boolean): InteractionOutput {
        if (this._state.mode !== 'resizing') return { stateChanged: false }
        const s = this._state

        const vector = new Vector3(
            worldPoint.x - s.lastPoint.x,
            worldPoint.y - s.lastPoint.y,
            0,
        )

        const activedViews = this._delegate.getAllActivedViews()
        for (const view of activedViews) {
            if (!view.boundingBox) continue
            const fixedPoint = view.boundingBox.handles[s.fixedIndex]?.getCenter()
            const dynamicPoint = view.boundingBox.handles[s.dynamicIndex]?.getCenter()
            if (!fixedPoint || !dynamicPoint) continue
            this._delegate.resize(view, fixedPoint, dynamicPoint, vector, ctrlKey)
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

        const viewsToActivate: View[] = []
        const children = this._delegate.getTopLevelViews()

        for (const view of children) {
            if (isSelectBoxView(view)) continue
            const worldMatrix = view.getWorldMatrix()

            if (!view.actived) {
                const contentBounds = view.content?.bounds
                if (!contentBounds) continue
                const contentRect = Rectangle.fromBounds(contentBounds)
                const worldContentRect = contentRect.transform(worldMatrix)
                if (worldSelectionRect.intersect(worldContentRect).length > 0) {
                    viewsToActivate.push(view)
                    continue
                }
            } else {
                const viewportBounds = view.viewport ?? Bounds.empty()
                const viewportRect = Rectangle.fromBounds(viewportBounds)
                const worldViewportRect = viewportRect.transform(worldMatrix)
                if (worldSelectionRect.intersect(worldViewportRect).length > 0) {
                    viewsToActivate.push(view)
                    continue
                }
            }

            // 兜底：框选矩形完全包含视口中心点时
            const vpBounds = view.viewport ?? Bounds.empty()
            const vpRect = Rectangle.fromBounds(vpBounds)
            const worldVpRect = vpRect.transform(worldMatrix)
            if (worldSelectionRect.containsPoint(worldVpRect.getCentroid())) {
                viewsToActivate.push(view)
            }
        }

        this._delegate.deselect()
        for (const view of viewsToActivate) {
            this._delegate.select(view.id, true)
        }

        return { stateChanged: false, cursor: Cursor.Crosshair }
    }

    private handleTextSelecting(worldPoint: Point3): InteractionOutput {
        if (this._state.mode !== 'text-selecting') return { stateChanged: false }
        const s = this._state

        if (!isTextView(s.indicateView)) return { stateChanged: false }
        const view = s.indicateView

        if (!view.actived) {
            this._delegate.select(view.id)
            const fixedIndex = this._delegate.element2Index(view, s.indicateContent, worldPoint)
            this._delegate.setSelection(view, fixedIndex, fixedIndex)
            return { stateChanged: false }
        }

        const bufferCtx = this._delegate.getBufferCtx()
        if (!bufferCtx) return { stateChanged: false }

        const { content } = this._delegate.textInteract(view, worldPoint, bufferCtx)

        let targetContent = content
        let targetPoint = worldPoint

        if (
            !isGraphType(content as any, GraphType.PRINTABLE_TEXTELEMENT) &&
            !isGraphType(content as any, GraphType.NONPRINTABLE_TEXTELEMENT)
        ) {
            const relativePoint = view.getMVPMatrix().inverse().multiply(worldPoint)
            const constrainedRelative = view.constraintPoint(relativePoint)
            targetPoint = view.getMVPMatrix().multiply(constrainedRelative)
            const result = this._delegate.textInteract(view, targetPoint, bufferCtx)
            targetContent = result.content
        }

        if (
            isGraphType(targetContent as any, GraphType.PRINTABLE_TEXTELEMENT) ||
            isGraphType(targetContent as any, GraphType.NONPRINTABLE_TEXTELEMENT)
        ) {
            const dynamicIndex = this._delegate.element2Index(view, targetContent!, targetPoint)
            this._delegate.setSelection(view, view.selection.fixedIndex, dynamicIndex)
        }

        return { stateChanged: false }
    }

    private handleEditingPoint(worldPoint: Point3): InteractionOutput {
        if (this._state.mode !== 'editing-point') return { stateChanged: false }
        const s = this._state

        const delta = new Vector3(
            worldPoint.x - s.lastPoint.x,
            worldPoint.y - s.lastPoint.y,
            0,
        )
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
}
