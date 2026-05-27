/**
 * Actions 入口（banvas-design 层）
 *
 * 从 @banyuan/banvasgl 导入核心 createBanvasActions，
 * 注入设计态的 viewCreatorStrategies，对外保持兼容的 API。
 */

import {
    createBanvasActions as _createBanvasActions,
    getClipboard,
} from '@banyuan/banvasgl'
import type { IBanvasActions, App } from '@banyuan/banvasgl'
import { viewCreatorStrategies } from './viewCreateStrategies.js'

export { getClipboard }

/**
 * 创建带有设计态视图创建策略的 BanvasActions
 *
 * 这是 banvas-design 层的封装，自动注入 viewCreatorStrategies。
 * 业务层直接调用此函数即可获得完整的编辑能力。
 */
export function createBanvasActions(
    getApp: () => App | null,
): IBanvasActions {
    return _createBanvasActions(getApp, { viewCreatorStrategies })
}
