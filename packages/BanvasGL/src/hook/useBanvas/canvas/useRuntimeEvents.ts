/**
 * useRuntimeEvents —— 预览/运行模式下的 canvas 事件处理
 *
 * 与 useCanvasEvents（编辑模式）完全独立，互不干扰。
 * 命中 View 后读取对应的 FlowSchema，构建 RuntimeContext，交由 FlowRunner 执行。
 *
 * 当前实现覆盖：
 *   onClick / onDoubleClick / onContextMenu
 *   onMouseDown / onMouseUp / onMouseMove / onMouseEnter / onMouseLeave
 *   onDragStart / onDrag / onDragEnd
 *
 * 拖拽判断：mousedown 后移动超过 DRAG_THRESHOLD 像素视为拖拽开始。
 */

import { useCallback, useEffect, useRef } from 'react'
import type { App } from '@/core/app'
import { Point3 } from '@/core/math'
import type View from '@/core/views/View/View'
import type Scene from '@/core/scene/Scene'
import { FlowRunner } from '@/core/runtime/FlowRunner'
import type { RuntimeContext } from '@/core/runtime/RuntimeContext'
import type { FlowSchema } from '@/core/interfaces'

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

/** 构建 RuntimeContext */
function buildCtx(self: View, scene: Scene, eventArgs: unknown[]): RuntimeContext {
    return {
        self,
        page: scene,
        view: (id) => scene.findViewById(id) as View | null,
        eventArgs,
    }
}

/** 触发 FlowSchema（schema 为 null 时静默跳过） */
function trigger(schema: FlowSchema | null, ctx: RuntimeContext): void {
    if (!schema) return
    FlowRunner.run(schema, ctx).catch((err) => {
        console.error('[FlowRunner] 运行时事件执行出错:', err)
    })
}

export interface UseRuntimeEventsOptions {
    app: App | null
    canvasRef: React.RefObject<HTMLCanvasElement | null>
}

export function useRuntimeEvents({ app, canvasRef }: UseRuntimeEventsOptions) {
    // 鼠标按下时的坐标（用于判断 click / drag）
    const mouseDownPointRef = useRef<Point3 | null>(null)
    // 上一帧鼠标坐标（用于 onDrag）
    const lastPointRef = useRef<Point3 | null>(null)
    // 是否已进入拖拽状态
    const isDraggingRef = useRef(false)
    // 拖拽中命中的 View
    const dragViewRef = useRef<View | null>(null)
    // 上一次 hover 的 View（用于 onMouseEnter / onMouseLeave）
    const hoverViewRef = useRef<View | null>(null)
    // 上一次点击时间（用于 onDoubleClick 判断）
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

        trigger(view.events.onMouseDown, buildCtx(view, scene, [e]))
    }, [app, canvasRef])

    // ── mousemove ──
    const onMouseMove = useCallback((e: MouseEvent) => {
        if (!app || !canvasRef.current) return
        const scene = app.getCurrentScene()
        if (!scene) return

        const point = event2Point(e)
        const downPoint = mouseDownPointRef.current

        // ── hover（onMouseEnter / onMouseLeave / onMouseMove）──
        const currentHover = hitTest(scene, point)

        if (currentHover !== hoverViewRef.current) {
            // 离开旧 View
            if (hoverViewRef.current) {
                trigger(
                    hoverViewRef.current.events.onMouseLeave,
                    buildCtx(hoverViewRef.current, scene, [e]),
                )
            }
            // 进入新 View
            if (currentHover) {
                trigger(
                    currentHover.events.onMouseEnter,
                    buildCtx(currentHover, scene, [e]),
                )
            }
            hoverViewRef.current = currentHover
        }

        if (currentHover) {
            trigger(currentHover.events.onMouseMove, buildCtx(currentHover, scene, [e]))
        }

        // ── 拖拽判断 ──
        if (downPoint) {
            const dx = point.x - downPoint.x
            const dy = point.y - downPoint.y
            const dist = Math.sqrt(dx * dx + dy * dy)

            if (!isDraggingRef.current && dist >= DRAG_THRESHOLD) {
                // 拖拽开始
                isDraggingRef.current = true
                const view = hitTest(scene, downPoint)
                dragViewRef.current = view
                if (view) {
                    trigger(view.events.onDragStart, buildCtx(view, scene, [e]))
                }
            }

            if (isDraggingRef.current && dragViewRef.current) {
                trigger(
                    dragViewRef.current.events.onDrag,
                    buildCtx(dragViewRef.current, scene, [e]),
                )
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
            trigger(view.events.onMouseUp, buildCtx(view, scene, [e]))
        }

        // 拖拽结束
        if (isDraggingRef.current && dragViewRef.current) {
            trigger(
                dragViewRef.current.events.onDragEnd,
                buildCtx(dragViewRef.current, scene, [e]),
            )
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

        // 拖拽过程中不触发 click
        if (isDraggingRef.current) return

        const point = event2Point(e)
        const view = hitTest(scene, point)
        if (!view) return

        const now = Date.now()

        // onDoubleClick：两次点击间隔 < 300ms
        if (lastClickTimeRef.current && now - lastClickTimeRef.current < 300) {
            trigger(view.events.onDoubleClick, buildCtx(view, scene, [e]))
            lastClickTimeRef.current = undefined
            return
        }

        lastClickTimeRef.current = now
        trigger(view.events.onClick, buildCtx(view, scene, [e]))
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

        trigger(view.events.onContextMenu, buildCtx(view, scene, [e]))
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
            canvas.removeEventListener('mousedown',   onMouseDown   as any)
            canvas.removeEventListener('mousemove',   onMouseMove   as any)
            canvas.removeEventListener('mouseup',     onMouseUp     as any)
            canvas.removeEventListener('click',       onClick       as any)
            canvas.removeEventListener('contextmenu', onContextMenu as any)
        }
    }, [app, canvasRef, onMouseDown, onMouseMove, onMouseUp, onClick, onContextMenu])
}
