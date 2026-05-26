/**
 * App 级别操作
 */

import type {
    IAppActions,
    IAppLifetimes,
    EventHandler,
    App,
} from '@banyuan/banvasgl'

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
    }
}
