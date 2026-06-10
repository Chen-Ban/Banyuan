/**
 * 物料（Material）类型定义
 *
 * 三端（基础库 / 前端 / 后端）统一使用 @banyuan/banvasgl 定义的权威物料类型。
 * 基础库 IMaterial = { meta: IMaterialMeta, template: IMaterialTemplate }，
 * 由全量序列化数据包装而来，是最真实权威的来源。
 *
 * 后端在 IMaterial 之上附加两个持久化维度：
 * - kind：物料种类，用于物料面板分类（render / client-flow / server-flow）
 * - applicationId：物料归属的应用 ID（可由此查到租户与用户）
 */

import type { IMaterial } from '@banyuan/banvasgl'

export type {
  IMaterial,
  IMaterialMeta,
  IMaterialTemplate,
  IMaterialParameter,
  IMaterialAsset,
  IInternalIdRef,
  MaterialSource,
  MaterialParameterType,
} from '@banyuan/banvasgl'

/**
 * 物料种类（物料面板的三个分类维度）
 * - render：渲染物料（图形 / 文本 / 媒体 / 容器）
 * - client-flow：客户端流程节点物料
 * - server-flow：服务端流程节点物料
 */
export type MaterialKind = 'render' | 'client-flow' | 'server-flow'

/**
 * 物料文档接口 = 基础库 IMaterial + 后端持久化维度
 */
export interface IMaterialDocument extends IMaterial {
  /** 物料种类 */
  kind: MaterialKind
  /** 归属应用 ID（builtin 物料为空字符串） */
  applicationId: string
}
