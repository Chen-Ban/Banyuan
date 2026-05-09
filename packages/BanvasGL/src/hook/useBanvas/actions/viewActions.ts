/**
 * View 级别操作
 *
 * 封装对单个 View 的增删改查、选中、层级、分组、属性、事件、生命周期等操作。
 */

import type {
    IViewActions,
    IComponentTemplate,
    IFieldSchema,
    IFieldSchemaMap,
    EventHandler,
    IViewEvents,
    IViewLifetimes,
} from '@/core/interfaces'
import type { App } from '@/core/app'
import { Point3 } from '@/core/math'
import { Style } from '@/core/style'
import {
    Line,
    Circle,
    RoundedRect,
    ImageElement,
    TextParagraph,
    TextFields,
    Graph,
} from '@/core/graph'
import {
    View,
    GraphView,
    TextView,
    ImageView,
} from '@/core/views'
import { VIEWTYPE, GRAPHTYPE } from '@/core/constants'
import { clearAllStates, flattenViewTree } from '@/core/scene/operations'
import { getProperty, setProperty, getPropertyCategory } from '@/core/propadapters'

/** 内部剪贴板（模块级单例） */
let clipboard: View | null = null

/** 获取当前剪贴板内容（供 contextMenu 判断是否可粘贴） */
export function getClipboard(): View | null {
    return clipboard
}

/**
 * 创建 ViewActions 实例
 */
