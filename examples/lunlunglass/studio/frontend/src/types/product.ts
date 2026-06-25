/**
 * 产品相关类型定义
 */

/**
 * 产品基础信息
 */
export interface Product {
  /** 产品唯一ID */
  id: string
  /** 产品名称 */
  name: string
  /** 产品编码或SKU */
  sku?: string
  /** 单价（元） */
  unitPrice: number
  /** 产品描述 */
  description?: string
  /** 产品封面图 */
  imageUrl?: string
  /** 库存数量 */
  stock?: number
  /** 规格/型号 */
  spec?: string
}

/**
 * 产品筛选条件
 */
export interface ProductFilters {
  name?: string
  sku?: string
}
