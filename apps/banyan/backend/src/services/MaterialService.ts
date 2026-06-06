import crypto from 'node:crypto'
import { Material } from '../models/index.js'
import type { IMaterial, MaterialSource, MaterialStatus, MaterialKind, IMaterialTemplate } from '../models/types/index.js'

// ─── Query 接口 ──────────────────────────────────────────────────────────────

export interface IMaterialQuery {
  /** 关键词搜索（名称/描述/标签） */
  keyword?: string
  /** 按标签筛选 */
  tags?: string[]
  /** 按种类筛选（render 渲染物料 / flow 流程节点物料） */
  kind?: MaterialKind
  /** 按来源筛选 */
  source?: MaterialSource
  /** 按状态筛选 */
  status?: MaterialStatus
  /** 创建者 */
  createdBy?: string
  /** 租户 ID */
  tenantId?: string
}

export interface IMaterialListResult {
  materials: Partial<IMaterial>[]
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
  template: IMaterialTemplate
  tenantId?: string
  createdBy?: string
}

export interface IUpdateMaterialData {
  name?: string
  description?: string
  tags?: string[]
  thumbnail?: string
  status?: MaterialStatus
  version?: string
  template?: IMaterialTemplate
  updatedBy?: string
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
    const filter: any = {}

    if (query.keyword) {
      filter.$text = { $search: query.keyword }
    }
    if (query.tags && query.tags.length > 0) {
      filter.tags = { $in: query.tags }
    }
    if (query.kind) {
      filter.kind = query.kind
    }
    if (query.source) {
      filter.source = query.source
    }
    if (query.status) {
      filter.status = query.status
    } else {
      // 默认不显示已废弃的物料
      filter.status = { $ne: 'deprecated' }
    }
    // builtin 物料对所有用户可见，不受 tenant/owner 限制
    if (query.source === 'builtin') {
      // 不加 tenant/owner 过滤
    } else if (query.tenantId && query.createdBy) {
      // 非 builtin 查询：限定为当前租户 + 当前用户 或 builtin
      filter.$or = [
        { tenantId: query.tenantId, createdBy: query.createdBy },
        { source: 'builtin' },
      ]
    } else if (query.tenantId) {
      filter.$or = [
        { tenantId: query.tenantId },
        { source: 'builtin' },
      ]
    } else if (query.createdBy) {
      filter.$or = [
        { createdBy: query.createdBy },
        { source: 'builtin' },
      ]
    }

    const skip = (page - 1) * pageSize

    const [materials, total] = await Promise.all([
      Material.find(filter)
        .select('-template.root -__v')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean() as unknown as Promise<Partial<IMaterial>[]>,
      Material.countDocuments(filter),
    ])

    return { materials, total, page, pageSize }
  }

  /**
   * 根据业务 ID 获取物料详情（含完整模板）
   */
  async getMaterialById(materialId: string): Promise<IMaterial | null> {
    return Material.findOne({ material_id: materialId }).lean() as unknown as IMaterial | null
  }

  /**
   * 创建物料
   */
  async createMaterial(data: ICreateMaterialData): Promise<IMaterial> {
    const materialId = `mat_${crypto.randomUUID()}`

    const material = new Material({
      material_id: materialId,
      name: data.name,
      description: data.description ?? '',
      tags: data.tags ?? [],
      kind: data.kind ?? 'render',
      thumbnail: data.thumbnail ?? '',
      source: data.source ?? 'user',
      status: 'active',
      version: data.version ?? '1.0.0',
      minEngineVersion: data.minEngineVersion ?? '',
      template: data.template,
      tenantId: data.tenantId ?? '',
      createdBy: data.createdBy ?? '',
      updatedBy: data.createdBy ?? '',
    })

    await material.save()
    return material.toObject()
  }

  /**
   * 更新物料
   */
  async updateMaterial(materialId: string, data: IUpdateMaterialData): Promise<IMaterial | null> {
    const updateData: any = { ...data }
    if (data.updatedBy) {
      updateData.updatedBy = data.updatedBy
    }

    return Material.findOneAndUpdate(
      { material_id: materialId },
      { $set: updateData },
      { new: true, lean: true },
    ) as unknown as IMaterial | null
  }

  /**
   * 废弃物料（软删除）
   */
  async deprecateMaterial(materialId: string, updatedBy: string): Promise<IMaterial | null> {
    return Material.findOneAndUpdate(
      { material_id: materialId },
      { $set: { status: 'deprecated', updatedBy } },
      { new: true, lean: true },
    ) as unknown as IMaterial | null
  }

  /**
   * 硬删除物料（仅限草稿状态）
   */
  async deleteMaterial(materialId: string): Promise<boolean> {
    const result = await Material.deleteOne({
      material_id: materialId,
      status: 'draft',
    })
    return result.deletedCount > 0
  }

  /**
   * 搜索物料（用于 AI 工具调用）
   */
  async searchMaterials(keyword: string, limit: number = 10): Promise<Partial<IMaterial>[]> {
    return Material.find(
      { $text: { $search: keyword }, status: 'active' },
      { score: { $meta: 'textScore' } },
    )
      .select('material_id name description tags kind thumbnail template.parameters template.assets')
      .sort({ score: { $meta: 'textScore' } })
      .limit(limit)
      .lean() as unknown as Partial<IMaterial>[]
  }
}

export default new MaterialService()
