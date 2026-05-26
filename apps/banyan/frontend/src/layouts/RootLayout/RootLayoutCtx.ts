/**
 * RootLayoutCtx — 全局布局 Context
 *
 * 提供左侧导航栏的状态控制能力，供子页面动态切换导航模式。
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
