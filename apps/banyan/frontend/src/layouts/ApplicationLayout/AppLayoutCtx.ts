/**
 * AppLayoutCtx
 *
 * 应用级 Layout 的 Context，用于在 ApplicationLayout 与子页面之间共享能力：
 *
 * ── 画布序列化（UIPage → ApplicationLayout）──────────────────────────────────
 * - UIPage 在 actions 就绪后，通过 registerGetPages 向上注册序列化函数
 * - ApplicationLayout 的 handleSave / handleBuild 通过 getPages() 获取最新画布数据
 *
 * ── 应用名称（ApplicationLayout ↔ Sidebar 面包屑）────────────────────────────
 * - ApplicationLayout 加载元数据后写入 appName
 * - Sidebar 的 AppBreadcrumb 子组件读取 appName 展示
 *
 * 注：AiBar 单例已提升到 RootLayout 层，相关接口（registerAiBarCallbacks /
 * aiBarHandle）由 RootLayoutCtx 提供，不再经过此 Context。
 */

import { createContext, useContext } from 'react'

export interface AppLayoutCtxValue {
  /** UIPage 调用此方法，将 getSerializedPages 注册到 Layout */
  registerGetPages: (fn: () => string[]) => void
  /** UIPage 卸载时调用，清除注册 */
  unregisterGetPages: () => void
  /** 当前应用名称（由 ApplicationLayout 管理，Sidebar 面包屑可读取） */
  appName: string
  /** 修改应用名称（会触发 auto-save，同时更新顶部 bar） */
  onAppRename: (name: string) => void
}

export const AppLayoutCtx = createContext<AppLayoutCtxValue>({
  registerGetPages: () => {},
  unregisterGetPages: () => {},
  appName: '',
  onAppRename: () => {},
})

export const useAppLayoutCtx = () => useContext(AppLayoutCtx)
