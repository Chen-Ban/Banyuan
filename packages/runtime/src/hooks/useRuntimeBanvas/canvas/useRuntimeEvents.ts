/**
 * useRuntimeEvents —— 运行模式下的 canvas 事件处理
 *
 * 命中 View 后读取对应的 FlowSchema，构建 RuntimeContext，交由 FlowRunner 执行。
 *
 * 覆盖：
 *   onClick / onDoubleClick / onContextMenu
 *   onMouseDown / onMouseUp / onMouseMove / onMouseEnter / onMouseLeave
 *   onDragStart / onDrag / onDragEnd
 *
 * 拖拽判断：mousedown 后移动超过 DRAG_THRESHOLD 像素视为拖拽开始。
 */

import { useCallback, useEffect, useRef } from 'react'
import { Point3 } from 'banvasgl'
import type { App, View, Scene, FlowSchema } from 'banvasgl'

// 拖拽判定阈值（物理像素）
const DRAG_THRESHOLD = 4

/** 将 MouseEvent 转为 canvas 物理像素坐标 */
const event2Point = (e: MouseEvent): Point3 => {
    const ratio = window.devicePixelRatio
    return new Point3(e.offsetX * ratio, e.offsetY * ratio, 0)
}

/** 在 Scene 中命中检测，返回最顶层的 View（或 null） */
function hitTest(scene: Scene, point: Point3): View | null {
    let hit: View | null = null
    for (const view of scene.children) {
        const result = view.interact(point)
        if (result.view) hit = result.view as View
    }
    return hit
}

/** 触发 FlowSchema（schema 为 null 时静默跳过，委托给 Scene.triggerSchema） */
function trigger(schema: FlowSchema | null, view: View, scene: Scene, eventArgs: unknown[]): void {
    scene.triggerSchema(view, schema, eventArgs)
}

export interface UseRuntimeEventsOptions {
    app: App | null
    canvasRef: React.RefObject<HTMLCanvasElement | null>
}

export function useRuntimeEvents({ app, canvasRef }: UseRuntimeEventsOptions) {
    const mouseDownPointRef = useRef<Point3 | null>(null)
    const lastPointRef = useRef<Point3 | null>(null)
    const isDraggingRef = useRef(false)
    const dragViewRef = useRef<View | null>(null)
    const hoverViewRef = useRef<View | null>(null)
    const lastClickTimeRef = useRef<number | undefined>(undefined)

    // ── mousedown ──
    const onMouseDown = useCallback((e: MouseEvent) => {
        if (!app || !canvasRef.current) return
        const scene = app.getCurrentScene()
        if (!scene) return

        const point = event2Point(e)
        mouseDownPointRef.current = point
        lastPointRef.current = point
        isDraggingRef.current = false
        dragViewRef.current = null

        const view = hitTest(scene, point)
        if (!view) return

        trigger(view.events.onMouseDown, view, scene, [e])
    }, [app, canvasRef])

    // ── mousemove ──
    const onMouseMove = useCallback((e: MouseEvent) => {
        if (!app || !canvasRef.current) return
        const scene = app.getCurrentScene()
        if (!scene) return

        const point = event2Point(e)
        const downPoint = mouseDownPointRef.current

        // hover（onMouseEnter / onMouseLeave / onMouseMove）
        const currentHover = hitTest(scene, point)

        if (currentHover !== hoverViewRef.current) {
            if (hoverViewRef.current) {
                trigger(hoverViewRef.current.events.onMouseLeave, hoverViewRef.current, scene, [e])
            }
            if (currentHover) {
                trigger(currentHover.events.onMouseEnter, currentHover, scene, [e])
            }
            hoverViewRef.current = currentHover
        }

        if (currentHover) {
            trigger(currentHover.events.onMouseMove, currentHover, scene, [e])
        }

        // 拖拽判断
        if (downPoint) {
            const dx = point.x - downPoint.x
            const dy = point.y - downPoint.y
            const dist = Math.sqrt(dx * dx + dy * dy)

            if (!isDraggingRef.current && dist >= DRAG_THRESHOLD) {
                isDraggingRef.current = true
                const view = hitTest(scene, downPoint)
                dragViewRef.current = view
                if (view) {
                    trigger(view.events.onDragStart, view, scene, [e])
                }
            }

            if (isDraggingRef.current && dragViewRef.current) {
                trigger(dragViewRef.current.events.onDrag, dragViewRef.current, scene, [e])
            }
        }

        lastPointRef.current = point
    }, [app, canvasRef])

    // ── mouseup ──
    const onMouseUp = useCallback((e: MouseEvent) => {
        if (!app || !canvasRef.current) return
        const scene = app.getCurrentScene()
        if (!scene) return

        const point = event2Point(e)
        const view = hitTest(scene, point)

        if (view) {
            trigger(view.events.onMouseUp, view, scene, [e])
        }

        if (isDraggingRef.current && dragViewRef.current) {
            trigger(dragViewRef.current.events.onDragEnd, dragViewRef.current, scene, [e])
        }

        isDraggingRef.current = false
        dragViewRef.current = null
        mouseDownPointRef.current = null
        lastPointRef.current = null
    }, [app, canvasRef])

    // ── click ──
    const onClick = useCallback((e: MouseEvent) => {
        if (!app || !canvasRef.current) return
        const scene = app.getCurrentScene()
        if (!scene) return

        if (isDraggingRef.current) return

        const point = event2Point(e)
        const view = hitTest(scene, point)
        if (!view) return

        const now = Date.now()

        // onDoubleClick：两次点击间隔 < 300ms
        if (lastClickTimeRef.current && now - lastClickTimeRef.current < 300) {
            trigger(view.events.onDoubleClick, view, scene, [e])
            lastClickTimeRef.current = undefined
            return
        }

        lastClickTimeRef.current = now
        trigger(view.events.onClick, view, scene, [e])
    }, [app, canvasRef])

    // ── contextmenu ──
    const onContextMenu = useCallback((e: MouseEvent) => {
        e.preventDefault()
        if (!app || !canvasRef.current) return
        const scene = app.getCurrentScene()
        if (!scene) return

        const point = event2Point(e)
        const view = hitTest(scene, point)
        if (!view) return

        trigger(view.events.onContextMenu, view, scene, [e])
    }, [app, canvasRef])

    // ── 事件绑定 ──
    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas || !app) return

        canvas.addEventListener('mousedown',   onMouseDown,   { passive: true })
        canvas.addEventListener('mousemove',   onMouseMove,   { passive: true })
        canvas.addEventListener('mouseup',     onMouseUp,     { passive: true })
        canvas.addEventListener('click',       onClick,       { passive: true })
        canvas.addEventListener('contextmenu', onContextMenu, { passive: false })

        return () => {
            canvas.removeEventListener('mousedown',   onMouseDown   as EventListener)
            canvas.removeEventListener('mousemove',   onMouseMove   as EventListener)
            canvas.removeEventListener('mouseup',     onMouseUp     as EventListener)
            canvas.removeEventListener('click',       onClick       as EventListener)
            canvas.removeEventListener('contextmenu', onContextMenu as EventListener)
        }
    }, [app, canvasRef, onMouseDown, onMouseMove, onMouseUp, onClick, onContextMenu])
}
