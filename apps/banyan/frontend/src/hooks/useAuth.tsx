/**
 * useAuth — 全局认证状态 hook
 *
 * 提供：
 * - user: 当前登录用户信息（null 表示未登录）
 * - loading: 初始化加载中
 * - login: 登录后保存 token + 更新 user
 * - logout: 清除 token + 重置 user
 * - openLoginModal / closeLoginModal: 控制登录弹窗
 * - loginModalOpen: 弹窗是否打开
 */

import { useState, useEffect, useCallback, createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { authApi } from '@/api'
import type { AuthUser, TokenPair } from '@/api/auth'

const TOKEN_KEY = 'banyan_access_token'
const REFRESH_TOKEN_KEY = 'banyan_refresh_token'

// ─── Context ──────────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  loginModalOpen: boolean
  login: (user: AuthUser, tokens: TokenPair) => void
  logout: () => void
  openLoginModal: () => void
  closeLoginModal: () => void
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  loginModalOpen: false,
  login: () => {},
  logout: () => {},
  openLoginModal: () => {},
  closeLoginModal: () => {},
})

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [loginModalOpen, setLoginModalOpen] = useState(false)

  // 初始化：从 localStorage 恢复登录态
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) {
      setLoading(false)
      return
    }
    authApi
      .me()
      .then((res) => {
        if (res.data) setUser(res.data)
      })
      .catch(() => {
        // token 失效，清除
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(REFRESH_TOKEN_KEY)
      })
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback((userData: AuthUser, tokens: TokenPair) => {
    localStorage.setItem(TOKEN_KEY, tokens.accessToken)
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken)
    setUser(userData)
    setLoginModalOpen(false)
  }, [])

  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY)
    if (refreshToken) {
      try {
        await authApi.logout(refreshToken)
      } catch {
        // ignore
      }
    }
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
    setUser(null)
  }, [])

  const openLoginModal = useCallback(() => setLoginModalOpen(true), [])
  const closeLoginModal = useCallback(() => setLoginModalOpen(false), [])

  const contextValue = { user, loading, loginModalOpen, login, logout, openLoginModal, closeLoginModal }

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth() {
  return useContext(AuthContext)
}
