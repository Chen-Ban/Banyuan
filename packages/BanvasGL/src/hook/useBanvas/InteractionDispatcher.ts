import { View, SelectBoxView } from '@/core/views'
import type Scene from '@/core/scene/Scene'
import { Point3 } from '@/core/math'
import { Action, Cursor, isTextView, isSelectBoxView, ExtraData, IViewAddon, IGraph } from '@/core/interfaces'
import { Rectangle, Graph } from '@/core/graph'
import { clearAllStates } from '@/core/scene/operations'
import Bounds from '@/core/graph/base/Bounds'
import { isNonPrintableTextElement, isPrintableTextElement } from '@/core/graph'

export interface InteractionContext {
    /** Get the current indicated (hovered) view */
    getIndicateView(): View | null
    /** Get the current indicated content */
    getIndicateContent(): IGraph | IViewAddon | null
    /** Get the last mouse point */
    getLastPoint(): Point3 | null
    /** Get extra data from the interact result */
    getExtraData(): ExtraData | null
    /** Get the selection rect view for box-select */
    getSelectionRectView(): SelectBoxView | null
    /** Set cursor style on the canvas */
    setCursor(cursor: Cursor): void
    /** Select a view in the scene and update React state */
    selectView(scene: Scene, view: View, setSelected: boolean): void
    /** Clear selection state */
    clearSelection(scene: Scene): void
}

export class InteractionDispatcher {
    constructor(private ctx: InteractionContext) {}

    /**
     * Dispatch based on action type
     */
    dispatch(
        action: Action,
        e: MouseEvent,
        scene: Scene,
        point: Point3,
        mouseDownPoint: Point3
    ): void {
        switch (action) {
            case Action.MOVE:
                return this.handleMove(scene, point, mouseDownPoint)
            case Action.TEXT_SELECTION:
                return this.handleTextSelection(scene, point)
            case Action.EDIT_POINT:
                return this.handleEditPoint(point, mouseDownPoint)
            case Action.RESIZE:
                return this.handleResize(e, scene, point, mouseDownPoint)
            case Action.ROTATE:
                return this.handleRotate(scene, point)
            case Action.SELECT:
                return this.handleBoxSelect(scene, point, mouseDownPoint)
            case Action.EDIT_VIEWPORT:
            case Action.NONE:
            default:
                return
        }
    }

    private handleMove(
        scene: Scene,
        point: Point3,
        mouseDownPoint: Point3
    ): void {
        const moveVector = point.subtract(
            this.ctx.getLastPoint() || mouseDownPoint
        )
        const indicateView = this.ctx.getIndicateView()
        if (!indicateView) return

        if (!indicateView.actived) {
            scene.select(indicateView)
        }

        // 先移动
        for (const activeView of scene.getAllActived()) {
            activeView.translate(moveVector.x, moveVector.y, 0)
        }

        // 再吸附（X/Y 轴独立）
        const result = scene.snapAlign.snap(indicateView)
        if (result.offsetX !== 0 || result.offsetY !== 0) {
            for (const activeView of scene.getAllActived()) {
                activeView.translate(result.offsetX, result.offsetY, 0)
            }
        }
    }

    private handleTextSelection(scene: Scene, point: Point3): void {
        const indicateView = this.ctx.getIndicateView()
        const indicateContent = this.ctx.getIndicateContent()
        if (
            isTextView(indicateView) &&
            (isPrintableTextElement(indicateContent) ||
                isNonPrintableTextElement(indicateContent))
        ) {
            // indicateView is now narrowed to ITextView & { readonly type: VIEWTYPE.TEXTVIEW }
            const { content } = indicateView.interact(point)
            if (!indicateView.actived) {
                scene.select(indicateView as unknown as View)
                const fixedIndex = indicateView.element2Index(
                    indicateContent,
                    point
                )
                indicateView.setSelection(fixedIndex, fixedIndex)
            }
            if (
                isPrintableTextElement(content) ||
                isNonPrintableTextElement(content)
            ) {
                const dynamicIndex = indicateView.element2Index(content, point)
                indicateView.setSelection(
                    indicateView.selection.fixedIndex,
                    dynamicIndex
                )
            }
        }
    }

