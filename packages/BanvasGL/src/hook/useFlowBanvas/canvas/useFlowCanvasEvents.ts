import { useCallback, useEffect, useMemo, useRef } from 'react'
import { App } from '@/core/app'
import { Point3 } from '@/core/math'
import type { Scene } from '@/core/scene'
import { View } from '@/core/views'
import EdgeView from '@/core/views/flow/EdgeView'
import {
    Action,
    Cursor,
    ExtraData,
    IViewAddon,
    IGraph,
    IPortView,
    isPortView,
} from '@/core/interfaces'
import { clearAllStates } from '@/core/scene/operations'

/** 将 MouseEvent 转为 canvas 物理像素坐标 */
const event2Point = (e: MouseEvent): Point3 => {
    const ratio = window.devicePixelRatio
    const { offsetX, offsetY } = e
    return new Point3(offsetX * ratio, offsetY * ratio, 0)
}

export interface UseFlowCanvasEventsOptions {
    app: App | null
    canvasRef: React.RefObject<HTMLCanvasElement | null>
    /** 交互结束回调（移动/连线完成后触发，用于把变更写回 FlowSchema） */
    onInteractionEnd?: () => void
}

/**
 * 流程图画布事件绑定
 *
 * 精简版事件 hook，只支持：
 * - hover 光标切换
 * - 单击选中/取消选中
 * - MOVE（拖动节点）
 * - CONNECT（端口连线）
 *
 * 不包含：框选、文本编辑、事务/undo、右键菜单、拖拽创建、RESIZE/ROTATE/EDIT_POINT
 */
