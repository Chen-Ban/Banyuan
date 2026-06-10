/**
 * RootLayoutCtx — 全局布局 Context（精简版）
 *
 * 仅提供侧边栏模式识别。应用相关状态已迁移到 applicationStore。
 */

import { createContext, useContext } from 'react'

export type SidebarMode = 'nav' | 'app' | 'settings'

export interface RootLayoutCtxValue {
  /** 当前侧边栏模式 */
  sidebarMode: SidebarMode
}

export const RootLayoutCtx = createContext<RootLayoutCtxValue>({
  sidebarMode: 'nav',
})

export const useRootLayoutCtx = () => useContext(RootLayoutCtx)
