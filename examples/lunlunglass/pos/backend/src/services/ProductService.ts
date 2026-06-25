import { Product, IProduct } from '../models/index.js'
import { Types } from 'mongoose'

/**
 * 商品查询条件
 */
export interface IProductQuery {
  name?: string
  sku?: string
}

/**
 * 商品查询结果
 */
export interface IProductListResult {
  products: IProduct[]
  total: number
  page: number
  pageSize: number
}

/**
 * 商品服务
 */
class ProductService {
  /**
   * 查询商品列表
   * @param query 查询条件
   * @param page 页码（从1开始）
   * @param pageSize 每页数量
   */
  async getProductList(
    query: IProductQuery = {},
    page: number = 1,
    pageSize: number = 12,
  ): Promise<IProductListResult> {
    try {
      // 构建查询条件
      const filter: any = {}

      if (query.name) {
        filter.name = { $regex: query.name, $options: 'i' }
      }

      if (query.sku) {
        filter.sku = { $regex: query.sku, $options: 'i' }
      }

      // 计算跳过的数量
      const skip = (page - 1) * pageSize

      // 并行查询总数和列表
      const [total, products] = await Promise.all([
        Product.countDocuments(filter),
        Product.find(filter)
          .sort({ createdAt: -1 }) // 按创建时间倒序
          .skip(skip)
          .limit(pageSize)
          .lean(), // 返回纯 JavaScript 对象
      ])

      return {
        products: products as unknown as IProduct[],
        total,
        page,
        pageSize,
      }
    } catch (error) {
      throw new Error(`Failed to get product list: ${error}`)
    }
  }

  /**
   * 根据ID获取商品
   * @param id 商品ID（MongoDB _id）
   */
  async getProductById(id: string): Promise<IProduct | null> {
    try {
      if (!Types.ObjectId.isValid(id)) {
        return null
      }

      const product = await Product.findById(id).lean()
      return product as unknown as IProduct | null
    } catch (error) {
      throw new Error(`Failed to get product: ${error}`)
    }
  }

  /**
   * 创建商品
   * @param productData 商品数据
   */
  async createProduct(productData: {
    name: string
    sku?: string
    unitPrice: number
    description?: string
    imageUrl?: string
    stock?: number
    spec?: string
  }): Promise<IProduct> {
    try {
      // 如果提供了 sku，检查是否已存在
      if (productData.sku) {
        const existingProduct = await Product.findOne({ sku: productData.sku })
        if (existingProduct) {
          throw new Error(`Product with sku "${productData.sku}" already exists`)
        }
      }

      const product = new Product(productData)
      await product.save()
      return product.toObject() as unknown as IProduct
    } catch (error: any) {
      if (error.message.includes('already exists')) {
        throw error
      }
      throw new Error(`Failed to create product: ${error.message || error}`)
    }
  }

  /**
   * 更新商品
   * @param id 商品ID（MongoDB _id）
   * @param updateData 更新数据
   */
  async updateProduct(
    id: string,
    updateData: {
      name?: string
      sku?: string
      unitPrice?: number
      description?: string
      imageUrl?: string
      stock?: number
      spec?: string
    },
  ): Promise<IProduct | null> {
    try {
      if (!Types.ObjectId.isValid(id)) {
        return null
      }

      const product = await Product.findById(id)
      if (!product) {
        return null
      }

      // 如果更新 sku，检查是否与其他商品冲突
      if (updateData.sku && updateData.sku !== product.sku) {
        const existingProduct = await Product.findOne({ sku: updateData.sku })
        if (existingProduct) {
          throw new Error(`Product with sku "${updateData.sku}" already exists`)
        }
      }

      // 更新字段
      if (updateData.name !== undefined) {
        product.name = updateData.name
      }
      if (updateData.sku !== undefined) {
        product.sku = updateData.sku
      }
      if (updateData.unitPrice !== undefined) {
        product.unitPrice = updateData.unitPrice
      }
      if (updateData.description !== undefined) {
        product.description = updateData.description
      }
      if (updateData.imageUrl !== undefined) {
        product.imageUrl = updateData.imageUrl
      }
      if (updateData.stock !== undefined) {
        product.stock = updateData.stock
      }
      if (updateData.spec !== undefined) {
        product.spec = updateData.spec
      }

      await product.save()
      return product.toObject() as unknown as IProduct
    } catch (error: any) {
      throw new Error(`Failed to update product: ${error.message || error}`)
    }
  }

  /**
   * 删除商品
   * @param id 商品ID（MongoDB _id）
   */
  async deleteProduct(id: string): Promise<boolean> {
    try {
      if (!Types.ObjectId.isValid(id)) {
        return false
      }

      const product = await Product.findById(id)
      if (!product) {
        return false
      }

      await product.deleteOne()
      return true
    } catch (error: any) {
      throw new Error(`Failed to delete product: ${error.message || error}`)
    }
  }
}

export default new ProductService()
