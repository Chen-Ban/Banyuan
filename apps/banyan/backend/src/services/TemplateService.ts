import { Template, ITemplate } from '../models'
import { Types } from 'mongoose'

export interface ITemplateQuery {
  name?: string
  id?: string
  tags?: string
  createdBy?: string
}

export interface ITemplateListResult {
  templates: Partial<ITemplate>[]
  total: number
  page: number
  pageSize: number
}

export interface ICreateTemplateData {
  id: string
  name: string
  description?: string
  scenes: string[]
  thumbnail?: string
  tags?: string[]
  createdBy?: string
}

export interface IUpdateTemplateData {
  name?: string
  description?: string
  scenes?: string[]
  thumbnail?: string
  tags?: string[]
  updatedBy?: string
}

class TemplateService {
  /**
   * 查询模板列表（不返回 scenes 字段，减少传输量）
   */
  async getTemplateList(
    query: ITemplateQuery = {},
    page: number = 1,
    pageSize: number = 12
  ): Promise<ITemplateListResult> {
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
  }

  /**
   * 根据ID获取模板详情（含 scenes）
   */
  async getTemplateById(id: string): Promise<ITemplate | null> {
    if (Types.ObjectId.isValid(id)) {
      const template = await Template.findById(id).lean()
      if (template) return template as unknown as ITemplate
    }

    const template = await Template.findOne({ id }).lean()
    return template as unknown as ITemplate | null
  }

  /**
   * 创建模板
   */
  async createTemplate(templateData: ICreateTemplateData): Promise<ITemplate> {
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
  }

  /**
   * 更新模板（version 自增）
   */
  async updateTemplate(
    id: string,
    updateData: IUpdateTemplateData
  ): Promise<ITemplate | null> {
    let template

    if (Types.ObjectId.isValid(id)) {
      template = await Template.findById(id)
    } else {
      template = await Template.findOne({ id })
    }

    if (!template) {
      return null
    }

    if (updateData.name !== undefined) template.name = updateData.name
    if (updateData.description !== undefined) template.description = updateData.description
    if (updateData.scenes !== undefined) template.scenes = updateData.scenes
    if (updateData.thumbnail !== undefined) template.thumbnail = updateData.thumbnail
    if (updateData.tags !== undefined) template.tags = updateData.tags
    if (updateData.updatedBy !== undefined) template.updatedBy = updateData.updatedBy

    template.version = (template.version || 0) + 1

    await template.save()
    return template.toObject() as unknown as ITemplate
  }

  /**
   * 删除模板
   */
  async deleteTemplate(id: string): Promise<boolean> {
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
  }
}

export default new TemplateService()
