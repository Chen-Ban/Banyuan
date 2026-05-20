/**
 * Actions 入口
 */

import { preprocessForExport } from '@banyuan/canvas'
import type { IBanvasActions, App } from '@banyuan/canvas'
import { createViewActions, getClipboard } from './viewActions.js'
import { createPageActions } from './pageActions.js'
import { createHistoryActions } from './historyActions.js'

export { getClipboard }

export function createBanvasActions(
    getApp: () => App | null,
): IBanvasActions {
    return {
        view: createViewActions(getApp),
        page: createPageActions(getApp),
        history: createHistoryActions(getApp),

        getSerializedPages(): string[] {
            const app = getApp()
            if (!app) return []
            return app.getSerializedScenes()
        },

        exportImage(type?: string, quality?: number): string | null {
            const app = getApp()
            if (!app) return null
            const restore = preprocessForExport(app)
            const dataUrl = app.getRenderer().toDataURL(type, quality)
            restore()
            return dataUrl
        },
    }
}
