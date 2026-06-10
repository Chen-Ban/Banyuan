/**
 * ProtectedRoute — 前端路由守卫
 *
 * 包裹需要登录才能访问的路由。
 * - 加载中：显示空白（避免闪烁）
 * - 未登录：弹出登录弹窗，不跳转页面（保持当前 URL，登录后自动恢复）
 * - 已登录：正常渲染子路由
 */

import { useAuth } from '@/hooks/authContext'
import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'

export default function ProtectedRoute() {
  const { user, loading, openLoginModal } = useAuth()

  useEffect(() => {
    if (!loading && !user) {
      openLoginModal()
    }
  }, [loading, user, openLoginModal])

  if (loading) {
    return null
  }

  if (!user) {
    // 未登录时显示空白，LoginModal 由 AuthProvider 全局渲染
    return null
  }

  return <Outlet />
}
