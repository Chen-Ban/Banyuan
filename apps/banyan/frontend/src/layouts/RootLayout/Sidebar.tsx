/**
 * Sidebar — 左侧导航栏
 *
 * 顶部信息栏为横向面包屑：品牌 / 用户头像 / 页面标题
 * 下方根据 mode 渲染不同的内容：
 *   - nav：导航菜单（首页/列表/设置）
 *   - settings：设置项列表
 *   - app：AiBar（通过 Portal 注入）
 */

import { useCallback, useState } from 'react'
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
  GithubOutlined,
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
  const { user, loading: authLoading, logout, openLoginModal } = useAuth()

  // ── 横向面包屑信息栏 ────────────────────────────────────────────────────────

  const renderInfoBar = () => {
    return (
      <div className={styles.infoBar}>
        {/* 品牌 Logo */}
        <button className={styles.brandLink} onClick={() => navigate('/')}>
          <span className={styles.brandLogo}>Banyan</span>
        </button>

        {/* 分隔符 */}
        <span className={styles.breadcrumbSep}>/</span>

        {/* 用户头像 */}
        {renderUserAvatar()}

        {/* 分隔符 + 页面标题（非首页时显示） */}
        {mode !== 'nav' && (
          <>
            <span className={styles.breadcrumbSep}>/</span>
            {renderPageTitle()}
          </>
        )}
      </div>
    )
  }

  // ── 用户头像（面包屑中的一环） ──────────────────────────────────────────────

  const renderUserAvatar = () => {
    if (authLoading) return null

    if (!user) {
      return (
        <button className={styles.avatarBtn} onClick={openLoginModal}>
          <Avatar size={22} icon={<UserOutlined />} className={styles.userAvatar} />
        </button>
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
        <button className={styles.avatarBtn}>
          <Avatar size={22} className={styles.userAvatar}>
            {getInitial(user.username)}
          </Avatar>
        </button>
      </Dropdown>
    )
  }

  // ── 页面标题（面包屑最后一段） ──────────────────────────────────────────────

  const renderPageTitle = () => {
    if (mode === 'settings') {
      return <span className={styles.pageTitle}>设置</span>
    }
    if (mode === 'app') {
      return <AppBreadcrumb />
    }
    return null
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
      <div className={styles.bottomSection}>
        <a
          className={styles.githubLink}
          href="https://github.com/Chen-Ban/Banyuan"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub"
        >
          <GithubOutlined />
        </a>
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

// ─── 子组件：设置项列表（复用 navItem 样式，保持一致） ──────────────────────────────

const SettingsNav: React.FC = () => {
  const [activeKey, setActiveKey] = useState('general')

  const settingsItems = [
    { key: 'general', label: '通用设置', icon: <SettingOutlined /> },
    { key: 'account', label: '账户设置', icon: <UserOutlined /> },
  ]

  return (
    <>
      {settingsItems.map((item) => (
        <button
          key={item.key}
          className={`${styles.navItem} ${activeKey === item.key ? styles.navItemActive : ''}`}
          onClick={() => setActiveKey(item.key)}
        >
          <span className={styles.navIcon}>{item.icon}</span>
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
    <Dropdown menu={{ items: menuItems }} trigger={['click']}>
      <button className={styles.appNameBtn}>
        <span className={styles.appNameText}>{appName}</span>
        <DownOutlined style={{ fontSize: 10 }} />
      </button>
    </Dropdown>
  )
}

export default Sidebar
