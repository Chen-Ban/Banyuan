/**
 * 物料（Material）应用层类型定义
 *
 * Material = Template（引擎提供） + Meta（应用层元信息）
 *
 * 三端（前端 / 后端 / 基础库）共识：Material 是 Template 的业务包装层，
 * 引擎只提供 Template 机制，不感知 Material 元信息。
 */

import type { ITemplate } from '@banyuan/banvasgl'

/** 物料来源标识 */
export type MaterialSource = 'builtin' | 'user' | 'team' | 'marketplace'

/** 物料元数据 — 应用层定义，引擎不感知 */
export interface IMaterialMeta {
    /** 物料唯一 ID（UUID） */
    id: string
    /** 物料名称（展示用） */
    name: string
    /** 物料描述 */
    description?: string
    /** 分类标签（用于面板筛选） */
    tags?: string[]
    /** 缩略图 URL */
    thumbnail?: string
    /** 物料来源 */
    source: MaterialSource
    /** 创建者 ID */
    creatorId?: string
    /** 创建时间（ISO 字符串） */
    createdAt?: string
    /** 最后更新时间（ISO 字符串） */
    updatedAt?: string
    /** 物料版本号（语义化版本） */
    version: string
    /** 兼容的 BanvasGL 最低版本 */
    minEngineVersion?: string
}

/** 完整物料定义（元数据 + 模板） */
export interface IMaterial {
    /** 物料元数据 */
    meta: IMaterialMeta
    /** 物料模板（引擎提供） */
    template: ITemplate
}
