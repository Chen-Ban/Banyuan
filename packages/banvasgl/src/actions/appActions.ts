/**
 * App 级别操作
 */

import type { IAppActions } from '@/types/hook/hook'
import type { IAppLifetimes } from '@/types/engine/app'
import type { EventHandler } from '@/types/view/view'
import type { App } from '@/engine/App'

export function createAppActions(
    getApp: () => App | null,
): IAppActions {
    const notify = () => getApp()?.notify()

    return {
        getAppLifetimes(): IAppLifetimes {
            const app = getApp()
            if (!app) return { onLaunch: null, onUnlaunch: null }
            return { ...app.lifetimes }
        },

        setAppLifetime(lifetimeName: keyof IAppLifetimes, handler: EventHandler): void {
            const app = getApp()
            if (!app) return
            app.lifetimes = { ...app.lifetimes, [lifetimeName]: handler }
            notify()
        },

        deleteAppLifetime(lifetimeName: keyof IAppLifetimes): void {
            const app = getApp()
            if (!app) return
            app.lifetimes = { ...app.lifetimes, [lifetimeName]: null }
            notify()
        },

        getSerializedApp(): string {
            const app = getApp()
            if (!app) return ''
            return app.serialize()
        },

        exportImage(type?: string, quality?: number): string | null {
            const app = getApp()
            if (!app) return null
            const platform = app.renderer.getPlatformCanvas()
            return platform?.toDataURL?.(type, quality) ?? null
        },

        setBackendEndpoint(endpoint: string | undefined): void {
            const app = getApp()
            if (!app) return
            app.backendEndpoint = endpoint
        },

        getBackendEndpoint(): string | undefined {
            return getApp()?.backendEndpoint
        },

        getDesignSize(): { width: number; height: number } {
            const app = getApp()
            if (!app) return { width: 1280, height: 800 }
            return app.getDesignSize()
        },

        setDesignSize(width: number, height: number): void {
            const app = getApp()
            if (!app) return
            app.setDesignSize(width, height)
            notify()
        },

        notify(): void {
            notify()
        },

        getCurrentScene() {
            return getApp()?.getCurrentScene() ?? null
        },

        subscribe(listener: () => void): () => void {
            const app = getApp()
            if (!app) return () => {}
            return app.subscribe(listener)
        },

        loadAppJSON(json: string): void {
            const app = getApp()
            if (!app) return
            app.initFromSerialized(json)
            notify()
        },
    }
}