export function useFlowCanvasEvents({
    app,
    canvasRef,
    onInteractionEnd,
}: UseFlowCanvasEventsOptions) {
    const mouseDownPointRef = useRef<Point3 | null>(null)
    const lastPointRef = useRef<Point3 | null>(null)
    const indicateViewRef = useRef<View | null>(null)
    const indicateContentRef = useRef<IGraph | IViewAddon | null>(null)
    const actionRef = useRef<Action>(Action.NONE)
    const extraDataRef = useRef<ExtraData | null>(null)
    const tempEdgeRef = useRef<EdgeView | null>(null)

    // ── hover 检测 ──
    const handleHover = useCallback(
        (scene: Scene, point: Point3) => {
            if (!canvasRef.current || !app) return
            // 激活当前 App 的 CanvasContext 供 interact 命中检测使用
            app.renderer.activateContext()
            let hit = false
            for (const view of scene.children) {
                const { view: _view, content, extraData: _extraData } = view.interact(point)
                if (_view && content && _extraData) {
                    indicateViewRef.current = _view as View
                    indicateContentRef.current = content
                    actionRef.current = _extraData.action
                    extraDataRef.current = _extraData
                    canvasRef.current.style.cursor = _extraData.cursorStyle
                    hit = true
                }
            }
            app.renderer.deactivateContext()
            if (!hit) {
                indicateViewRef.current = null
                indicateContentRef.current = null
                extraDataRef.current = null
                actionRef.current = Action.NONE
                canvasRef.current.style.cursor = Cursor.Default
            }
        },
        [app, canvasRef],
    )

    // ── mousedown ──
    const onMouseDown = useCallback(
        (e: MouseEvent) => {
            if (!app) return
            const scene = app.getCurrentScene()
            if (!scene) return

            const point = event2Point(e)
            mouseDownPointRef.current = point
            lastPointRef.current = point

            const action = actionRef.current
            if (action === Action.CONNECT) {
                // 连线模式：什么都不做，等 mousemove 创建临时边
            } else if (action === Action.MOVE) {
                // 移动模式：选中当前 view
                const indicateView = indicateViewRef.current
                if (indicateView && !indicateView.actived) {
                    scene.select(indicateView)
                }
            } else if (!indicateViewRef.current) {
                // 点在空白区域：取消选中
                clearAllStates(scene)
            }
        },
        [app],
    )

    // ── mousemove ──
    const onMouseMove = useCallback(
        (e: MouseEvent) => {
            if (!app || !canvasRef.current) return
            const scene = app.getCurrentScene()
            if (!scene) return

            const point = event2Point(e)
            const mouseDownPoint = mouseDownPointRef.current

            if (!mouseDownPoint) {
                // 未按下，做 hover 检测
                handleHover(scene, point)
                return
            }

            // 按下后拖动
            const action = actionRef.current

            if (action === Action.MOVE) {
                // 移动节点
                const lastPoint = lastPointRef.current || mouseDownPoint
                const delta = point.subtract(lastPoint)
                const indicateView = indicateViewRef.current
                if (indicateView) {
                    if (!indicateView.actived) {
                        scene.select(indicateView)
                    }
                    for (const activeView of scene.getAllActived()) {
                        activeView.translate(delta.x, delta.y, 0)
                    }
                }
            } else if (action === Action.CONNECT) {
                // 连线
                canvasRef.current.style.cursor = Cursor.Crosshair
                const extraData = extraDataRef.current
                if (!extraData || extraData.action !== Action.CONNECT) return

                let edge = tempEdgeRef.current
                if (!edge) {
                    edge = new EdgeView({ fromPortId: extraData.portViewId })
                    scene.addChild(edge, false)
                    tempEdgeRef.current = edge
                }
                edge.setTempTarget(point)
            }

            lastPointRef.current = point
        },
        [app, canvasRef, handleHover],
    )

    // ── mouseup ──
    const onMouseUp = useCallback(
        (e: MouseEvent) => {
            if (!app) return
            const scene = app.getCurrentScene()
            if (!scene) return

            const upPoint = event2Point(e)
            const action = actionRef.current

            if (action === Action.CONNECT) {
                // 完成连线
                const edge = tempEdgeRef.current
                if (edge) {
                    let targetPortId: string | null = null
                    app.renderer.activateContext()

                    // 先找到起点端口（用于方向校验）
                    let fromPort: IPortView | null = null
                    outer: for (const v of scene.children) {
                        for (const child of v.children) {
                            if (isPortView(child) && child.id === edge.fromPortId) {
                                fromPort = child
                                break outer
                            }
                        }
                    }

                    // 遍历场景找合法目标端口
                    for (const view of scene.children) {
                        const { view: hit } = view.interact(upPoint)
                        if (!hit || !isPortView(hit)) continue
                        // 排除起点自身
                        if (hit.id === edge.fromPortId) continue

                        // 方向校验：只允许 output → input（或 input → output）
                        const fromDir = fromPort?.portDirection
                        const toDir = hit.portDirection
                        if (fromDir === 'output' && toDir !== 'input') continue
                        if (fromDir === 'input' && toDir !== 'output') continue
                        // bidirectional 端口可与任意方向连接，不做限制

                        // 同节点校验：禁止同一节点的端口互连
                        // 端口 ID 格式：${nodeId}_suffix，取最后一个 _ 之前的部分作为 nodeId
                        const fromNodeId = edge.fromPortId?.replace(/_[^_]+$/, '')
                        const toNodeId = hit.id.replace(/_[^_]+$/, '')
                        if (fromNodeId && fromNodeId === toNodeId) continue

                        targetPortId = hit.id
                        break
                    }
                    app.renderer.deactivateContext()

                    if (targetPortId && edge.fromPortId) {
                        scene.removeChild(edge, false)
                        edge.connect(edge.fromPortId, targetPortId)
                        scene.addChild(edge, false)
                    } else {
                        scene.removeChild(edge, false)
                    }
                    tempEdgeRef.current = null
                }
            }

            mouseDownPointRef.current = null
            lastPointRef.current = null

            // 交互结束，通知外部写回 schema
            if (action === Action.MOVE || action === Action.CONNECT) {
                onInteractionEnd?.()
            }
        },
        [app, onInteractionEnd],
    )

    // ── click（单击选中/取消选中） ──
    const onClick = useCallback(
        (e: MouseEvent) => {
            if (!app || !canvasRef.current) return
            const scene = app.getCurrentScene()
            if (!scene) return

            const point = event2Point(e)
            // 命中检测
            let hitView: View | null = null
            app.renderer.activateContext()
            for (const view of scene.children) {
                const { view: _view } = view.interact(point)
                if (_view) hitView = _view as View
            }
            app.renderer.deactivateContext()

            if (hitView) {
                scene.select(hitView, e.ctrlKey || e.metaKey)
            } else {
                clearAllStates(scene)
            }

            canvasRef.current.style.cursor = Cursor.Default
            actionRef.current = Action.NONE
        },
        [app, canvasRef],
    )

    // ── 绑定/解绑 ──
    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas || !app) return

        canvas.addEventListener('mousedown', onMouseDown, { passive: true })
        canvas.addEventListener('mousemove', onMouseMove, { passive: true })
        canvas.addEventListener('mouseup', onMouseUp, { passive: true })
        canvas.addEventListener('click', onClick, { passive: true })

        return () => {
            canvas.removeEventListener('mousedown', onMouseDown)
            canvas.removeEventListener('mousemove', onMouseMove)
            canvas.removeEventListener('mouseup', onMouseUp)
            canvas.removeEventListener('click', onClick)
        }
    }, [app, canvasRef, onMouseDown, onMouseMove, onMouseUp, onClick])
}
