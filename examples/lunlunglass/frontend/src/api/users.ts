import { get, post, put, del } from './client'
import type { ApiResponse } from './client'
import type { User, UserFormData, UserFilters } from '@/types'

interface UserListResponse {
  success: boolean
  data: {
    users: User[]
    total: number
    page: number
    pageSize: number
  }
}

/**
 * 获取用户列表
 */
export function fetchUsers(
  page: number = 1,
  pageSize: number = 12,
  filters?: UserFilters
): Promise<UserListResponse> {
  return get<UserListResponse>('/users', {
    page,
    pageSize,
    ...filters,
  })
}

/**
 * 搜索用户（用于下拉选择）
 */
export function searchUsers(keyword: string): Promise<UserListResponse> {
  return get<UserListResponse>('/users', {
    username: keyword,
    page: 1,
    pageSize: 20,
  })
}

/**
 * 获取用户详情
 */
export function fetchUser(id: string): Promise<ApiResponse<User & { optometry?: import('@/types').OptometryParams }>> {
  return get<ApiResponse<User & { optometry?: import('@/types').OptometryParams }>>(`/users/${id}`)
}

/**
 * 创建用户
 */
export function createUser(data: UserFormData): Promise<ApiResponse<User>> {
  return post<ApiResponse<User>>('/users', data)
}

/**
 * 更新用户
 */
export function updateUser(id: string, data: UserFormData): Promise<ApiResponse<User>> {
  return put<ApiResponse<User>>(`/users/${id}`, data)
}

/**
 * 删除用户
 */
export function deleteUser(id: string): Promise<ApiResponse<null>> {
  return del<ApiResponse<null>>(`/users/${id}`)
}
