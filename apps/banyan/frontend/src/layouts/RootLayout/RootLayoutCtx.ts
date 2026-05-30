/**
 * RootLayoutCtx — 全局布局 Context
 *
 * 提供左侧导航栏的状态控制能力，以及 AiBar 单例的共享接口：
 *
 * ── AiBar 单例（RootLayout 持有）────────────────────────────────────────────
 * - RootLayout 在 sidebarMode === 'app' 时渲染唯一的 <AiBar>，appId 从路由参数取
 * - AiBar 发送前通过 appEvents.emitSaveApp() 通知各子页面保存，无需 Context 注册
 * - UIPage 通过 registerAiCallbacks 注册 onDone / onPagesSnapshot，
 *   RootLayout 用稳定包装函数转发给 AiBar props，避免 AiBar 实例重建
 * - UIPage 通过 aiBarHandle 命令式触发 sendPrompt（首页跳转后自动起始对话）
 * - 切换 Tab 时 AiBar 实例不销毁，对话历史得以保留
 */

import { createContext, useContext, type ReactNode } from 'react'
import type { AiBarHandle } from '@/components/AiBar'

export type SidebarMode = 'nav' | 'app' | 'settings'

export interface AiCallbacks {
  /** 写操作工具执行完毕后实时推送当前 appJSON，用于画布实时更新 */
  onAppSnapshot?: (appJSON: string) => void
  /** AI 完成后回调，携带最终 appJSON */
  onDone?: (appJSON: string) => void
}

export interface RootLayoutCtxValue {
  /** 当前侧边栏模式 */
  sidebarMode: SidebarMode

  // ── 应用名称（ApplicationLayout 写入，Sidebar 面包屑读取） ──────────────
  /** 当前应用名称 */
  appName: string
  /** 更新应用名称（同步 UI，不发请求） */
  setAppName: (name: string) => void

  // ── AiBar 画布回调（由 UIPage 注册） ────────────────────────────────────
  /**
   * UIPage 挂载时注册 onAppSnapshot / onDone，
   * RootLayout 通过稳定包装函数将其转发给 AiBar props。
   */
  registerAiCallbacks: (cbs: AiCallbacks) => void
  /** UIPage 卸载时清除注册 */
  unregisterAiCallbacks: () => void

  // ── AiBar 命令式触发 ────────────────────────────────────────────────────
  /** 当前 AiBar handle（UIPage 用于 sendPrompt） */
  aiBarHandle: AiBarHandle | null

  // ── AiBar 节点（Sidebar 渲染用） ────────────────────────────────────────
  /** RootLayout 构造好的 <AiBar> ReactNode，Sidebar 直接渲染 */
  aiBarNode: ReactNode
}

export const RootLayoutCtx = createContext<RootLayoutCtxValue>({
  sidebarMode: 'nav',
  appName: '',
  setAppName: () => {},
  registerAiCallbacks: () => {},
  unregisterAiCallbacks: () => {},
  aiBarHandle: null,
  aiBarNode: null,
})

export const useRootLayoutCtx = () => useContext(RootLayoutCtx)
