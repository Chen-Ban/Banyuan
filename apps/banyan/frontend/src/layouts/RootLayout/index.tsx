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
 * 重构后：应用相关状态（appName、AI 回调等）全部迁移到 applicationStore，
 * 此组件仅负责 Layout 壳 + sidebarMode 判断。
 */

import { useMemo } from 'react'
import { Outlet, useLocation, useParams } from 'react-router-dom'
import Sidebar from './Sidebar'
import LoginModal from '@/components/LoginModal'
import { RootLayoutCtx, type SidebarMode } from './RootLayoutCtx'
import styles from './index.module.scss'

const RootLayout: React.FC = () => {
  const location = useLocation()
  const { id: appId } = useParams<{ id: string }>()

  const sidebarMode: SidebarMode = useMemo(() => {
    if (appId || location.pathname.startsWith('/application/')) {
      return 'app'
    }
    if (location.pathname.startsWith('/settings')) {
      return 'settings'
    }
    return 'nav'
  }, [location.pathname, appId])

  return (
    <RootLayoutCtx.Provider value={{ sidebarMode }}>
      <div className={styles.root}>
        <aside className={`${styles.sidebar}${sidebarMode === 'app' ? ` ${styles.sidebarApp}` : ''}`}>
          <Sidebar mode={sidebarMode} />
        </aside>
        <main className={styles.main}>
          <Outlet />
        </main>
      </div>
      <LoginModal />
    </RootLayoutCtx.Provider>
  )
}

export default RootLayout
