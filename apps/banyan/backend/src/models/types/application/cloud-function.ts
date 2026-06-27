/**
 * CloudFunction 类型定义（ADR-042）
 *
 * 云函数定义的 append-only 版本化集合。
 * 一个版本文档打包该应用的所有云函数定义 functions[]。
 * 每次变更写入新版本，旧版本永不修改。
 */

import type { Types } from 'mongoose'

/** 单个云函数定义（嵌入 CloudFunction.functions[] 中） */
export interface ICloudFunctionDef {
  /** 云函数唯一标识（UUID） */
  functionId: string
  /** 云函数名称（英文标识符） */
  name: string
  /** 显示名称 */
  displayName: string
  /** 描述 */
  description: string
  /** FlowSchema JSON */
  flowSchema: Record<string, unknown>
}

/** CloudFunction 版本化文档数据接口 */
export interface ICloudFunction {
  /** 关联 Application */
  appId: string
  /** 自增版本号 */
  version: number
  /** 持有该版本的 Dialogue ID（反向引用 / 审计） */
  dialogueId: Types.ObjectId
  /** 该版本下所有云函数定义 */
  functions: ICloudFunctionDef[]
  /** 创建时间 */
  createdAt: Date
}
