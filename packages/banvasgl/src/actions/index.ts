/**
 * Actions 入口 — BanvasGL 核心操作 API
 *
 * 提供 createBanvasActions 工厂函数，返回命名空间化的操作对象。
 * 四维度：app / page / view / template。
 */

import type { IBanvasActions } from '@/types/actions/actions'
import type { App } from '@/engine/App'

// 内部使用的导入
import { createViewActions as _createViewActions } from './viewActions.js'
import { createPageActions as _createPageActions } from './pageActions.js'
import { createAppActions as _createAppActions } from './appActions.js'
import { serialize as _serializeTemplate, instantiate as _instantiateTemplate } from './templateActions.js'

// ── Factory ──

export function createBanvasActions(getApp: () => App | null): IBanvasActions {
  return {
    view: _createViewActions(getApp),
    page: _createPageActions(getApp),
    app: _createAppActions(getApp),
    template: {
      serialize: (viewId, config) => _serializeTemplate(getApp, viewId, config),
      instantiate: (template, position, params?) => _instantiateTemplate(getApp, template, position, params),
    },
  }
}
