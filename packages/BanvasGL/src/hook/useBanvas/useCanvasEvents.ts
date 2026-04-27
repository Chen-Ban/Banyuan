import { useCallback, useEffect, useMemo, useRef } from 'react'
import { App } from '@/core/app'
import {
    Point3,
    Rectangle,
    Scene,
    View,
    SelectBoxView,
    isNonPrintableTextElement,
    isPrintableTextElement,
    Graph,
    GraphView,
    TextView,
    ImageView,
    Line,
    Circle,
    ImageElement,
    TextParagraph,
    Style,
    TextFields,
} from '@/core'
import { isTextView, isSelectBoxView } from '@/core/interfaces'
import { clearAllStates } from '@/core/scene/ViewTree'
import { ViewAddonImpl } from '@/core/views/addon'
import type { ExtraData } from '@/core/interfaces'
import { Action, Cursor } from '@/core/interfaces'
import { InteractionDispatcher } from './InteractionDispatcher'
import type { InteractionContext } from './InteractionDispatcher'

/** 将 MouseEvent 转为 canvas 物理像素坐标 */
const event2Point = (e: MouseEvent): Point3 => {
    const ratio = window.devicePixelRatio
    const { offsetX, offsetY } = e
    return new Point3(offsetX * ratio, offsetY * ratio, 0)
}

export interface UseCanvasEventsOptions {
    app: App | null
    canvasRef: React.RefObject<HTMLCanvasElement | null>
    inputRef: React.RefObject<HTMLInputElement | null>
    setSelectedViewId: (id: string) => void
}

/**
 * Canvas 事件绑定
 */
