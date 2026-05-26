/**
 * AppLayoutCtx
 *
 * 应用级 Layout 的 Context，用于在 ApplicationLayout 与子页面之间共享能力：
 *
 * - UIPage 在 actions 就绪后，通过 registerGetPages 向上注册序列化函数
 * - ApplicationLayout 的 handleSave / handleBuild 通过 getPages() 获取最新画布数据
 *
 * 之所以用回调注册而非直接 state，是因为 actions.getSerializedPages 是一个
 * 引用稳定的函数，不需要触发 re-render，只需要在调用时能拿到最新值即可。
 */

import { createContext, useContext } from 'react'

export interface AppLayoutCtxValue {
  /** UIPage 调用此方法，将 getSerializedPages 注册到 Layout */
  registerGetPages: (fn: () => string[]) => void
  /** UIPage 卸载时调用，清除注册 */
  unregisterGetPages: () => void
  /** 当前应用名称（由 ApplicationLayout 管理，UIPage/AppTree 可读取） */
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
