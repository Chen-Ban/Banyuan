/**
 * WorkspaceStore — banyan 应用当前所处功能区（全局 zustand store）
 *
 * 标记用户在哪个领域操作：
 *   - nav：首页 / 应用列表（浏览发现）
 *   - app：应用编辑态（画布 / 数据库 / 云函数）
 *   - settings：系统设置
 *
 * 消费者：Sidebar、保存遮罩、快捷键、全局操作可用性等。
 */

import { create } from 'zustand'

export type Workspace = 'nav' | 'app' | 'settings'

export interface WorkspaceState {
  workspace: Workspace
}

export interface WorkspaceActions {
  setWorkspace: (workspace: Workspace) => void
}

const initialState: WorkspaceState = {
  workspace: 'nav',
}

export const useWorkspaceStore = create<WorkspaceState & WorkspaceActions>()((set) => ({
  ...initialState,
  setWorkspace: (workspace) => set({ workspace }),
}))
