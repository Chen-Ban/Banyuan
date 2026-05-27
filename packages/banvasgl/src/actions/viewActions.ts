/**
 * View 级别操作
 *
 * viewCreatorStrategies 通过参数注入，核心包不硬编码具体创建策略，
 * 由上层（banvas-design）传入完整的策略表。
 */

import View from '@/view/View/View'
import { clearAllStates, flattenViewTree } from '@/engine/operations/ViewTree'
import { adapterRegistry } from '@/engine/property'
import type { IViewActions, IComponentTemplate } from '@/types/hook/hook'
import type { IFieldSchema, IFieldSchemaMap, EventHandler, IViewEvents, IViewLifetimes } from '@/types/view/view'
import type App from '@/engine/App'

/** View 创建策略函数签名 */
export type ViewCreatorStrategy = (defaultProps: Record<string, any>, x: number, y: number) => View

/** 内部剪贴板（模块级单例） */
let clipboard: View | null = null

/** 获取当前剪贴板内容（供 contextMenu 判断是否可粘贴） */
export function getClipboard(): View | null {
    return clipboard
}

export interface CreateViewActionsOptions {
    /** View 创建策略表，key 为 ViewType 字符串 */
    viewCreatorStrategies?: Map<string, ViewCreatorStrategy>
}

export function createViewActions(
    getApp: () => App | null,
    options: CreateViewActionsOptions = {},
): IViewActions {
    const { viewCreatorStrategies } = options
    const getScene = () => getApp()?.getCurrentScene() ?? null
    const notify = () => getApp()?.notify()

    return {
        select(viewId: string, multiple?: boolean): void {
            const scene = getScene()
            if (!scene) return
            const view = scene.findViewById(viewId)
            if (view) {
                scene.select(view, multiple)
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
            const app = getApp()
            const scene = getScene()
            if (!scene || !app) return null

            if (!viewCreatorStrategies) {
                console.warn('[BanvasGL] actions.view.create: viewCreatorStrategies 未注入，无法创建视图')
                return null
            }

            const { viewType, graphType, defaultProps = {} } = template
            const { x, y } = position

            const viewStrategy = viewCreatorStrategies.get(viewType)
            if (!viewStrategy) {
                console.warn(`[BanvasGL] actions.view.create: 未知 viewType "${viewType}"，已跳过`)
                return null
            }

            const propsWithGraphType = viewType === 'GRAPHVIEW' && graphType
                ? { ...defaultProps, _graphType: graphType }
                : defaultProps

            let newView: View | null = null
            try {
                newView = viewStrategy(propsWithGraphType, x, y)
            } catch (err) {
                console.warn(err instanceof Error ? err.message : err)
                return null
            }

            scene.addChild(newView)
            scene.select(newView)
            notify()
            return newView.id
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
                const targetView = scene.findViewById(target.viewId)
                if (!targetView) return null
                newView.matrix = targetView.matrix.copy()
                scene.addChild(newView)
                scene.removeChild(targetView)
            } else {
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
            return adapterRegistry.get(view, prop)
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

            const oldValue = adapterRegistry.get(selectedView, prop)
            const category = adapterRegistry.getCategory(prop)

            adapterRegistry.set(selectedView, prop, value)

            const activedViews = scene.getAllActived()
            for (const view of activedViews) {
                if (view.id === selectedView.id) continue
                const currentVal = adapterRegistry.get(view, prop)
                if (category === 'size') {
                    const ratio = oldValue !== 0 ? value / oldValue : 1
                    adapterRegistry.set(view, prop, currentVal * ratio)
                } else {
                    const delta = value - oldValue
                    adapterRegistry.set(view, prop, currentVal + delta)
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
                const oldValue = adapterRegistry.get(selectedView, prop)
                const category = adapterRegistry.getCategory(prop)

                adapterRegistry.set(selectedView, prop, value)

                for (const view of activedViews) {
                    if (view.id === selectedView.id) continue
                    const currentVal = adapterRegistry.get(view, prop)
                    if (category === 'size') {
                        const ratio = oldValue !== 0 ? value / oldValue : 1
                        adapterRegistry.set(view, prop, currentVal * ratio)
                    } else {
                        const delta = value - oldValue
                        adapterRegistry.set(view, prop, currentVal + delta)
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
