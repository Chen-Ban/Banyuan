/**
 * UserWidget — 右上角用户头像 / 登录按钮
 *
 * - 未登录：显示「登录」按钮，点击打开 LoginModal
 * - 已登录：显示用户头像（首字母），点击展开下拉菜单（含「退出登录」）
 */

import { useCallback } from 'react'
import { Dropdown, Avatar, Spin } from 'antd'
import type { MenuProps } from 'antd'
import { LogoutOutlined, UserOutlined } from '@ant-design/icons'
import { useAuth } from '@/hooks/useAuth'
import styles from './index.module.scss'

// ─── 工具：取用户名首字母 ──────────────────────────────────────────────────────

function getInitial(username: string): string {
  return username.charAt(0).toUpperCase()
}

// ─── 组件 ─────────────────────────────────────────────────────────────────────

const UserWidget = () => {
  const { user, loading, logout, openLoginModal } = useAuth()

  const handleLogout = useCallback(async () => {
    await logout()
  }, [logout])

  const menuItems: MenuProps['items'] = [
    {
      key: 'info',
      label: (
        <div className={styles.menuInfo}>
          <span className={styles.menuUsername}>{user?.username}</span>
          <span className={styles.menuPhone}>{user?.phone ?? user?.email ?? ''}</span>
        </div>
      ),
      disabled: true,
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: handleLogout,
      danger: true,
    },
  ]

  if (loading) {
    return (
      <div className={styles.widget}>
        <Spin size="small" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className={styles.widget}>
        <button className={styles.loginBtn} onClick={openLoginModal}>
          <UserOutlined />
          <span>登录</span>
        </button>
      </div>
    )
  }

  return (
    <div className={styles.widget}>
      <Dropdown menu={{ items: menuItems }} placement="bottomRight" trigger={['click']}>
        <button className={styles.avatarBtn} aria-label="用户菜单">
          <Avatar className={styles.avatar} size={32}>
            {getInitial(user.username)}
          </Avatar>
        </button>
      </Dropdown>
    </div>
  )
}

export default UserWidget
