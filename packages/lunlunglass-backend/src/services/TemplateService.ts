import { Template, ITemplate } from '../models'
import { Types } from 'mongoose'

/**
 * 模板查询条件
 */
export interface ITemplateQuery {
  name?: string
  id?: string
}

/**
 * 模板查询结果
 */
export interface ITemplateListResult {
  templates: ITemplate[]
  total: number
  page: number
  pageSize: number
}

/**
 * 模板服务
 */
class TemplateService {
  /**
   * 查询模板列表
   * @param query 查询条件
   * @param page 页码（从1开始）
   * @param pageSize 每页数量
   */
  async getTemplateList(
    query: ITemplateQuery = {},
    page: number = 1,
    pageSize: number = 12
  ): Promise<ITemplateListResult> {
    try {
      // 构建查询条件
      const filter: any = {}

      if (query.name) {
        filter.name = { $regex: query.name, $options: 'i' }
      }

      if (query.id) {
        filter.id = { $regex: query.id, $options: 'i' }
      }

      // 计算跳过的数量
      const skip = (page - 1) * pageSize

      // 并行查询总数和列表
      const [total, templates] = await Promise.all([
        Template.countDocuments(filter),
        Template.find(filter)
          .sort({ createdAt: -1 }) // 按创建时间倒序
          .skip(skip)
          .limit(pageSize)
          .lean(), // 返回纯 JavaScript 对象
      ])

      return {
        templates: templates as unknown as ITemplate[],
        total,
        page,
        pageSize,
      }
    } catch (error) {
      throw new Error(`Failed to get template list: ${error}`)
    }
  }

  /**
   * 根据ID获取模板
   * @param id 模板ID（MongoDB _id 或 id）
   */
  async getTemplateById(id: string): Promise<ITemplate | null> {
    try {
      // 先尝试作为 MongoDB ObjectId 查询
      if (Types.ObjectId.isValid(id)) {
        const template = await Template.findById(id).lean()
        if (template) return template as unknown as ITemplate
      }

      // 如果不是 ObjectId 或查询失败，尝试作为 id 查询
      const template = await Template.findOne({ id }).lean()
      return template as unknown as ITemplate | null
    } catch (error) {
      throw new Error(`Failed to get template: ${error}`)
    }
  }

  /**
   * 创建模板
   * @param templateData 模板数据
   */
  async createTemplate(templateData: {
    id: string
    name: string
    template: string
  }): Promise<ITemplate> {
    try {
      // 检查 id 是否已存在
      const existingTemplate = await Template.findOne({ id: templateData.id })
      if (existingTemplate) {
        throw new Error(`Template with id "${templateData.id}" already exists`)
      }

      const template = new Template(templateData)
      await template.save()
      return template.toObject() as unknown as ITemplate
    } catch (error: any) {
      if (error.message.includes('already exists')) {
        throw error
      }
      throw new Error(`Failed to create template: ${error.message || error}`)
    }
  }

  /**
   * 更新模板
   * @param id 模板ID（MongoDB _id 或 id）
   * @param updateData 更新数据（不能包含 id）
   */
  async updateTemplate(
    id: string,
    updateData: {
      name?: string
      template?: string
    }
  ): Promise<ITemplate | null> {
    try {
      let template

      // 先尝试作为 MongoDB ObjectId 查询
      if (Types.ObjectId.isValid(id)) {
        template = await Template.findById(id)
      } else {
        // 如果不是 ObjectId，尝试作为 id 查询
        template = await Template.findOne({ id })
      }

      if (!template) {
        return null
      }

      // 更新字段
      if (updateData.name !== undefined) {
        template.name = updateData.name
      }
      if (updateData.template !== undefined) {
        template.template = updateData.template
      }

      await template.save()
      return template.toObject() as unknown as ITemplate
    } catch (error: any) {
      throw new Error(`Failed to update template: ${error.message || error}`)
    }
  }

  /**
   * 删除模板
   * @param id 模板ID（MongoDB _id 或 id）
   */
  async deleteTemplate(id: string): Promise<boolean> {
    try {
      let template

      // 先尝试作为 MongoDB ObjectId 查询
      if (Types.ObjectId.isValid(id)) {
        template = await Template.findById(id)
      } else {
        // 如果不是 ObjectId，尝试作为 id 查询
        template = await Template.findOne({ id })
      }

      if (!template) {
        return false
      }

      await template.deleteOne()
      return true
    } catch (error: any) {
      throw new Error(`Failed to delete template: ${error.message || error}`)
    }
  }
}

export default new TemplateService()

