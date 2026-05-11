import { Template, ITemplate, IPrintConfig } from '../models'
import { Types } from 'mongoose'

/**
 * 模板查询条件
 */
export interface ITemplateQuery {
  name?: string
  id?: string
  tags?: string
  createdBy?: string
}

/**
 * 模板查询结果
 */
export interface ITemplateListResult {
  templates: Partial<ITemplate>[]
  total: number
  page: number
  pageSize: number
}

/**
 * 创建模板数据
 */
export interface ICreateTemplateData {
  id: string
  name: string
  description?: string
  scenes: string[]
  thumbnail?: string
  tags?: string[]
  createdBy?: string
}

/**
 * 更新模板数据
 */
export interface IUpdateTemplateData {
  name?: string
  description?: string
  scenes?: string[]
  thumbnail?: string
  tags?: string[]
  updatedBy?: string
  printConfig?: IPrintConfig | null
}

/**
 * 模板服务
 */
class TemplateService {
  /**
   * 查询模板列表（不返回 scenes 字段，减少传输量）
   */
  async getTemplateList(
    query: ITemplateQuery = {},
    page: number = 1,
    pageSize: number = 12
  ): Promise<ITemplateListResult> {
    try {
      const filter: any = {}

      if (query.name) {
        filter.name = { $regex: query.name, $options: 'i' }
      }

      if (query.id) {
        filter.id = { $regex: query.id, $options: 'i' }
      }

      if (query.tags) {
        filter.tags = { $in: [query.tags] }
      }

      if (query.createdBy) {
        filter.createdBy = query.createdBy
      }

      const skip = (page - 1) * pageSize

      // 列表不返回 scenes（体积大），只返回元信息
      const [total, templates] = await Promise.all([
        Template.countDocuments(filter),
        Template.find(filter)
          .select('-scenes')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(pageSize)
          .lean(),
      ])

      return {
        templates: templates as unknown as Partial<ITemplate>[],
        total,
        page,
        pageSize,
      }
    } catch (error) {
      throw new Error(`Failed to get template list: ${error}`)
    }
  }

  /**
   * 根据ID获取模板详情（含 scenes）
   */
  async getTemplateById(id: string): Promise<ITemplate | null> {
    try {
      if (Types.ObjectId.isValid(id)) {
        const template = await Template.findById(id).lean()
        if (template) return template as unknown as ITemplate
      }

      const template = await Template.findOne({ id }).lean()
      return template as unknown as ITemplate | null
    } catch (error) {
      throw new Error(`Failed to get template: ${error}`)
    }
  }

  /**
   * 创建模板
   */
  async createTemplate(templateData: ICreateTemplateData): Promise<ITemplate> {
    try {
      const existingTemplate = await Template.findOne({ id: templateData.id })
      if (existingTemplate) {
        throw new Error(`Template with id "${templateData.id}" already exists`)
      }

      const template = new Template({
        ...templateData,
        version: 1,
        updatedBy: templateData.createdBy || '',
      })
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
   * 更新模板（version 自增）
   */
  async updateTemplate(
    id: string,
    updateData: IUpdateTemplateData
  ): Promise<ITemplate | null> {
    try {
      let template

      if (Types.ObjectId.isValid(id)) {
        template = await Template.findById(id)
      } else {
        template = await Template.findOne({ id })
      }

      if (!template) {
        return null
      }

      // 更新字段
      if (updateData.name !== undefined) {
        template.name = updateData.name
      }
      if (updateData.description !== undefined) {
        template.description = updateData.description
      }
      if (updateData.scenes !== undefined) {
        template.scenes = updateData.scenes
      }
      if (updateData.thumbnail !== undefined) {
        template.thumbnail = updateData.thumbnail
      }
      if (updateData.tags !== undefined) {
        template.tags = updateData.tags
      }
      if (updateData.updatedBy !== undefined) {
        template.updatedBy = updateData.updatedBy
      }
      if (updateData.printConfig !== undefined) {
        template.printConfig = updateData.printConfig
      }

      // 版本自增
      template.version = (template.version || 0) + 1

      await template.save()
      return template.toObject() as unknown as ITemplate
    } catch (error: any) {
      throw new Error(`Failed to update template: ${error.message || error}`)
    }
  }

  /**
   * 删除模板
   */
  async deleteTemplate(id: string): Promise<boolean> {
    try {
      let template

      if (Types.ObjectId.isValid(id)) {
        template = await Template.findById(id)
      } else {
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