export function useCanvasEvents({
    app,
    canvasRef,
    inputRef,
    setSelectedViewId,
}: UseCanvasEventsOptions) {
    const mouseDownPointRef = useRef<Point3 | null>(null)
    const lastPointRef = useRef<Point3 | null>(null)
    const mouseUpPointRef = useRef<Point3 | null>(null)
    const indicateViewRef = useRef<View | null>(null)
    const indicateContentRef = useRef<Graph | ViewAddonImpl | null>(null)
    const actionRef = useRef<Action>(Action.NONE)
    const extraDataRef = useRef<ExtraData | null>(null)
    const lastClickTimeRef = useRef<number | undefined>(undefined)
    const selectionRectViewRef = useRef<SelectBoxView | null>(null)

    // 创建 InteractionDispatcher 实例（依赖注入 ref 读取器和 DOM/React 回调）
    const dispatcher = useMemo(() => {
        const ctx: InteractionContext = {
            getIndicateView: () => indicateViewRef.current,
            getIndicateContent: () => indicateContentRef.current,
            getLastPoint: () => lastPointRef.current,
            getExtraData: () => extraDataRef.current,
            getSelectionRectView: () => selectionRectViewRef.current,
            setCursor: (cursor: Cursor) => {
                if (canvasRef.current) {
                    canvasRef.current.style.cursor = cursor
                }
            },
            selectView: (scene: Scene, view: View) => {
                scene.select(view)
                setSelectedViewId(view.id)
            },
            clearSelection: (scene: Scene) => {
                clearAllStates(scene)
            },
            setSelectedViewId,
        }
        return new InteractionDispatcher(ctx)
    }, [canvasRef, setSelectedViewId])

    // 鼠标落下，判定操作类型
    const onMouseDown = useCallback(
        async (e: MouseEvent) => {
            if (!app) return
            const scene = app.getCurrentScene()
            if (!scene) return
            mouseDownPointRef.current = event2Point(e)
            // 如果在普通移动过程中未找到候选节点，则设置操作类型为框选
            if (!indicateViewRef.current && !indicateContentRef.current) {
                actionRef.current = Action.SELECT
                // 创建临时框选矩形容器
                selectionRectViewRef.current = new SelectBoxView({
                    style: {
                        width: canvasRef.current?.width,
                        height: canvasRef.current?.height,
                    },
                })
                scene.addChild(selectionRectViewRef.current)
            }
        },
        [app]
    )

    const handleMouseMoveWithAction = useCallback(
        (e: MouseEvent, scene: Scene, point: Point3, mousDownPoint: Point3) => {
            dispatcher.dispatch(actionRef.current, e, scene, point, mousDownPoint)
            lastPointRef.current = point
        },
        [dispatcher]
    )

    const handleMouseMoveHover = useCallback(
        (scene: Scene, point: Point3) => {
            if (!canvasRef.current) return
            let selected = false
            for (const view of scene.children) {
                const {
                    view: _view,
                    content,
                    extraData: _extraData,
                } = view.interact(point)
                if (_view && content && _extraData) {
                    indicateViewRef.current = _view as View
                    indicateContentRef.current = content
                    actionRef.current = _extraData.action
                    extraDataRef.current = _extraData
                    canvasRef.current.style.cursor = _extraData.cursorStyle
                    selected = true
                }
            }
            if (!selected) {
                indicateViewRef.current =
                    indicateContentRef.current =
                    extraDataRef.current =
                        null
                actionRef.current = Action.NONE
                canvasRef.current.style.cursor = Cursor.Default
            }
        },
        [canvasRef]
    )

    // 鼠标移动
    const onMouseMove = useCallback(
        (e: MouseEvent) => {
            if (!app || !canvasRef.current) return
            const scene = app.getCurrentScene()
            if (!scene) return

            const point = event2Point(e)
            const mousDownPoint = mouseDownPointRef.current

            if (mousDownPoint) {
                handleMouseMoveWithAction(e, scene, point, mousDownPoint)
            } else {
                handleMouseMoveHover(scene, point)
            }
        },
        [app, canvasRef, handleMouseMoveHover, handleMouseMoveWithAction]
    )

    const onMouseLeave = useCallback(() => {
        if (!app || !canvasRef.current) return
        const scene = app.getCurrentScene()
        if (!scene || !selectionRectViewRef.current) return

        // 删除所有框选容器
        const selectBoxViews: View[] = []
        for (const view of scene.children) {
            if (isSelectBoxView(view)) {
                selectBoxViews.push(view)
            }
        }
        for (const selectBoxView of selectBoxViews) {
            scene.removeChild(selectBoxView)
        }
        selectionRectViewRef.current = null
    }, [app, canvasRef])

    const onClick = useCallback(
        (e: MouseEvent) => {
            if (!app || !canvasRef.current) return
            const scene = app.getCurrentScene()
            if (!scene) return

            const mousDownPoint = mouseDownPointRef.current
            const mouseUpPoint = mouseUpPointRef.current
            if (!mousDownPoint || !mouseUpPoint) return

            // 只有单击时才处理
            if (mousDownPoint.isSame(mouseUpPoint)) {
                const indicateView = indicateViewRef.current
                if (indicateView) {
                    if (
                        isTextView(indicateView) &&
                        indicateContentRef.current instanceof Array &&
                        (isPrintableTextElement(
                            indicateContentRef.current[0]
                        ) ||
                            isNonPrintableTextElement(
                                indicateContentRef.current[0]
                            ))
                    ) {
                        const fixedIndex = indicateView.element2Index(
                            indicateContentRef.current[0],
                            mousDownPoint
                        )
                        indicateView.setSelection(fixedIndex, fixedIndex)

                        // 将输入框移动到选中的 textElement 下方
                        const bounds = indicateContentRef.current[0].bounds

                        // 将相对坐标转换为世界坐标
                        const worldMatrix = indicateView.getWorldMatrix()
                        // 获取 textElement 左下角的世界坐标
                        const relativeBottomLeft = new Point3(
                            bounds.x,
                            bounds.y + bounds.height,
                            0
                        )
                        const worldBottomLeft =
                            worldMatrix.multiply(relativeBottomLeft)
                        // 移动输入框到该位置下方
                        const input = inputRef.current
                        const layoutBounds = indicateView.layoutArea
                        if (input && layoutBounds) {
                            input.style.left = `${worldBottomLeft.x}px`
                            input.style.top = `${worldBottomLeft.y}px`
                            input.style.width = `${layoutBounds.width}px`
                            input.style.height = `16px`
                            input.style.display = 'block'
                            input.focus()
                            input.value =
                                indicateView.getContentText()[fixedIndex[0]]
                            input.selectionStart = fixedIndex[1] + fixedIndex[2]
                            input.selectionEnd = fixedIndex[1] + fixedIndex[2]
                        }
                    }
                    scene.select(indicateView, e.ctrlKey)
                    setSelectedViewId(indicateView.id)
                } else {
                    clearAllStates(scene)
                    // 隐藏输入框
                    const input = inputRef.current
                    if (input) {
                        input.style.display = 'none'
                    }
                    setSelectedViewId('')
                }
                lastClickTimeRef.current = Date.now()
            }

            onMouseLeave()

            mouseDownPointRef.current = null
            lastPointRef.current = null
            mouseUpPointRef.current = null
            lastClickTimeRef.current = 0
            if (actionRef.current === Action.SELECT) {
                canvasRef.current.style.cursor = Cursor.Default
            }
            actionRef.current = Action.NONE
        },
        [app, canvasRef, inputRef, onMouseLeave]
    )

    // 鼠标抬起，记录抬起点
    const onMouseUp = useCallback(
        (e: MouseEvent) => {
            mouseUpPointRef.current = event2Point(e)
            if (e.ctrlKey) {
                onClick(e)
            }
        },
        [onClick]
    )

    // 双击事件处理
    const onDoubleClick = useCallback(
        (e: MouseEvent) => {
            if (!app || !canvasRef.current) return
            const scene = app.getCurrentScene()
            if (!scene) return

            const mousDownPoint = mouseDownPointRef.current
            const mouseUpPoint = mouseUpPointRef.current
            if (!mousDownPoint || !mouseUpPoint) return

            // 双击事件处理
            if (
                mousDownPoint.isSame(mouseUpPoint) &&
                lastClickTimeRef.current &&
                Date.now() - lastClickTimeRef.current < 300
            ) {
                if (
                    isTextView(indicateViewRef.current) &&
                    (isPrintableTextElement(indicateContentRef.current) ||
                        isNonPrintableTextElement(indicateContentRef.current))
                ) {
                    console.log('选中一整行')
                    // 这里可以添加更多双击相关的逻辑
                }
            }
        },
        [app, canvasRef]
    )

    const onWheel = useCallback((e: WheelEvent) => {
        // 阻止页面滚动
        e.preventDefault()
    }, [])

    const onContextMenu = useCallback((e: MouseEvent) => {
        e.preventDefault()
    }, [])

    // 拖拽事件
    const onDragOver = useCallback((e: DragEvent) => {
        e.preventDefault()
    }, [])

    const onDrop = useCallback(
        (e: DragEvent) => {
            e.preventDefault()
            if (!app || !canvasRef.current) return
            const scene = app.getCurrentScene()
            if (!scene) return

            try {
                // 获取拖拽数据
                if (!e.dataTransfer) return
                const dataStr = e.dataTransfer.getData('application/json')
                if (!dataStr) return

                const dragData = JSON.parse(dataStr) as {
                    viewType: 'GraphView' | 'TextView' | 'ImageView'
                    graphType?: 'Line' | 'Circle' | 'Rectangle'
                    constructorParams: any
                }
                const { viewType, graphType, constructorParams } = dragData

                // 获取拖拽位置（相对于 canvas）
                const rect = canvasRef.current.getBoundingClientRect()
                const ratio = window.devicePixelRatio
                const x = (e.clientX - rect.left) * ratio
                const y = (e.clientY - rect.top) * ratio

                let newView: View | null = null

                // 根据 viewType 创建对应的 view
                if (viewType === 'GraphView') {
                    let graph: Graph | null = null

                    // 根据 graphType 创建对应的 graph
                    if (graphType === 'Line') {
                        const end = new Point3(50, 50, 0)
                        graph = new Line(
                            new Point3(0, 0, 0),
                            end,
                            Style.DEFAULT
                        )
                    } else if (graphType === 'Circle') {
                        const { radius } = constructorParams

                        graph = new Circle(
                            new Point3(radius, radius, 0),
                            radius || 50,
                            Style.DEFAULT
                        )
                    } else if (graphType === 'Rectangle') {
                        const { width, height } = constructorParams
                        // 使用 dropPoint 作为矩形左上角
                        graph = new Rectangle(
                            0,
                            0,
                            width || 100,
                            height || 100,
                            Style.DEFAULT
                        )
                    }

                    if (graph) {
                        newView = new GraphView(graph, {
                            style: {
                                width: graph.bounds.width,
                                height: graph.bounds.height,
                            },
                        }).translate(x, y, 0)
                    }
                } else if (viewType === 'TextView') {
                    const { text } = constructorParams
                    const textParagraph = TextParagraph.simple(text || '文本')
                    const textFields = new TextFields([textParagraph])
                    newView = new TextView(textFields, {
                        style: {
                            width: 200,
                            height: 24,
                        },
                        shouldLayout: true,
                    }).translate(x, y, 0)
                } else if (viewType === 'ImageView') {
                    const { imageSrc } = constructorParams
                    const width = 200
                    const height = 300
                    // 使用 dropPoint 作为图片左上角
                    const imageElement = new ImageElement(
                        imageSrc || '',
                        0,
                        0,
                        width,
                        height,
                        Style.DEFAULT
                    )
                    newView = new ImageView(imageElement, {
                        style: {
                            width,
                            height,
                        },
                    }).translate(x, y, 0)
                }

                // 将新创建的 view 添加到场景中
                if (newView) {
                    scene.addChild(newView)
                    scene.select(newView)
                    setSelectedViewId(newView.id)
                }
            } catch (error) {
                console.error('拖拽创建组件失败:', error)
            }
        },
        [app, canvasRef]
    )

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas || !app) return

        canvas.addEventListener('mousedown', onMouseDown, { passive: true })
        canvas.addEventListener('mousemove', onMouseMove, { passive: true })
        canvas.addEventListener('click', onClick, { passive: true })
        canvas.addEventListener('dblclick', onDoubleClick, { passive: true })
        canvas.addEventListener('mouseup', onMouseUp, { passive: true })
        canvas.addEventListener('mouseleave', onMouseLeave, { passive: true })
        canvas.addEventListener('wheel', onWheel, { passive: false })
        canvas.addEventListener('contextmenu', onContextMenu, {
            passive: false,
        })
        canvas.addEventListener('dragover', onDragOver)
        canvas.addEventListener('drop', onDrop)

        return () => {
            canvas.removeEventListener('mousedown', onMouseDown as any)
            canvas.removeEventListener('mousemove', onMouseMove as any)
            canvas.removeEventListener('mouseup', onMouseUp as any)
            canvas.removeEventListener('click', onClick as any)
            canvas.removeEventListener('dblclick', onDoubleClick as any)
            canvas.removeEventListener('wheel', onWheel as any)
            canvas.removeEventListener('contextmenu', onContextMenu as any)
            canvas.removeEventListener('dragover', onDragOver as any)
            canvas.removeEventListener('drop', onDrop as any)
        }
    }, [
        app,
        canvasRef,
        onMouseDown,
        onMouseMove,
        onMouseUp,
        onMouseLeave,
        onClick,
        onDoubleClick,
        onWheel,
        onContextMenu,
        onDragOver,
        onDrop,
    ])
}