    private handleEditPoint(point: Point3, mouseDownPoint: Point3): void {
        this.ctx.setCursor(Cursor.Grabbing)
        const extraData = this.ctx.getExtraData()
        if (extraData && extraData.action === Action.EDIT_POINT) {
            this.ctx.getIndicateView()?.editPoint(
                point,
                point.subtract(this.ctx.getLastPoint() || mouseDownPoint)
            )
        }
    }

    private handleResize(
        e: MouseEvent,
        scene: Scene,
        point: Point3,
        mouseDownPoint: Point3
    ): void {
        this.ctx.setCursor(Cursor.Grabbing)
        const extraData = this.ctx.getExtraData()
        if (extraData && extraData.action === Action.RESIZE) {
            const vector = point.subtract(
                this.ctx.getLastPoint() || mouseDownPoint
            )
            const { resizeFixedIndex, resizeDynamicIndex } = extraData
            scene.getAllActived().forEach((view) => {
                const fixedPoint =
                    view.boundingBox?.handles[resizeFixedIndex].getCenter()
                const dynamicPoint =
                    view.boundingBox?.handles[resizeDynamicIndex].getCenter()
                if (!fixedPoint || !dynamicPoint)
                    throw new Error('固定点或活动点不存在')
                view.resize(fixedPoint, dynamicPoint, vector, e.ctrlKey)
            })
        }
    }

    private handleRotate(scene: Scene, point: Point3): void {
        this.ctx.setCursor(Cursor.Grabbing)
        const indicateView = this.ctx.getIndicateView()
        const bounds = indicateView?.viewport
        const lastPoint = this.ctx.getLastPoint()

        if (bounds && lastPoint && indicateView) {
            const center = Rectangle.fromBounds(bounds).getCenter()
            const inverseMatrix = indicateView.getWorldMatrix().inverse()
            const lastVector = inverseMatrix
                .multiply(lastPoint)
                .subtract(center)
            const currentVector = inverseMatrix
                .multiply(point)
                .subtract(center)
            const dot =
                currentVector.dot(lastVector) /
                (currentVector.length * lastVector.length)
            const clampedDot = Math.max(-1, Math.min(1, dot))
            const sign = Math.sign(currentVector.cross(lastVector).z)
            const angle = Math.acos(clampedDot) * sign
            scene
                .getAllActived()
                .forEach((view) => view.rotate(0, 0, angle, center))
        }
    }

    private handleBoxSelect(
        scene: Scene,
        point: Point3,
        mouseDownPoint: Point3
    ): void {
        this.ctx.setCursor(Cursor.Crosshair)
        const selectionRectView = this.ctx.getSelectionRectView()
        if (selectionRectView && mouseDownPoint) {
            selectionRectView.updateSelect(mouseDownPoint, point)
            const selectionRect = selectionRectView.content
            const viewsToActivate: View[] = []
            const allViews = scene.children
            // 遍历所有视图，判断是否被框选命中（跳过 SelectBoxView 自身）
            for (const view of allViews) {
                if (isSelectBoxView(view)) continue
                const worldMatrix = view.getWorldMatrix()

                // 1. 检查框选矩形与 content（实际图形内容）的交点
                const content = view.content
                if (content) {
                    const transformedContent = content.transform(worldMatrix) as Graph
                    if (selectionRect.intersect(transformedContent).length > 0) {
                        viewsToActivate.push(view)
                        continue
                    }
                }

                // 2. 检查框选矩形与视口矩形（viewport）的交点
                const viewport = view.viewport ?? Bounds.empty()
                const viewportRect = Rectangle.fromBounds(viewport)
                const transformedViewport = viewportRect.transform(worldMatrix) as Graph
                if (selectionRect.intersect(transformedViewport).length > 0) {
                    viewsToActivate.push(view)
                    continue
                }

                // 3. 检查框选矩形是否完全包含视口矩形
                const vBounds = transformedViewport.bounds
                const center = new Point3(
                    vBounds.x + vBounds.width / 2,
                    vBounds.y + vBounds.height / 2,
                    0
                )
                if ((selectionRect as Rectangle).containsPoint(center)) {
                    viewsToActivate.push(view)
                }
            }
            clearAllStates(scene)
            for (const view of viewsToActivate) {
                scene.select(view, true)
            }
        }
    }
}
