import { Context } from 'koa'
import productService from '../services/ProductService.js'

/**
 * 创建商品请求体
 */
interface CreateProductRequest {
  name: string
  sku?: string
  unitPrice: number
  description?: string
  imageUrl?: string
  stock?: number
  spec?: string
}

/**
 * 更新商品请求体
 */
interface UpdateProductRequest {
  name?: string
  sku?: string
  unitPrice?: number
  description?: string
  imageUrl?: string
  stock?: number
  spec?: string
}

/**
 * 商品控制器
 */
class ProductController {
  /**
   * 获取商品列表
   * GET /api/products
   * Query参数: name, sku, page, pageSize
   */
  async getProductList(ctx: Context) {
    try {
      const {
        name,
        sku,
        page = '1',
        pageSize = '12',
      } = ctx.query

      const query = {
        name: name as string | undefined,
        sku: sku as string | undefined,
      }

      // 移除 undefined 值
      Object.keys(query).forEach(
        (key) => query[key as keyof typeof query] === undefined && delete query[key as keyof typeof query]
      )

      const result = await productService.getProductList(
        query,
        parseInt(page as string, 10),
        parseInt(pageSize as string, 10)
      )

      ctx.status = 200
      ctx.body = {
        success: true,
        data: result,
      }
    } catch (error: any) {
      ctx.status = 500
      ctx.body = {
        success: false,
        message: error.message || 'Failed to get product list',
      }
    }
  }

  /**
   * 根据ID获取商品详情
   * GET /api/products/:id
   */
  async getProductById(ctx: Context) {
    try {
      const { id } = ctx.params
      const product = await productService.getProductById(id)

      if (!product) {
        ctx.status = 404
        ctx.body = {
          success: false,
          message: 'Product not found',
        }
        return
      }

      ctx.status = 200
      ctx.body = {
        success: true,
        data: product,
      }
    } catch (error: any) {
      ctx.status = 500
      ctx.body = {
        success: false,
        message: error.message || 'Failed to get product',
      }
    }
  }

  /**
   * 创建商品
   * POST /api/products
   */
  async createProduct(ctx: Context) {
    try {
      const productData = ctx.request.body as CreateProductRequest

      // 验证必填字段
      if (!productData.name || productData.unitPrice === undefined) {
        ctx.status = 400
        ctx.body = {
          success: false,
          message: 'name and unitPrice are required',
        }
        return
      }

      const product = await productService.createProduct(productData)

      ctx.status = 201
      ctx.body = {
        success: true,
        data: product,
        message: 'Product created successfully',
      }
    } catch (error: any) {
      ctx.status = error.message.includes('already exists') ? 409 : 500
      ctx.body = {
        success: false,
        message: error.message || 'Failed to create product',
      }
    }
  }

  /**
   * 更新商品
   * PUT /api/products/:id
   */
  async updateProduct(ctx: Context) {
    try {
      const { id } = ctx.params
      const updateData = ctx.request.body as UpdateProductRequest

      const product = await productService.updateProduct(id, updateData)

      if (!product) {
        ctx.status = 404
        ctx.body = {
          success: false,
          message: 'Product not found',
        }
        return
      }

      ctx.status = 200
      ctx.body = {
        success: true,
        data: product,
        message: 'Product updated successfully',
      }
    } catch (error: any) {
      ctx.status = error.message.includes('already exists') ? 409 : 500
      ctx.body = {
        success: false,
        message: error.message || 'Failed to update product',
      }
    }
  }

  /**
   * 删除商品
   * DELETE /api/products/:id
   */
  async deleteProduct(ctx: Context) {
    try {
      const { id } = ctx.params
      const deleted = await productService.deleteProduct(id)

      if (!deleted) {
        ctx.status = 404
        ctx.body = {
          success: false,
          message: 'Product not found',
        }
        return
      }

      ctx.status = 200
      ctx.body = {
        success: true,
        message: 'Product deleted successfully',
      }
    } catch (error: any) {
      ctx.status = 500
      ctx.body = {
        success: false,
        message: error.message || 'Failed to delete product',
      }
    }
  }
}

export default new ProductController()

