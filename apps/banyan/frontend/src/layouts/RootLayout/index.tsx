/**
 * RootLayout — 全局左右布局容器
 *
 * 所有页面共享此布局：
 *   ┌──────────────┬──────────────────────────────────────────────┐
 *   │  Sidebar     │  <Outlet /> 右侧内容区                       │
 *   │  (260px)     │                                              │
 *   └──────────────┴──────────────────────────────────────────────┘
 *
 * 根据当前路由自动判断 Sidebar 的显示模式：
 *   - nav：首页 / 列表页 → 品牌文案 + 用户卡片 + 导航菜单
 *   - settings：设置页 → 面包屑 + 用户信息 + 设置项列表
 *   - app：应用编辑态 → 面包屑 + 用户信息 + AiBar
 *
 * 应用相关状态（appName、AI 回调等）由 applicationStore 管理，
 * 此组件仅负责 Layout 壳 + sidebarMode 判断。
 */

import { useMemo, useEffect } from 'react'
import { Outlet, useLocation, useParams } from 'react-router-dom'
import Sidebar from '@/components/Sidebar'
import LoginModal from '@/components/LoginModal'
import { useWorkspaceStore, type Workspace } from '@/stores/workspaceStore'
import styles from './index.module.scss'

const RootLayout: React.FC = () => {
  const location = useLocation()
  const { id: appId } = useParams<{ id: string }>()

  const sidebarMode: Workspace = useMemo(() => {
    if (appId || location.pathname.startsWith('/application/')) {
      return 'app'
    }
    if (location.pathname.startsWith('/settings')) {
      return 'settings'
    }
    return 'nav'
  }, [location.pathname, appId])

  // 写入 store，供 Sidebar 及子组件读取
  useEffect(() => {
    useWorkspaceStore.getState().setWorkspace(sidebarMode)
  }, [sidebarMode])

  return (
    <div className={styles.root}>
      <aside className={`${styles.sidebar}${sidebarMode === 'app' ? ` ${styles.sidebarApp}` : ''}`}>
        <Sidebar />
      </aside>
      <main className={styles.main}>
        <Outlet />
      </main>
      <LoginModal />
    </div>
  )
}

export default RootLayout
