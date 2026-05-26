/**
 * Sidebar — 左侧导航栏
 *
 * 根据 mode 渲染不同的内容：
 *   - nav：品牌文案 + 用户卡片 + 导航菜单（首页/列表/设置）
 *   - settings：面包屑 + 用户信息 + 设置项列表
 *   - app：面包屑（含应用名下拉） + 用户信息 + AiBar（通过 Portal 注入）
 */

import { useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Avatar, Dropdown } from 'antd'
import type { MenuProps } from 'antd'
import {
  HomeOutlined,
  AppstoreOutlined,
  SettingOutlined,
  UserOutlined,
  LogoutOutlined,
  DownOutlined,
} from '@ant-design/icons'
import { useAuth } from '@/hooks/useAuth'
import { useAppLayoutCtx } from '@/layouts/ApplicationLayout/AppLayoutCtx'
import { SidebarSlotTarget } from './SidebarSlot'
import type { SidebarMode } from './RootLayoutCtx'
import styles from './Sidebar.module.scss'

// ─── 工具函数 ────────────────────────────────────────────────────────────────────

function getInitial(username: string): string {
  return username.charAt(0).toUpperCase()
}

// ─── Props ──────────────────────────────────────────────────────────────────────

interface SidebarProps {
  mode: SidebarMode
}

// ─── 组件 ────────────────────────────────────────────────────────────────────────

const Sidebar: React.FC<SidebarProps> = ({ mode }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, loading: authLoading, logout, openLoginModal } = useAuth()

  // ── 信息栏 ──────────────────────────────────────────────────────────────────

  const renderInfoBar = () => {
    if (mode === 'nav') {
      // 首页/列表页：品牌文案 + 用户信息
      return (
        <div className={styles.infoBar}>
          <div className={styles.brand}>
            <span className={styles.brandLogo}>班园</span>
          </div>
          {renderUserRow()}
        </div>
      )
    }

    // 非首页/列表页：可点击品牌文案 + 面包屑 + 用户信息
    return (
      <div className={styles.infoBar}>
        <div className={styles.brand}>
          <button className={styles.brandLink} onClick={() => navigate('/')}>
            <span className={styles.brandLogo}>班园</span>
          </button>
        </div>
        {renderBreadcrumb()}
        {renderUserRow()}
      </div>
    )
  }

  // ── 面包屑 ──────────────────────────────────────────────────────────────────

  const renderBreadcrumb = () => {
    if (mode === 'settings') {
      return (
        <div className={styles.breadcrumb}>
          <span className={styles.breadcrumbSep}>›</span>
          <span className={styles.breadcrumbCurrent}>设置</span>
        </div>
      )
    }

    if (mode === 'app') {
      return <AppBreadcrumb />
    }

    return null
  }

  // ── 用户信息行 ──────────────────────────────────────────────────────────────

  const renderUserRow = () => {
    if (authLoading) return null

    if (!user) {
      return (
        <div className={styles.userRow}>
          <button className={styles.loginBtn} onClick={openLoginModal}>
            <UserOutlined />
            <span>登录</span>
          </button>
        </div>
      )
    }

    const menuItems: MenuProps['items'] = [
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: '退出登录',
        onClick: () => logout(),
        danger: true,
      },
    ]

    return (
      <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomLeft">
        <div className={styles.userRow} style={{ cursor: 'pointer' }}>
          <Avatar size={24} className={styles.userAvatar}>
            {getInitial(user.username)}
          </Avatar>
          <span className={styles.userName}>{user.username}</span>
        </div>
      </Dropdown>
    )
  }

  // ── 内容区 ──────────────────────────────────────────────────────────────────

  const renderContent = () => {
    if (mode === 'nav') {
      return <NavMenu />
    }
    if (mode === 'settings') {
      return <SettingsNav />
    }
    // app 模式：通过 SidebarSlotTarget 提供 portal 目标，
    // 子页面（UIPage/DatabasePage/FunctionsPage）通过 SidebarSlotContent 将 AiBar portal 到此处
    return <SidebarSlotTarget />
  }

  return (
    <div className={styles.sidebar}>
      {renderInfoBar()}
      <div className={mode === 'app' ? styles.appContent : styles.navContent}>
        {renderContent()}
      </div>
    </div>
  )
}

// ─── 子组件：导航菜单 ────────────────────────────────────────────────────────────

const NavMenu: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()

  const items = [
    { key: '/', label: '首页', icon: <HomeOutlined /> },
    { key: '/applications', label: '应用列表', icon: <AppstoreOutlined /> },
    { key: '/settings', label: '设置', icon: <SettingOutlined /> },
  ]

  return (
    <>
      {items.map((item) => {
        const isActive = location.pathname === item.key
        return (
          <button
            key={item.key}
            className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
            onClick={() => navigate(item.key)}
          >
            <span className={styles.navIcon}>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        )
      })}
    </>
  )
}

// ─── 子组件：设置项列表 ──────────────────────────────────────────────────────────

const SettingsNav: React.FC = () => {
  const settingsItems = [
    { key: 'general', label: '通用设置' },
    { key: 'account', label: '账户设置' },
    { key: 'theme', label: '主题设置' },
  ]

  return (
    <>
      {settingsItems.map((item) => (
        <button
          key={item.key}
          className={styles.settingsItem}
        >
          <span>{item.label}</span>
        </button>
      ))}
    </>
  )
}

// ─── 子组件：应用面包屑（含下拉菜单） ────────────────────────────────────────────

const AppBreadcrumb: React.FC = () => {
  const navigate = useNavigate()

  // 尝试从 AppLayoutCtx 获取应用名
  let appName = '未命名应用'
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const ctx = useAppLayoutCtx()
    if (ctx.appName) appName = ctx.appName
  } catch {
    // 如果不在 AppLayoutCtx 内，使用默认值
  }

  const handleRename = useCallback(() => {
    // TODO: 唤出重命名弹窗
  }, [])

  const menuItems: MenuProps['items'] = [
    { key: 'rename', label: '重命名', onClick: handleRename },
    { key: 'list', label: '切换应用', onClick: () => navigate('/applications') },
    { type: 'divider' },
    { key: 'home', label: '返回首页', onClick: () => navigate('/') },
  ]

  return (
    <div className={styles.breadcrumb}>
      <span className={styles.breadcrumbSep}>›</span>
      <Dropdown menu={{ items: menuItems }} trigger={['click']}>
        <button className={styles.appNameBtn}>
          <span className={styles.appNameText}>{appName}</span>
          <DownOutlined style={{ fontSize: 10 }} />
        </button>
      </Dropdown>
    </div>
  )
}

export default Sidebar
