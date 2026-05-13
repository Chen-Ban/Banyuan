/**
 * Actions 入口
 *
 * 组装 view / page / history 三个命名空间，对外暴露 createBanvasActions 和 getClipboard。
 */

import type { IBanvasActions } from '@/core/interfaces'
import type { App } from '@/core/app'
import { preprocessForExport } from '@/core/app'
import { createViewActions, getClipboard } from './viewActions'
import { createPageActions } from './pageActions'
import { createHistoryActions } from './historyActions'

export { getClipboard }

/**
 * 组装完整的 BanvasActions
 */
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
            // 预处理：清除交互状态（BoundingBox 等插件不会被截入）
            const restore = preprocessForExport(app)
            const dataUrl = app.getRenderer().toDataURL(type, quality)
            restore()
            return dataUrl
        },
    }
}
