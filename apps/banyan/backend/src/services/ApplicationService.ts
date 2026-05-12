import { Application, IApplication } from '../models'
import { Types } from 'mongoose'

export interface IApplicationQuery {
  name?: string
  id?: string
  tags?: string
  createdBy?: string
}

export interface IApplicationListResult {
  applications: Partial<IApplication>[]
  total: number
  page: number
  pageSize: number
}

export interface ICreateApplicationData {
  id: string
  name: string
  description?: string
  pages: string[]
  thumbnail?: string
  tags?: string[]
  createdBy?: string
}

export interface IUpdateApplicationData {
  name?: string
  description?: string
  pages?: string[]
  thumbnail?: string
  tags?: string[]
  updatedBy?: string
}

class ApplicationService {
  /**
   * 查询应用列表（不返回 pages 字段，减少传输量）
   */
  async getApplicationList(
    query: IApplicationQuery = {},
    page: number = 1,
    pageSize: number = 12
  ): Promise<IApplicationListResult> {
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

    const [total, applications] = await Promise.all([
      Application.countDocuments(filter),
      Application.find(filter)
        .select('-pages')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
    ])

    return {
      applications: applications as unknown as Partial<IApplication>[],
      total,
      page,
      pageSize,
    }
  }

  /**
   * 根据ID获取应用详情（含 pages）
   */
  async getApplicationById(id: string): Promise<IApplication | null> {
    if (Types.ObjectId.isValid(id)) {
      const application = await Application.findById(id).lean()
      if (application) return application as unknown as IApplication
    }

    const application = await Application.findOne({ id }).lean()
    return application as unknown as IApplication | null
  }

  /**
   * 创建应用
   */
  async createApplication(data: ICreateApplicationData): Promise<IApplication> {
    const existing = await Application.findOne({ id: data.id })
    if (existing) {
      throw new Error(`Application with id "${data.id}" already exists`)
    }

    const application = new Application({
      ...data,
      version: 1,
      updatedBy: data.createdBy || '',
    })
    await application.save()
    return application.toObject() as unknown as IApplication
  }

  /**
   * 更新应用（version 自增）
   */
  async updateApplication(
    id: string,
    updateData: IUpdateApplicationData
  ): Promise<IApplication | null> {
    let application

    if (Types.ObjectId.isValid(id)) {
      application = await Application.findById(id)
    } else {
      application = await Application.findOne({ id })
    }

    if (!application) {
      return null
    }

    if (updateData.name !== undefined) application.name = updateData.name
    if (updateData.description !== undefined) application.description = updateData.description
    if (updateData.pages !== undefined) application.pages = updateData.pages
    if (updateData.thumbnail !== undefined) application.thumbnail = updateData.thumbnail
    if (updateData.tags !== undefined) application.tags = updateData.tags
    if (updateData.updatedBy !== undefined) application.updatedBy = updateData.updatedBy

    application.version = (application.version || 0) + 1

    await application.save()
    return application.toObject() as unknown as IApplication
  }

  /**
   * 删除应用
   */
  async deleteApplication(id: string): Promise<boolean> {
    let application

    if (Types.ObjectId.isValid(id)) {
      application = await Application.findById(id)
    } else {
      application = await Application.findOne({ id })
    }

    if (!application) {
      return false
    }

    await application.deleteOne()
    return true
  }
}

export default new ApplicationService()
