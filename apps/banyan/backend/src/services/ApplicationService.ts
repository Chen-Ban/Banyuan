import crypto from 'node:crypto'
import { Application } from '../models/index.js'
import type { IApplication } from '../models/types/index.js'
import type { ICollectionDef } from '../models/types/index.js'
import type { ICloudFunctionDef } from '../models/types/versioned-content.js'
import uiDefinitionService from './UIDefinitionService.js'
import cloudFunctionService from './CloudFunctionService.js'
import { SchemaService } from './SchemaService.js'
import dialogueService from './DialogueService.js'

export interface IApplicationQuery {
  name?: string
  application_id?: string
  tags?: string
  createdBy?: string
  tenantId?: string
}

export interface IApplicationListResult {
  applications: Partial<IApplication>[]
  total: number
  page: number
  pageSize: number
}

export interface IUpdateApplicationData {
  name?: string
  thumbnail?: string
  tags?: string[]
  updatedBy?: string
}

/**
 * 聚合应用详情（ADR-042）
 *
 * 前端 getApplicationById 返回的聚合数据：
 * 包含 application 元数据 + UI 定义 JSON + schema + cloudFunctions。
 */
export interface IApplicationFull {
  application: IApplication
  uiJSON: string
  collections: ICollectionDef[]
  cloudFunctions: ICloudFunctionDef[]
}

class ApplicationService {
  /**
   * 查询应用列表（不返回 UI 定义 JSON 字段，减少传输量）
   */
  async getApplicationList(
    query: IApplicationQuery = {},
    page: number = 1,
    pageSize: number = 12,
  ): Promise<IApplicationListResult> {
    const filter: any = {}

    if (query.name) {
      filter.name = { $regex: query.name, $options: 'i' }
    }
    if (query.application_id) {
      filter.application_id = { $regex: query.application_id, $options: 'i' }
    }
    if (query.tags) {
      filter.tags = { $in: [query.tags] }
    }
    if (query.tenantId && query.createdBy) {
      // 成员视角：同一租户下仅看自己的应用
      filter.tenantId = query.tenantId
      filter.createdBy = query.createdBy
    } else if (query.tenantId) {
      // 管理员视角：看租户内所有应用
      filter.tenantId = query.tenantId
    } else if (query.createdBy) {
      // 兼容旧逻辑：无租户时按 createdBy 过滤
      filter.createdBy = query.createdBy
    }

    const skip = (page - 1) * pageSize

    const [total, applications] = await Promise.all([
      Application.countDocuments(filter),
      Application.find(filter).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(),
    ])

    return {
      applications: applications as unknown as Partial<IApplication>[],
      total,
      page,
      pageSize,
    }
  }

  /**
   * 根据ID获取应用详情
   *
   * @deprecated 请使用 getFullApplicationById 获取聚合数据
   */
  async getApplicationById(applicationId: string): Promise<IApplication | null> {
    const application = await Application.findOne({
      application_id: applicationId,
    }).lean()
    return application as unknown as IApplication | null
  }

  /**
   * 获取应用聚合详情（版本号引用模型，ADR-042 + ADR-041）
   *
   * 聚合返回 application 元数据 + UI 定义 JSON + collections + cloudFunctions。
   *
   * 读取策略：以「最新已验收（done）Dialogue」持有的三个版本号为准，精确从三张
   * 内容表取对应版本的记录，从而天然过滤掉未验收（discarded/进行中）的草稿内容。
   * 若该应用尚无任何 done Dialogue，则返回空内容（UI 定义 JSON 为空、collections/cloudFunctions 为空数组）。
   */
  async getFullApplicationById(applicationId: string): Promise<IApplicationFull | null> {
    const application = await Application.findOne({
      application_id: applicationId,
    }).lean()

    if (!application) return null

    // 最新已验收 Dialogue 持有的三个版本号（唯一权威来源）
    const versions = await dialogueService.getLatestAcceptedVersions(applicationId)

    // 无任何已验收版本 → 返回空内容
    if (
      versions.uiDefinitionVersion <= 0 &&
      versions.schemaVersion <= 0 &&
      versions.cloudFunctionVersion <= 0
    ) {
      return {
        application: application as unknown as IApplication,
        uiJSON: '',
        collections: [],
        cloudFunctions: [],
      }
    }

    // 按版本号精确读取三张内容表
    const [content, schema, group] = await Promise.all([
      uiDefinitionService.getByVersion(applicationId, versions.uiDefinitionVersion),
      SchemaService.getByVersion(applicationId, versions.schemaVersion),
      cloudFunctionService.getByVersion(applicationId, versions.cloudFunctionVersion),
    ])

    return {
      application: application as unknown as IApplication,
      uiJSON: content?.uiJSON ?? '',
      collections: schema?.collections ?? [],
      cloudFunctions: group?.functions ?? [],
    }
  }

  /**
   * 创建空白应用
   *
   * 服务端自动生成 application_id，默认 name 为「未命名应用」，默认 UI 定义 JSON 为空字符串。
   */
  async createApplication(userId: string, tenantId: string): Promise<IApplication> {
    const application_id = `app_${crypto.randomUUID()}`
    const application = new Application({
      application_id,
      name: '未命名应用',
      tags: [],
      version: 1,
      tenantId,
      createdBy: userId,
      updatedBy: '',
    })
    await application.save()
    return application.toObject() as unknown as IApplication
  }

  /**
   * 更新应用（version 自增）
   */
  async updateApplication(
    applicationId: string,
    updateData: IUpdateApplicationData,
  ): Promise<IApplication | null> {
    const application = await Application.findOne({
      application_id: applicationId,
    })

    if (!application) {
      return null
    }

    if (updateData.name !== undefined) application.name = updateData.name
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
  async deleteApplication(applicationId: string): Promise<boolean> {
    const application = await Application.findOne({
      application_id: applicationId,
    })

    if (!application) {
      return false
    }

    await application.deleteOne()
    return true
  }
}

export default new ApplicationService()
