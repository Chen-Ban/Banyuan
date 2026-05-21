/**
 * Page（Scene）级别操作
 */

import { BaseCamera, Scene } from '@banyuan/canvas'
import type {
    IPageActions,
    IFieldSchema,
    IFieldSchemaMap,
    EventHandler,
    ISceneLifetimes,
    App,
} from '@banyuan/canvas'

export function createPageActions(
    getApp: () => App | null,
): IPageActions {
    const notify = () => getApp()?.notify()

    return {
        navigateTo(pageId: string): void {
            const app = getApp()
            if (!app) return
            const scene = app.getScene(pageId)
            if (scene) {
                app.navigateTo(scene as Scene)
                notify()
            }
        },

        add(name?: string): string | null {
            const app = getApp()
            if (!app) return null
            const camera = new BaseCamera()
            const scene = new Scene(camera, { name })
            app.addScene(scene)
            app.navigateTo(scene)
            notify()
            return scene.id
        },

        remove(pageId: string): void {
            const app = getApp()
            if (!app) return
            const scene = app.getScene(pageId)
            if (scene) {
                app.removeScene(scene)
                notify()
            }
        },

        rename(pageId: string, name: string): void {
            const app = getApp()
            if (!app) return
            const scene = app.getScene(pageId)
            if (scene) {
                scene.name = name
                notify()
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
            notify()
        },

        duplicate(pageId: string): string | null {
            const app = getApp()
            if (!app) return null
            const scene = app.getScene(pageId)
            if (!scene) return null

            const newScene = scene.copy()
            app.addScene(newScene)
            notify()
            return newScene.id
        },

        getPageData(pageId: string): IFieldSchemaMap {
            const app = getApp()
            if (!app) return {}
            const scene = app.getScene(pageId)
            return scene ? ({ ...scene.data } as IFieldSchemaMap) : {}
        },

        setPageData(pageId: string, key: string, schema: IFieldSchema): void {
            const app = getApp()
            if (!app) return
            const scene = app.getScene(pageId)
            if (!scene) return
            scene.data = { ...scene.data, [key]: schema }
            notify()
        },

        deletePageData(pageId: string, key: string): void {
            const app = getApp()
            if (!app) return
            const scene = app.getScene(pageId)
            if (!scene) return
            const next = { ...scene.data } as IFieldSchemaMap
            delete next[key]
            scene.data = next
            notify()
        },

        getPageLifetimes(pageId: string): ISceneLifetimes {
            const app = getApp()
            if (!app) return { onLoad: null, onUnload: null, onShow: null, onHide: null }
            const scene = app.getScene(pageId)
            if (!scene) return { onLoad: null, onUnload: null, onShow: null, onHide: null }
            return { ...scene.lifetimes }
        },

        setPageLifetime(pageId: string, lifetimeName: keyof ISceneLifetimes, handler: EventHandler): void {
            const app = getApp()
            if (!app) return
            const scene = app.getScene(pageId)
            if (!scene) return
            scene.lifetimes = { ...scene.lifetimes, [lifetimeName]: handler }
            notify()
        },

        deletePageLifetime(pageId: string, lifetimeName: keyof ISceneLifetimes): void {
            const app = getApp()
            if (!app) return
            const scene = app.getScene(pageId)
            if (!scene) return
            scene.lifetimes = { ...scene.lifetimes, [lifetimeName]: null }
            notify()
        },
    }
}
