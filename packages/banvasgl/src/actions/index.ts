/**
 * Actions 入口 — BanvasGL 核心操作 API
 *
 * 提供 createBanvasActions 工厂函数，返回命名空间化的操作对象。
 * viewCreatorStrategies 通过可选参数注入，核心包不硬编码具体视图创建逻辑。
 */

import { preprocessForExport } from '@/engine/PreviewPreprocessor'
import type { IBanvasActions } from '@/types/hook/hook'
import type App from '@/engine/App'

// 内部使用的导入
import { createViewActions as _createViewActions } from './viewActions.js'
import { createPageActions as _createPageActions } from './pageActions.js'
import { createAppActions as _createAppActions } from './appActions.js'
import { createHistoryActions as _createHistoryActions } from './historyActions.js'

// ── Re-exports（供外部消费） ──
export { createViewActions, getClipboard } from './viewActions.js'
export type { ViewCreatorStrategy, CreateViewActionsOptions } from './viewActions.js'
export { createPageActions } from './pageActions.js'
export { createAppActions } from './appActions.js'
export { createHistoryActions } from './historyActions.js'

// ── Factory Options ──

export interface CreateBanvasActionsOptions {
    /** View 创建策略表，key 为 ViewType 字符串 */
    viewCreatorStrategies?: Map<string, (defaultProps: Record<string, any>, x: number, y: number) => any>
}

// ── Factory ──

export function createBanvasActions(
    getApp: () => App | null,
    options: CreateBanvasActionsOptions = {},
): IBanvasActions {
    const { viewCreatorStrategies } = options

    return {
        view: _createViewActions(getApp, { viewCreatorStrategies }),
        page: _createPageActions(getApp),
        app: _createAppActions(getApp),
        history: _createHistoryActions(getApp),

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
