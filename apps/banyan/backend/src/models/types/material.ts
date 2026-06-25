/**
 * 物料（Material）类型定义
 *
 * Material = Template（引擎提供） + Meta（应用层元信息）
 *
 * 后端在 IMaterial 之上附加两个持久化维度：
 * - kind：物料种类，用于物料面板分类（render / client-flow / server-flow）
 * - applicationId：物料归属的应用 ID（可由此查到租户与用户）
 */

import type {
  ITemplate,
  ITemplateParameter,
  ITemplateAsset,
  IInternalIdRef,
  TemplateParameterType,
} from '@banyuan/banvasgl'

// ── 元数据（应用层定义，引擎不感知） ──

/** 物料来源标识 */
export type MaterialSource = 'builtin' | 'user' | 'team' | 'marketplace'

/** 物料元数据 */
export interface IMaterialMeta {
  id: string
  name: string
  description?: string
  tags?: string[]
  thumbnail?: string
  source: MaterialSource
  creatorId?: string
  createdAt?: string
  updatedAt?: string
  version: string
  minEngineVersion?: string
}

/** 完整物料定义（元数据 + 模板） */
export interface IMaterial {
  meta: IMaterialMeta
  template: ITemplate
}

// ── 引擎模板类型重导出（方便后端其他模块使用） ──

export type { ITemplate, ITemplateParameter, ITemplateAsset, IInternalIdRef, TemplateParameterType }

// ── 后端扩展 ──

/**
 * 物料种类（物料面板的三个分类维度）
 * - render：渲染物料（图形 / 文本 / 媒体 / 容器）
 * - client-flow：客户端流程节点物料
 * - server-flow：服务端流程节点物料
 */
export type MaterialKind = 'render' | 'client-flow' | 'server-flow'

/**
 * 物料文档接口 = IMaterial + 后端持久化维度
 */
export interface IMaterialDocument extends IMaterial {
  /** 物料种类 */
  kind: MaterialKind
  /** 归属应用 ID（builtin 物料为空字符串） */
  applicationId: string
}
