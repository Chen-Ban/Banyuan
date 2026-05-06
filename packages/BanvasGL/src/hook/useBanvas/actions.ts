/**
 * Actions 实现
 *
 * 将 App / Scene / View 的内部操作封装为安全的命名空间化 API。
 * 业务层通过 actions.view.select(id) 等形式调用，不直接接触实例。
 */

import type { IViewActions, IPageActions, IHistoryActions, IBanvasActions, IComponentTemplate } from '@/core/interfaces'
import type { App } from '@/core/app'
import { BaseCamera, Scene } from '@/core'
import { Point3 } from '@/core/math'
import { Style } from '@/core/style'
import {
    Line,
    Circle,
    Rectangle,
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
import { VIEWTYPE } from '@/core/constants'
import { clearAllStates } from '@/core/scene/operations'

/**
 * 创建 ViewActions 实例
 */
export function createViewActions(
    getApp: () => App | null,
    onViewChange: () => void,
): IViewActions {
    const getScene = () => getApp()?.getCurrentScene() ?? null

    return {
        select(viewId: string): void {
            const scene = getScene()
            if (!scene) return
            const view = scene.findViewById(viewId)
            if (view) {
                scene.select(view)
                onViewChange()
            }
        },

        deselect(): void {
            const scene = getScene()
            if (!scene) return
            clearAllStates(scene)
            onViewChange()
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
                onViewChange()
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

            // 移动到新位置
            siblings.splice(currentIndex, 1)
            const safeIndex = Math.min(newIndex, siblings.length)
            siblings.splice(safeIndex, 0, view)
            onViewChange()
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

                if (graphType === 'LINE') {
                    graph = new Line(
                        new Point3(0, 0, 0),
                        new Point3(50, 50, 0),
                        Style.DEFAULT,
                    )
                } else if (graphType === 'CIRCLE') {
                    const radius = defaultProps.radius ?? 50
                    graph = new Circle(
                        new Point3(radius, radius, 0),
                        radius,
                        Style.DEFAULT,
                    )
                } else if (graphType === 'RECTANGLE') {
                    const width = defaultProps.width ?? 100
                    const height = defaultProps.height ?? 100
                    graph = new Rectangle(0, 0, width, height, Style.DEFAULT)
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
                    shouldLayout: true,
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
                onViewChange()
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
                onViewChange()
            }
        },

        setLocked(viewId: string, locked: boolean): void {
            const scene = getScene()
            if (!scene) return
            const view = scene.findViewById(viewId)
            if (view) {
                view.freezed = locked
                onViewChange()
            }
        },

        rename(viewId: string, name: string): void {
            const scene = getScene()
            if (!scene) return
            const view = scene.findViewById(viewId)
            if (view) {
                ;(view as any)._displayName = name
                onViewChange()
            }
        },
    }
}

/**
 * 创建 PageActions 实例
 */
export function createPageActions(
    getApp: () => App | null,
    onPageChange: () => void,
): IPageActions {
    return {
        navigateTo(pageId: string): void {
            const app = getApp()
            if (!app) return
            const scene = app.getScene(pageId)
            if (scene) {
                app.navigateTo(scene as Scene)
                onPageChange()
            }
        },

        add(name?: string): string | null {
            const app = getApp()
            if (!app) return null
            const camera = new BaseCamera()
            const scene = new Scene(camera)
            if (name) {
                ;(scene as any)._displayName = name
            }
            app.addScene(scene)
            app.navigateTo(scene)
            onPageChange()
            return scene.id
        },

        remove(pageId: string): void {
            const app = getApp()
            if (!app) return
            const scene = app.getScene(pageId)
            if (scene) {
                app.removeScene(scene)
                onPageChange()
            }
        },

        rename(pageId: string, name: string): void {
            const app = getApp()
            if (!app) return
            const scene = app.getScene(pageId)
            if (scene) {
                ;(scene as any)._displayName = name
                onPageChange()
            }
        },

        reorder(pageId: string, newIndex: number): void {
            const app = getApp()
            if (!app) return
            const currentIndex = app.scenes.findIndex((s) => s.id === pageId)
            if (currentIndex === -1 || currentIndex === newIndex) return

            const [scene] = app.scenes.splice(currentIndex, 1)
            const safeIndex = Math.min(newIndex, app.scenes.length)
            app.scenes.splice(safeIndex, 0, scene)
            onPageChange()
        },

        duplicate(pageId: string): string | null {
            const app = getApp()
            if (!app) return null
            const scene = app.getScene(pageId)
            if (!scene) return null

            const newScene = scene.copy()
            app.addScene(newScene)
            onPageChange()
            return newScene.id
        },
    }
}

/**
 * 创建 HistoryActions 实例
 *
 * 注意：canUndo / canRedo 是 getter，每次访问时实时计算。
 */
export function createHistoryActions(getApp: () => App | null, onViewChange: () => void): IHistoryActions {
    return {
        undo(): boolean {
            const scene = getApp()?.getCurrentScene()
            if (!scene) return false
            const result = scene.undo()
            if (result) onViewChange()
            return result
        },

        redo(): boolean {
            const scene = getApp()?.getCurrentScene()
            if (!scene) return false
            const result = scene.redo()
            if (result) onViewChange()
            return result
        },

        get canUndo(): boolean {
            return getApp()?.getCurrentScene()?.canUndo ?? false
        },

        get canRedo(): boolean {
            return getApp()?.getCurrentScene()?.canRedo ?? false
        },
    }
}

/**
 * 组装完整的 BanvasActions
 */
export function createBanvasActions(
    getApp: () => App | null,
    onViewChange: () => void,
    onPageChange: () => void,
): IBanvasActions {
    return {
        view: createViewActions(getApp, onViewChange),
        page: createPageActions(getApp, onPageChange),
        history: createHistoryActions(getApp, onViewChange),
    }
}