export function createViewActions(
    getApp: () => App | null,
): IViewActions {
    const getScene = () => getApp()?.getCurrentScene() ?? null
    const notify = () => getApp()?.notify()

    return {
        select(viewId: string): void {
            const scene = getScene()
            if (!scene) return
            const view = scene.findViewById(viewId)
            if (view) {
                scene.select(view)
                notify()
            }
        },

        deselect(): void {
            const scene = getScene()
            if (!scene) return
            clearAllStates(scene)
            notify()
        },

        selectAll(): void {
            const scene = getScene()
            if (!scene) return
            const allViews = flattenViewTree(scene)
            allViews.forEach((view) => {
                scene.select(view, true)
            })
            notify()
        },

        scrollTo(viewId: string): void {
            // TODO: 实现滚动画布使指定视图进入视口
            // 需要 Camera 平移支持，当前为占位
            void viewId
        },

        delete(viewId: string): void {
            const scene = getScene()
            if (!scene) return
            const view = scene.findViewById(viewId)
            if (view) {
                scene.removeChild(view)
                notify()
            }
        },

        reorder(viewId: string, newIndex: number): void {
            const scene = getScene()
            if (!scene) return
            const view = scene.findViewById(viewId)
            if (!view || !view.parent) return

            const parent = view.parent
            const siblings = parent.children as View[]
            const currentIndex = siblings.indexOf(view)
            if (currentIndex === -1 || currentIndex === newIndex) return

            siblings.splice(currentIndex, 1)
            const safeIndex = Math.min(newIndex, siblings.length)
            siblings.splice(safeIndex, 0, view)
            notify()
        },

        create(template: IComponentTemplate, position: { x: number; y: number }): string | null {
            const scene = getScene()
            if (!scene) return null

            const { viewType, graphType, defaultProps = {} } = template
            const x = position.x
            const y = position.y

            let newView: View | null = null

            if (viewType === VIEWTYPE.GRAPHVIEW) {
                let graph: Graph | null = null

                if (graphType === GRAPHTYPE.LINE) {
                    graph = new Line(
                        new Point3(0, 0, 0),
                        new Point3(50, 50, 0),
                        Style.DEFAULT,
                    )
                } else if (graphType === GRAPHTYPE.CIRCLE) {
                    const radius = defaultProps.radius ?? 50
                    graph = new Circle(
                        new Point3(radius, radius, 0),
                        radius,
                        Style.DEFAULT,
                    )
                } else if (graphType === GRAPHTYPE.ROUNDED_RECT) {
                    const width = defaultProps.width ?? 100
                    const height = defaultProps.height ?? 100
                    const radii = defaultProps.radii ?? 12
                    graph = new RoundedRect(0, 0, width, height, radii as any, Style.DEFAULT)
                } else if (graphType !== undefined) {
                    console.warn(`[BanvasGL] actions.view.create: 未知 graphType "${graphType}"，已跳过`)
                }

                if (graph) {
                    newView = new GraphView(graph, {
                        style: {
                            width: graph.bounds.width,
                            height: graph.bounds.height,
                        },
                    }).translate(x, y, 0)
                }
            } else if (viewType === VIEWTYPE.TEXTVIEW) {
                const text = defaultProps.text ?? '文本'
                const textParagraph = TextParagraph.simple(text)
                const textFields = new TextFields([textParagraph])
                newView = new TextView(textFields, {
                    style: { width: 200, height: 24 },
                }).translate(x, y, 0)
            } else if (viewType === VIEWTYPE.IMAGEVIEW) {
                const imageSrc = defaultProps.imageSrc ?? ''
                const width = defaultProps.width ?? 200
                const height = defaultProps.height ?? 300
                const imageElement = new ImageElement(imageSrc, 0, 0, width, height, Style.DEFAULT)
                newView = new ImageView(imageElement, {
                    style: { width, height },
                }).translate(x, y, 0)
            }

            if (newView) {
                scene.addChild(newView)
                scene.select(newView)
                notify()
                return newView.id
            }
            return null
        },

        setVisible(viewId: string, visible: boolean): void {
            const scene = getScene()
            if (!scene) return
            const view = scene.findViewById(viewId)
            if (view) {
                view.visible = visible
                notify()
            }
        },

        setLocked(viewId: string, locked: boolean): void {
            const scene = getScene()
            if (!scene) return
            const view = scene.findViewById(viewId)
            if (view) {
                view.freezed = locked
                notify()
            }
        },

        rename(viewId: string, name: string): void {
            const scene = getScene()
            if (!scene) return
            const view = scene.findViewById(viewId)
            if (view) {
                view.name = name
                notify()
            }
        },

        copy(viewId: string): void {
            const scene = getScene()
            if (!scene) return
            const view = scene.findViewById(viewId)
            if (view) {
                clipboard = view.copy()
            }
        },

        paste(target: { viewId: string } | { position: { x: number; y: number } }): string | null {
            const scene = getScene()
            if (!scene || !clipboard) return null

            const newView = clipboard.copy()

            if ('viewId' in target) {
                // 替换模式：用剪贴板内容替换目标 view
                const targetView = scene.findViewById(target.viewId)
                if (!targetView) return null

                // 继承目标的位置矩阵
                newView.matrix = targetView.matrix.copy()
                // 在目标的同一位置插入新 view 并移除旧 view
                scene.addChild(newView)
                scene.removeChild(targetView)
            } else {
                // 位置模式：粘贴到指定坐标
                newView.translate(target.position.x, target.position.y, 0)
                scene.addChild(newView)
            }

            scene.select(newView)
            notify()
            return newView.id
        },

        bringToFront(viewId: string): void {
            const scene = getScene()
            if (!scene) return
            const view = scene.findViewById(viewId)
            if (view) {
                scene.bringToFront(view)
                notify()
            }
        },

        sendToBack(viewId: string): void {
            const scene = getScene()
            if (!scene) return
            const view = scene.findViewById(viewId)
            if (view) {
                scene.sendToBack(view)
                notify()
            }
        },

        group(viewIds: string[]): string | null {
            const scene = getScene()
            if (!scene) return null
            const views = viewIds
                .map((id) => scene.findViewById(id))
                .filter((v): v is View => v !== undefined)
            if (views.length < 2) return null
            const combined = scene.group(views)
            if (combined) {
                notify()
                return combined.id
            }
            return null
        },

        ungroup(viewId: string): string[] | null {
            const scene = getScene()
            if (!scene) return null
            const view = scene.findViewById(viewId)
            if (!view) return null
            const children = scene.ungroup(view)
            if (children) {
                notify()
                return children.map((c) => c.id)
            }
            return null
        },

        // ── 属性面板支持 ──

        getViewInstance(viewId: string): View | null {
            const scene = getScene()
            if (!scene) return null
            return scene.findViewById(viewId) ?? null
        },

        getViewData(viewId: string): IFieldSchemaMap {
            const scene = getScene()
            if (!scene) return {}
            const view = scene.findViewById(viewId)
            return view ? ({ ...view.data } as IFieldSchemaMap) : {}
        },

        setViewData(viewId: string, key: string, schema: IFieldSchema): void {
            const scene = getScene()
            if (!scene) return
            const view = scene.findViewById(viewId)
            if (!view) return
            view.data = { ...view.data, [key]: schema }
            notify()
        },

        deleteViewData(viewId: string, key: string): void {
            const scene = getScene()
            if (!scene) return
            const view = scene.findViewById(viewId)
            if (!view) return
            const next = { ...view.data } as IFieldSchemaMap
            delete next[key]
            view.data = next
            notify()
        },

        // ── 事件与生命周期 ──

        getViewEvents(viewId: string): IViewEvents {
            const scene = getScene()
            const empty: IViewEvents = {
                onClick: null, onDoubleClick: null, onContextMenu: null,
                onMouseEnter: null, onMouseLeave: null, onMouseMove: null, onMouseDown: null, onMouseUp: null,
                onDragStart: null, onDrag: null, onDragEnd: null,
                onFocus: null, onBlur: null,
            }
            if (!scene) return empty
            const view = scene.findViewById(viewId)
            return view ? { ...view.events } : empty
        },

        setViewEvent(viewId: string, eventName: keyof IViewEvents, handler: EventHandler): void {
            const scene = getScene()
            if (!scene) return
            const view = scene.findViewById(viewId)
            if (!view) return
            view.events = { ...view.events, [eventName]: handler }
            notify()
        },

        deleteViewEvent(viewId: string, eventName: keyof IViewEvents): void {
            const scene = getScene()
            if (!scene) return
            const view = scene.findViewById(viewId)
            if (!view) return
            view.events = { ...view.events, [eventName]: null }
            notify()
        },

        getViewLifetimes(viewId: string): IViewLifetimes {
            const scene = getScene()
            if (!scene) return { onCreated: null, onAttach: null, onDestroy: null }
            const view = scene.findViewById(viewId)
            return view ? { ...view.lifetimes } : { onCreated: null, onAttach: null, onDestroy: null }
        },

        setViewLifetime(viewId: string, lifetimeName: keyof IViewLifetimes, handler: EventHandler): void {
            const scene = getScene()
            if (!scene) return
            const view = scene.findViewById(viewId)
            if (!view) return
            view.lifetimes = { ...view.lifetimes, [lifetimeName]: handler }
            notify()
        },

        deleteViewLifetime(viewId: string, lifetimeName: keyof IViewLifetimes): void {
            const scene = getScene()
            if (!scene) return
            const view = scene.findViewById(viewId)
            if (!view) return
            view.lifetimes = { ...view.lifetimes, [lifetimeName]: null }
            notify()
        },

        getProperty(viewId: string, prop: string): number | undefined {
            const scene = getScene()
            if (!scene) return undefined
            const view = scene.findViewById(viewId)
            if (!view) return undefined
            return getProperty(view, prop)
        },

        getActivedViewIds(): string[] {
            const scene = getScene()
            if (!scene) return []
            return scene.getAllActived().map((v) => v.id)
        },

        setProperty(prop: string, value: number): void {
            const scene = getScene()
            if (!scene) return
            const selectedView = scene.getSelectedView()
            if (!selectedView) return

            const oldValue = getProperty(selectedView, prop)
            const category = getPropertyCategory(prop)

            setProperty(selectedView, prop, value)

            const activedViews = scene.getAllActived()
            for (const view of activedViews) {
                if (view.id === selectedView.id) continue
                const currentVal = getProperty(view, prop)
                if (category === 'size') {
                    const ratio = oldValue !== 0 ? value / oldValue : 1
                    setProperty(view, prop, currentVal * ratio)
                } else {
                    const delta = value - oldValue
                    setProperty(view, prop, currentVal + delta)
                }
            }

            notify()
        },

        setProperties(props: Record<string, number>): void {
            const scene = getScene()
            if (!scene) return
            const selectedView = scene.getSelectedView()
            if (!selectedView) return

            const activedViews = scene.getAllActived()

            for (const [prop, value] of Object.entries(props)) {
                const oldValue = getProperty(selectedView, prop)
                const category = getPropertyCategory(prop)

                setProperty(selectedView, prop, value)

                for (const view of activedViews) {
                    if (view.id === selectedView.id) continue
                    const currentVal = getProperty(view, prop)
                    if (category === 'size') {
                        const ratio = oldValue !== 0 ? value / oldValue : 1
                        setProperty(view, prop, currentVal * ratio)
                    } else {
                        const delta = value - oldValue
                        setProperty(view, prop, currentVal + delta)
                    }
                }
            }

            notify()
        },

        setContentMethod(method: string, args: any[]): void {
            const scene = getScene()
            if (!scene) return
            const selectedView = scene.getSelectedView()
            if (!selectedView) return

            const content = selectedView.content
            if (!content || typeof (content as any)[method] !== 'function') return

            ;(content as any)[method](...args)
            notify()
        },

        beginPropertyEdit(): void {
            const scene = getScene()
            if (!scene) return
            const activedIds = scene.getAllActived().map((v) => v.id)
            if (activedIds.length === 0) return
            scene.beginTransaction(activedIds)
        },

        commitPropertyEdit(): void {
            const scene = getScene()
            if (!scene) return
            scene.commitTransaction()
        },

        rollbackPropertyEdit(): void {
            const scene = getScene()
            if (!scene) return
            scene.rollbackTransaction()
        },
    }
}
