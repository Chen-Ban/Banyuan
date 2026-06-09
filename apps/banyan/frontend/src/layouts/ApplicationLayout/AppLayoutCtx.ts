/**
 * AppLayoutCtx
 *
 * 应用级 Layout 的 Context，用于在 ApplicationLayout 与子页面之间共享能力：
 *
 * ── 画布序列化（UIPage → ApplicationLayout）──────────────────────────────────
 * - UIPage 在 actions 就绪后，通过 registerGetApp 向上注册序列化函数
 * - ApplicationLayout 的 handleSave / handleBuild 通过 getApp() 获取最新画布数据
 *
 * ── 应用名称（ApplicationLayout ↔ Sidebar 面包屑）────────────────────────────
 * - ApplicationLayout 加载元数据后写入 appName
 * - Sidebar 的 AppBreadcrumb 子组件读取 appName 展示
 *
 * ── 应用设计尺寸（ApplicationLayout ↔ UIPage）────────────────────────────────
 * - UIPage 注册 setDesignSize 回调给 Layout
 * - ApplicationLayout 的机型选择器调用 onDesignSizeChange 变更尺寸
 * - designSize 展示当前生效的设计尺寸
 *
 * 注：AiBar 单例已提升到 RootLayout 层，相关接口（registerAiCallbacks /
 * aiBarHandle）由 RootLayoutCtx 提供，不再经过此 Context。
 */

import { createContext, useContext } from 'react'

export interface DesignSize {
  width: number
  height: number
}

export interface AppLayoutCtxValue {
  /** UIPage 调用此方法，将 getSerializedApp 注册到 Layout */
  registerGetApp: (fn: () => string) => void
  /** UIPage 卸载时调用，清除注册 */
  unregisterGetApp: () => void
  /** 当前应用名称（由 ApplicationLayout 管理，Sidebar 面包屑可读取） */
  appName: string
  /** 修改应用名称（会触发 auto-save，同时更新顶部 bar） */
  onAppRename: (name: string) => void
  /** 当前应用设计尺寸 */
  designSize: DesignSize
  /** 变更设计尺寸（由 Layout 机型选择器调用，最终通过 UIPage 注册的回调写入 App） */
  onDesignSizeChange: (size: DesignSize) => void
  /** UIPage 注册 setDesignSize 回调 */
  registerDesignSizeHandler: (fn: (size: DesignSize) => void) => void
  /** UIPage 注册当前 designSize 同步（mount 时） */
  syncDesignSize: (size: DesignSize) => void
}

export const AppLayoutCtx = createContext<AppLayoutCtxValue>({
  registerGetApp: () => {},
  unregisterGetApp: () => {},
  appName: '',
  onAppRename: () => {},
  designSize: { width: 1280, height: 800 },
  onDesignSizeChange: () => {},
  registerDesignSizeHandler: () => {},
  syncDesignSize: () => {},
})

export const useAppLayoutCtx = () => useContext(AppLayoutCtx)
