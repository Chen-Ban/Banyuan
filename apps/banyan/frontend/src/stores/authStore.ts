/**
 * AuthStore — 全局认证状态（zustand）
 *
 * 单一事实来源，统一管理用户身份信息和 token 生命周期。
 *
 * 提供：
 *   - user: 当前登录用户（null 表示未登录）
 *   - loading: 初始化恢复会话中
 *   - loginModalOpen: 登录弹窗开关
 *   - login / logout: 登录/登出 action
 *   - openLoginModal / closeLoginModal: 弹窗控制
 *   - getAccessToken(): 同步获取当前 accessToken（供 API 层使用）
 *   - setTokens(): 供 API 层刷新 token 后回写
 *   - clearAuth(): 供 API 层 401 清除登录态
 *   - init(): 应用启动时恢复会话
 */

import { create } from 'zustand'
import { authApi } from '@/api'
import type { AuthUser, TokenPair } from '@/api/auth'

const TOKEN_KEY = 'banyan_access_token'
const REFRESH_TOKEN_KEY = 'banyan_refresh_token'

export interface AuthState {
  user: AuthUser | null
  loading: boolean
  loginModalOpen: boolean
}

export interface AuthActions {
  /** 登录成功后保存用户和 token */
  login: (user: AuthUser, tokens: TokenPair) => void
  /** 登出（调用后端 + 清除本地） */
  logout: () => Promise<void>
  /** 打开登录弹窗 */
  openLoginModal: () => void
  /** 关闭登录弹窗 */
  closeLoginModal: () => void
  /** 同步获取当前 accessToken（供 api/client.ts 使用） */
  getAccessToken: () => string | null
  /** API 层刷新 token 后回写 */
  setTokens: (tokens: TokenPair) => void
  /** API 层 401 时清除登录态 */
  clearAuth: () => void
  /** 应用启动时恢复会话 */
  init: () => Promise<void>
}

export type AuthStore = AuthState & AuthActions

export const useAuthStore = create<AuthStore>((set) => ({
  // ── State ──────────────────────────────────────────────────────────────────
  user: null,
  loading: true,
  loginModalOpen: false,

  // ── Actions ────────────────────────────────────────────────────────────────

  login: (user, tokens) => {
    localStorage.setItem(TOKEN_KEY, tokens.accessToken)
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken)
    set({ user, loginModalOpen: false })
  },

  logout: async () => {
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
    set({ user: null })
  },

  openLoginModal: () => set({ loginModalOpen: true }),
  closeLoginModal: () => set({ loginModalOpen: false }),

  getAccessToken: () => localStorage.getItem(TOKEN_KEY),

  setTokens: (tokens) => {
    localStorage.setItem(TOKEN_KEY, tokens.accessToken)
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken)
  },

  clearAuth: () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
    set({ user: null })
  },

  init: async () => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) {
      // 没有 access token，尝试用 refresh token 恢复
      const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY)
      if (!refreshToken) {
        set({ loading: false })
        return
      }
      try {
        const res = await authApi.refresh(refreshToken)
        if (res.data) {
          localStorage.setItem(TOKEN_KEY, res.data.accessToken)
          localStorage.setItem(REFRESH_TOKEN_KEY, res.data.refreshToken)
          const meRes = await authApi.me()
          if (meRes?.data) {
            set({ user: meRes.data, loading: false })
            return
          }
        }
      } catch {
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(REFRESH_TOKEN_KEY)
      }
      set({ loading: false })
      return
    }
    // 有 access token，验证是否有效
    try {
      const res = await authApi.me()
      if (res.data) {
        set({ user: res.data, loading: false })
        return
      }
    } catch {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(REFRESH_TOKEN_KEY)
    }
    set({ loading: false })
  },
}))
