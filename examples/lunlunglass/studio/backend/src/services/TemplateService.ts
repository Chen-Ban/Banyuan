import { Types } from 'mongoose'
import { Template, TemplateSnapshot } from '../models/index.js'
import type { ITemplate, IPrintConfig, IPrintField } from '../models/index.js'
import { randomUUID } from 'crypto'

/**
 * 模板服务（Studio 专用）
 */
class TemplateService {
  /**
   * 获取模板列表（不返回 pages 字段，减少传输量）
   */
  async getTemplateList(
    query: { name?: string; publishStatus?: string } = {},
    page = 1,
    pageSize = 20
  ) {
    const filter: Record<string, unknown> = {}
    if (query.name) {
      filter.name = { $regex: query.name, $options: 'i' }
    }
    if (query.publishStatus) {
      filter.publishStatus = query.publishStatus
    }

    const skip = (page - 1) * pageSize
    const [total, templates] = await Promise.all([
      Template.countDocuments(filter),
      Template.find(filter)
        .select('-pages')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
    ])

    return { templates, total, page, pageSize }
  }

  /**
   * 根据 ID 获取模板（支持 MongoDB _id 和业务 id 双路查找）
   */
  async getTemplateById(id: string): Promise<ITemplate | null> {
    if (Types.ObjectId.isValid(id)) {
      const t = await Template.findById(id).lean()
      if (t) return t as unknown as ITemplate
    }
    return Template.findOne({ id }).lean() as Promise<ITemplate | null>
  }

  /**
   * 创建模板
   */
  async createTemplate(data: {
    id: string
    name: string
    description?: string
    pages: string[]
    tags?: string[]
    createdBy?: string
  }): Promise<ITemplate> {
    const template = new Template({
      ...data,
      version: 1,
      publishStatus: 'draft',
    })
    await template.save()
    return template.toObject() as unknown as ITemplate
  }

  /**
   * 更新模板（version 自增）
   */
  async updateTemplate(
    id: string,
    data: Partial<Omit<ITemplate, 'id' | 'version' | 'createdAt' | 'updatedAt'>>
  ): Promise<ITemplate | null> {
    const template = Types.ObjectId.isValid(id)
      ? await Template.findById(id)
      : await Template.findOne({ id })

    if (!template) return null

    Object.assign(template, data)
    template.version += 1
    await template.save()
    return template.toObject() as unknown as ITemplate
  }

  /**
   * 删除模板
   */
  async deleteTemplate(id: string): Promise<boolean> {
    const template = Types.ObjectId.isValid(id)
      ? await Template.findById(id)
      : await Template.findOne({ id })

    if (!template) return false
    await template.deleteOne()
    return true
  }

  /**
   * 发布模板：生成快照，更新模板状态
   *
   * 快照内容：
   * - 静态背景图（由前端传入 exportImage() 导出的 Base64）
   * - 动态字段列表（绑定了 fieldKey 的 TextView 的 bounds + 样式）
   */
  async publishTemplate(
    templateId: string,
    publishData: {
      backgroundImage: string
      backgroundSize: { width: number; height: number }
      fields: IPrintField[]
      thumbnail?: string
    }
  ): Promise<{ snapshotId: string }> {
    const template = Types.ObjectId.isValid(templateId)
      ? await Template.findById(templateId)
      : await Template.findOne({ id: templateId })

    if (!template) {
      throw new Error(`Template not found: ${templateId}`)
    }

    const printConfig = template.printConfig as IPrintConfig | null
    const paperWidth = printConfig?.paperWidth ?? 58
    const dpi = printConfig?.dpi ?? 203

    // 生成快照 ID
    const snapshotId = randomUUID()

    // 创建快照记录
    const snapshot = new TemplateSnapshot({
      snapshotId,
      templateId: template.id,
      templateName: template.name,
      thumbnail: publishData.thumbnail ?? template.thumbnail,
      version: template.version,
      paperWidth,
      dpi,
      backgroundImage: publishData.backgroundImage,
      backgroundSize: publishData.backgroundSize,
      fields: publishData.fields,
      publishedAt: new Date(),
    })
    await snapshot.save()

    // 更新模板状态
    template.publishStatus = 'published'
    template.latestSnapshotId = snapshotId
    await template.save()

    return { snapshotId }
  }

  /**
   * 获取已发布模板列表（供 POS 拉取）
   * 返回最新快照信息，不含背景图（减少传输量）
   */
  async getPublishedTemplates() {
    const snapshots = await TemplateSnapshot.find()
      .select('-backgroundImage')
      .sort({ publishedAt: -1 })
      .lean()

    return snapshots
  }

  /**
   * 获取单个快照详情（含背景图，供 POS 下载）
   */
  async getSnapshotById(snapshotId: string) {
    return TemplateSnapshot.findOne({ snapshotId }).lean()
  }
}

export default new TemplateService()
