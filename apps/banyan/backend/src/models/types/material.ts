/**
 * 物料（Material）类型定义
 */

/** 物料来源 */
export type MaterialSource = 'builtin' | 'user' | 'team' | 'marketplace'

/** 物料状态 */
export type MaterialStatus = 'active' | 'deprecated' | 'draft'

/** 物料种类：render 渲染物料（图形/文本/媒体/容器）/ flow 流程节点物料 */
export type MaterialKind = 'render' | 'flow'

/** 物料参数类型 */
export type MaterialParameterType = 'string' | 'number' | 'boolean' | 'color' | 'url' | 'enum' | 'json'

/** 物料参数定义 */
export interface IMaterialParameter {
  id: string
  label: string
  description?: string
  type: MaterialParameterType
  defaultValue: unknown
  bindingPath: string
  options?: Array<{ label: string; value: unknown }>
  required?: boolean
}

/** 物料资源 */
export interface IMaterialAsset {
  id: string
  type: 'image' | 'video' | 'audio' | 'font' | 'other'
  url: string
  originalName?: string
  size?: number
}

/** FlowSchema 内部 ID 引用 */
export interface IInternalIdRef {
  path: string
  placeholder: string
}

/** 物料模板 */
export interface IMaterialTemplate {
  root: Record<string, unknown>
  idCount: number
  internalIdRefs: IInternalIdRef[]
  parameters: IMaterialParameter[]
  assets: IMaterialAsset[]
}

/** 物料文档数据接口 */
export interface IMaterial {
  /** 物料业务 ID */
  material_id: string
  /** 物料名称 */
  name: string
  /** 物料描述 */
  description: string
  /** 分类标签 */
  tags: string[]
  /** 物料种类（render 渲染物料 / flow 流程节点物料） */
  kind: MaterialKind
  /** 缩略图（内置物料为内联 svg 字符串，用户物料为 URL） */
  thumbnail: string
  /** 物料来源 */
  source: MaterialSource
  /** 物料状态 */
  status: MaterialStatus
  /** 物料版本号（语义化版本） */
  version: string
  /** 兼容的 BanvasGL 最低版本 */
  minEngineVersion: string
  /** 物料模板（序列化后的视图子树） */
  template: IMaterialTemplate
  /** 租户 ID */
  tenantId: string
  /** 创建者 */
  createdBy: string
  /** 最后修改者 */
  updatedBy: string
  /** 创建时间 */
  createdAt: Date
  /** 更新时间 */
  updatedAt: Date
}
