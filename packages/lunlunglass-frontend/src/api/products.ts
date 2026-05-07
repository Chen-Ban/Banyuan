import { get, post, put, del } from './client'
import type { ApiResponse } from './client'
import type { Product, ProductFilters } from '@/types'

interface ProductListResponse {
  success: boolean
  data: {
    products: Product[]
    total: number
    page: number
    pageSize: number
  }
}

/**
 * 获取产品列表
 */
export function fetchProducts(
  page: number = 1,
  pageSize: number = 20,
  filters?: ProductFilters
): Promise<ProductListResponse> {
  return get<ProductListResponse>('/products', {
    page,
    pageSize,
    ...filters,
  })
}

/**
 * 搜索产品（用于下拉选择）
 */
export function searchProducts(keyword: string): Promise<ProductListResponse> {
  return get<ProductListResponse>('/products', {
    name: keyword,
    page: 1,
    pageSize: 20,
  })
}

/**
 * 获取产品详情
 */
export function fetchProduct(id: string): Promise<ApiResponse<Product>> {
  return get<ApiResponse<Product>>(`/products/${id}`)
}

/**
 * 创建产品
 */
export function createProduct(data: Omit<Product, 'id'>): Promise<ApiResponse<Product>> {
  return post<ApiResponse<Product>>('/products', data)
}

/**
 * 更新产品
 */
export function updateProduct(id: string, data: Partial<Product>): Promise<ApiResponse<Product>> {
  return put<ApiResponse<Product>>(`/products/${id}`, data)
}

/**
 * 删除产品
 */
export function deleteProduct(id: string): Promise<ApiResponse<null>> {
  return del<ApiResponse<null>>(`/products/${id}`)
}
