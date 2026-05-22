/**
 * ApplicationLayout
 *
 * 应用级嵌套路由容器，三个子页面（画布 / 数据库 / 云函数）共用此 Layout：
 *
 *   ┌──────────────────────────────────────────────────────┐
 *   │  Tab 导航：[画布]  [数据库]  [云函数]                  │
 *   ├──────────────────────────────────────────────────────┤
 *   │                                                      │
 *   │   <Outlet />  （画布 / 数据库 / 云函数 子页面内容）     │
 *   │                                                      │
 *   │   AiBar（每个子页面自行渲染，通过 application_id 共享会话）│
 *   └──────────────────────────────────────────────────────┘
 */

import { useCallback } from 'react'
import { Outlet, useNavigate, useParams, useLocation } from 'react-router-dom'
import { Tabs } from 'antd'
import { AppstoreOutlined, DatabaseOutlined, FunctionOutlined } from '@ant-design/icons'
import styles from './index.module.scss'

// ─── Tab 定义 ─────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'ui',         label: '画布',   icon: <AppstoreOutlined /> },
  { key: 'database',   label: '数据库', icon: <DatabaseOutlined /> },
  { key: 'functions',  label: '云函数', icon: <FunctionOutlined /> },
]

// ─── ApplicationLayout ────────────────────────────────────────────────────────

const ApplicationLayout: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()

  // 从路由推导当前激活 Tab
  const activeTabKey = (() => {
    if (location.pathname.endsWith('/database')) return 'database'
    if (location.pathname.endsWith('/functions')) return 'functions'
    return 'ui'
  })()

  // Tab 切换
  const handleTabChange = useCallback((key: string) => {
    if (!id) return
    navigate(`/application/${id}/${key}`)
  }, [id, navigate])

  return (
    <div className={styles.layout}>
      {/* 顶部 Tab 导航 */}
      <div className={styles.tabBar}>
        <Tabs
          activeKey={activeTabKey}
          onChange={handleTabChange}
          size="small"
          className={styles.tabs}
          items={TABS.map((t) => ({
            key: t.key,
            label: (
              <span className={styles.tabLabel}>
                {t.icon}
                {t.label}
              </span>
            ),
          }))}
        />
      </div>

      {/* 子页面内容区 */}
      <div className={styles.content}>
        <Outlet />
      </div>
    </div>
  )
}

export default ApplicationLayout
