/**
 * 认证 Context 与 useAuth hook
 *
 * 将 Context 对象与 hook 从 AuthProvider 组件中拆出，
 * 使 useAuth.tsx 仅导出组件（满足 React Fast Refresh 约束）。
 */

import { createContext, useContext } from 'react'
import type { AuthUser, TokenPair } from '@/api/auth'

export interface AuthContextValue {
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

/** 全局认证状态 hook */
export function useAuth() {
  return useContext(AuthContext)
}
