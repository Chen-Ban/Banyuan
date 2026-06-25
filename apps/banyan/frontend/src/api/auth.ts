import { get, post } from './client'
import type { ApiResponse } from './client'

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

export interface AuthUser {
  userId: string
  tenantId: string
  email?: string
  phone?: string
  username: string
  role: 'owner' | 'admin' | 'member'
  status: string
}

/**
 * 刷新 access token
 */
export function refresh(refreshToken: string): Promise<ApiResponse<TokenPair>> {
  return post<ApiResponse<TokenPair>>('/auth/refresh', { refreshToken })
}

/**
 * 登出（吊销 refresh token）
 */
export function logout(refreshToken: string): Promise<ApiResponse<null>> {
  return post<ApiResponse<null>>('/auth/logout', { refreshToken })
}

/**
 * 获取当前登录用户信息
 */
export function me(): Promise<ApiResponse<AuthUser>> {
  return get<ApiResponse<AuthUser>>('/auth/me')
}

/**
 * 发送手机验证码
 * 开发环境下响应中会包含 code 字段
 */
export function sendSmsCode(phone: string): Promise<ApiResponse<{ code?: string } | null>> {
  return post<ApiResponse<{ code?: string } | null>>('/auth/sms/send', { phone })
}

/**
 * 手机号验证码登录
 */
export function loginByPhone(
  phone: string,
  code: string,
): Promise<ApiResponse<{ user: AuthUser; tokens: TokenPair; isNewUser: boolean }>> {
  return post<ApiResponse<{ user: AuthUser; tokens: TokenPair; isNewUser: boolean }>>('/auth/sms/verify', {
    phone,
    code,
  })
}
