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
            return app.toDataURL(type, quality)
        },

        notify(): void {
            notify()
        },
    }
}
