/**
 * Actions 入口
 *
 * 组装 view / page / history 三个命名空间，对外暴露 createBanvasActions 和 getClipboard。
 */

import type { IBanvasActions } from '@/core/interfaces'
import type { App } from '@/core/app'
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
    }
}
