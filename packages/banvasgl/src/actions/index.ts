/**
 * Actions 入口 — BanvasGL 核心操作 API
 *
 * 提供 createBanvasActions 工厂函数，返回命名空间化的操作对象。
 * 内置默认 viewCreatorStrategies，也可通过可选参数覆盖。
 */

import type { IBanvasActions } from '@/types/hook/hook'
import type App from '@/engine/App'

// 内部使用的导入
import { createViewActions as _createViewActions } from './viewActions.js'
import { createPageActions as _createPageActions } from './pageActions.js'
import { createAppActions as _createAppActions } from './appActions.js'
import { createHistoryActions as _createHistoryActions } from './historyActions.js'
import { defaultViewCreatorStrategies, graphCreatorStrategies } from './viewCreateStrategies.js'

// ── Re-exports（公共 API） ──
export type { ViewCreatorStrategy } from './viewActions.js'
export { defaultViewCreatorStrategies } from './viewCreateStrategies.js'

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
    const { viewCreatorStrategies = defaultViewCreatorStrategies } = options

    return {
        view: _createViewActions(getApp, { viewCreatorStrategies }),
        page: _createPageActions(getApp),
        app: _createAppActions(getApp),
        history: _createHistoryActions(getApp),
    }
}
