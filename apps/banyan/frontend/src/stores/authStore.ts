/**
 * AuthStore — 全局认证状态（zustand）
 *
 * 单一事实来源，统一管理用户身份信息和 token 生命周期。
 *
 * 会话恢复策略（init）：
 *   ① 用 localStorage 中的 accessToken 调 /auth/me 验证
 *   ② 若 token 过期/无效，用 refreshToken 调 /auth/refresh 静默续期
 *   ③ 若 refreshToken 也过期，清除本地 token，等待用户登录
 *
 * init() 使用裸 fetch 绕过 client.ts 的 request() 拦截器，
 * 确保认证初始化流程显式可控，不依赖拦截器隐式刷新。
 * 拦截器（tryRefreshToken）继续服务于业务 API 的 401 自动续期。
 *
 * 提供：
 *   - user: 当前登录用户（null 表示未登录）
 *   - loading: 初始化恢复会话中
 *   - loginModalOpen: 登录弹窗开关
 *   - login / logout: 登录/登出 action
 *   - openLoginModal / closeLoginModal: 弹窗控制
 *   - getAccessToken(): 同步获取当前 accessToken（供 API 层使用）
 *   - setTokens(): 供 API 层刷新 token 后回写 localStorage
 *   - clearAuth(): 供 API 层 401 清除登录态
 *   - init(): 应用启动时恢复会话
 */

import { create } from 'zustand'
import { authApi } from '@/api'
import type { AuthUser, TokenPair } from '@/api/auth'

const TOKEN_KEY = 'banyan_access_token'
const REFRESH_TOKEN_KEY = 'banyan_refresh_token'

type PendingLoginResolver = (success: boolean) => void

export interface AuthState {
  user: AuthUser | null
  loading: boolean
  loginModalOpen: boolean
  /** 等待登录完成的 Promise resolver（null 表示没有等待者） */
  pendingLoginResolver: PendingLoginResolver | null
}

export interface AuthActions {
  /** 登录成功后保存用户和 token */
  login: (user: AuthUser, tokens: TokenPair) => void
  /** 登出（调用后端 + 清除本地） */
  logout: () => Promise<void>
  /** 打开登录弹窗并返回 Promise，登录成功 resolve(true)，取消 resolve(false) */
  requestLogin: () => Promise<boolean>
  /** 打开登录弹窗（不需要等待结果时使用） */
  openLoginModal: () => void
  /** 关闭登录弹窗 */
  closeLoginModal: () => void
  /** 同步获取当前 accessToken（供 api/client.ts 使用） */
  getAccessToken: () => string | null
  /** API 层刷新 token 后回写 localStorage */
  setTokens: (tokens: TokenPair) => void
  /** API 层 401 时清除登录态 */
  clearAuth: () => void
  /** 应用启动时恢复会话 */
  init: () => Promise<void>
}

export type AuthStore = AuthState & AuthActions

// ─── 裸 fetch（绕过 client.ts request() 拦截器） ────────────────────────────

const BASE_URL = '/api'

/**
 * 用指定 accessToken 调 /auth/me，返回用户信息或 null。
 * 绕过 request() 拦截器，使 init() 能显式控制刷新流程。
 */
async function tryFetchMe(accessToken: string): Promise<AuthUser | null> {
  try {
    const res = await fetch(`${BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.success && data.data ? (data.data as AuthUser) : null
  } catch {
    return null // 网络异常
  }
}

/**
 * 用 refreshToken 调 /auth/refresh，返回新 token 对或 null。
 * 绕过 request() 拦截器，避免拦截器隐式刷新干扰 init() 状态机。
 */
async function tryFetchRefresh(refreshToken: string): Promise<TokenPair | null> {
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.success && data.data ? (data.data as TokenPair) : null
  } catch {
    return null // 网络异常
  }
}

// ─── token 持久化 ────────────────────────────────────────────────────────────

function persistTokens(tokens: TokenPair): void {
  localStorage.setItem(TOKEN_KEY, tokens.accessToken)
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken)
}

function clearPersistedTokens(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthStore>((set, get) => ({
  // ── State ──────────────────────────────────────────────────────────────────
  user: null,
  loading: true,
  loginModalOpen: false,
  pendingLoginResolver: null,

  // ── Actions ────────────────────────────────────────────────────────────────

  login: (user, tokens) => {
    persistTokens(tokens)
    const pending = get().pendingLoginResolver
    if (pending) {
      // 先通知等待者，再更新 state（让调用方拿到最新 user 后继续）
      pending(true)
      set({ user, loginModalOpen: false, pendingLoginResolver: null })
    } else {
      set({ user, loginModalOpen: false })
    }
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
    clearPersistedTokens()
    set({ user: null })
  },

  requestLogin: () => {
    // 如果已有等待者，先 resolve(false) 通知旧的放弃
    const old = get().pendingLoginResolver
    if (old) old(false)
    return new Promise<boolean>((resolve) => {
      set({ loginModalOpen: true, pendingLoginResolver: resolve })
    })
  },

  openLoginModal: () => set({ loginModalOpen: true }),

  closeLoginModal: () => {
    const pending = get().pendingLoginResolver
    if (pending) {
      pending(false)
      set({ loginModalOpen: false, pendingLoginResolver: null })
    } else {
      set({ loginModalOpen: false })
    }
  },

  getAccessToken: () => localStorage.getItem(TOKEN_KEY),

  setTokens: (tokens) => {
    persistTokens(tokens)
  },

  clearAuth: () => {
    clearPersistedTokens()
    set({ user: null })
  },

  init: async () => {
    // ── ① 尝试验证 accessToken ──
    const accessToken = localStorage.getItem(TOKEN_KEY)
    if (accessToken) {
      const user = await tryFetchMe(accessToken)
      if (user) {
        console.log('[Auth] 会话恢复成功（accessToken 有效）')
        set({ user, loading: false })
        return
      }
      console.log('[Auth] accessToken 已过期，尝试 refreshToken 续期…')
    }

    // ── ② 尝试 refreshToken 刷新 ──
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY)
    if (refreshToken) {
      const tokens = await tryFetchRefresh(refreshToken)
      if (tokens) {
        persistTokens(tokens)
        const user = await tryFetchMe(tokens.accessToken)
        if (user) {
          console.log('[Auth] 会话恢复成功（refreshToken 续期）')
          set({ user, loading: false })
          return
        }
      }
      console.log('[Auth] refreshToken 已过期，需要重新登录')
    } else {
      console.log('[Auth] 无本地凭证，等待用户登录')
    }

    // ── ③ 需要登录 ──
    clearPersistedTokens()
    set({ user: null, loading: false })
  },
}))
