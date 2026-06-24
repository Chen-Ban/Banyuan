import crypto from 'node:crypto'
import { Material } from '../models/index.js'
import type {
  IMaterialDocument,
  MaterialSource,
  MaterialKind,
  ITemplate,
} from '../models/types/index.js'

// ─── Query 接口 ──────────────────────────────────────────────────────────────

export interface IMaterialQuery {
  /** 关键词搜索（名称/描述/标签） */
  keyword?: string
  /** 按标签筛选 */
  tags?: string[]
  /** 按种类筛选（render / client-flow / server-flow） */
  kind?: MaterialKind
  /** 按来源筛选 */
  source?: MaterialSource
  /** 归属应用 ID */
  applicationId?: string
}

export interface IMaterialListResult {
  materials: Partial<IMaterialDocument>[]
  total: number
  page: number
  pageSize: number
}

export interface ICreateMaterialData {
  name: string
  description?: string
  tags?: string[]
  kind?: MaterialKind
  thumbnail?: string
  source?: MaterialSource
  version?: string
  minEngineVersion?: string
  template: ITemplate
  applicationId?: string
  creatorId?: string
}

export interface IUpdateMaterialData {
  name?: string
  description?: string
  tags?: string[]
  thumbnail?: string
  version?: string
  template?: ITemplate
}

// ─── Service ──────────────────────────────────────────────────────────────────

class MaterialService {
  /**
   * 查询物料列表（不返回完整 template.root，减少传输量）
   */
  async getMaterialList(
    query: IMaterialQuery = {},
    page: number = 1,
    pageSize: number = 20,
  ): Promise<IMaterialListResult> {
    const filter: Record<string, unknown> = {}

    if (query.keyword) {
      filter.$text = { $search: query.keyword }
    }
    if (query.tags && query.tags.length > 0) {
      filter['meta.tags'] = { $in: query.tags }
    }
    if (query.kind) {
      filter.kind = query.kind
    }
    if (query.source) {
      filter['meta.source'] = query.source
    }
    // builtin 物料对所有用户可见，不受 application 限制
    if (query.source === 'builtin') {
      // 不加 application 过滤
    } else if (query.applicationId) {
      // 非 builtin 查询：限定为当前应用 或 builtin
      filter.$or = [
        { applicationId: query.applicationId },
        { 'meta.source': 'builtin' },
      ]
    }

    const skip = (page - 1) * pageSize

    const [materials, total] = await Promise.all([
      Material.find(filter)
        .select('-template.root -__v')
        .sort({ 'meta.createdAt': -1 })
        .skip(skip)
        .limit(pageSize)
        .lean<Partial<IMaterialDocument>[]>()
        .exec(),
      Material.countDocuments(filter),
    ])

    return { materials, total, page, pageSize }
  }

  /**
   * 根据物料 ID 获取物料详情（含完整模板）
   */
  async getMaterialById(materialId: string): Promise<IMaterialDocument | null> {
    return Material.findOne({ 'meta.id': materialId }).lean<IMaterialDocument | null>().exec()
  }

  /**
   * 创建物料
   */
  async createMaterial(data: ICreateMaterialData): Promise<IMaterialDocument> {
    const materialId = `mat_${crypto.randomUUID()}`
    const now = new Date().toISOString()

    const material = new Material({
      meta: {
        id: materialId,
        name: data.name,
        description: data.description ?? '',
        tags: data.tags ?? [],
        thumbnail: data.thumbnail ?? '',
        source: data.source ?? 'user',
        creatorId: data.creatorId ?? '',
        createdAt: now,
        updatedAt: now,
        version: data.version ?? '1.0.0',
        minEngineVersion: data.minEngineVersion ?? '',
      },
      template: data.template,
      kind: data.kind ?? 'render',
      applicationId: data.applicationId ?? '',
    })

    await material.save()
    return material.toObject<IMaterialDocument>()
  }

  /**
   * 更新物料
   */
  async updateMaterial(materialId: string, data: IUpdateMaterialData): Promise<IMaterialDocument | null> {
    const set: Record<string, unknown> = {
      'meta.updatedAt': new Date().toISOString(),
    }
    if (data.name !== undefined) set['meta.name'] = data.name
    if (data.description !== undefined) set['meta.description'] = data.description
    if (data.tags !== undefined) set['meta.tags'] = data.tags
    if (data.thumbnail !== undefined) set['meta.thumbnail'] = data.thumbnail
    if (data.version !== undefined) set['meta.version'] = data.version
    if (data.template !== undefined) set.template = data.template

    return Material.findOneAndUpdate(
      { 'meta.id': materialId },
      { $set: set },
      { new: true },
    ).lean<IMaterialDocument | null>().exec()
  }

  /**
   * 硬删除物料
   */
  async deleteMaterial(materialId: string): Promise<boolean> {
    const result = await Material.deleteOne({ 'meta.id': materialId })
    return result.deletedCount > 0
  }

  /**
   * 搜索物料（用于 AI 工具调用）
   */
  async searchMaterials(keyword: string, limit: number = 10): Promise<Partial<IMaterialDocument>[]> {
    return Material.find(
      { $text: { $search: keyword } },
      { score: { $meta: 'textScore' } },
    )
      .select('meta kind template.parameters template.assets')
      .sort({ score: { $meta: 'textScore' } })
      .limit(limit)
      .lean<Partial<IMaterialDocument>[]>()
      .exec()
  }
}

export default new MaterialService()
