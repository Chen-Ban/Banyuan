/**
 * Actions 入口 — BanvasGL 核心操作 API
 *
 * 提供 createBanvasActions 工厂函数，返回命名空间化的操作对象。
 * 视图创建统一走 instantiateTemplate() 路径。
 */

import type { IBanvasActions } from "@/types/actions/actions";
import type { App } from "@/engine/App";

// 内部使用的导入
import { createViewActions as _createViewActions } from "./viewActions.js";
import { createPageActions as _createPageActions } from "./pageActions.js";
import { createAppActions as _createAppActions } from "./appActions.js";

// ── Factory ──

export function createBanvasActions(
  getApp: () => App | null,
): IBanvasActions {
  return {
    view: _createViewActions(getApp),
    page: _createPageActions(getApp),
    app: _createAppActions(getApp),
  };
}
