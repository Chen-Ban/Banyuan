/**
 * 会话（Conversation）类型定义
 *
 * 轻量索引容器：一个 Application 对应一个 Conversation（1:1），
 * 维护 appId → Dialogue[] 的引用关系。
 */

import type { Types } from 'mongoose'

export interface IConversation {
  /** 关联的应用 ID（唯一索引，1 App = 1 Conversation） */
  appId: string
  /** 按时间顺序的 Dialogue 引用列表（指向独立 Dialogue 集合） */
  dialogueIds: Types.ObjectId[]
  /** 创建时间 */
  createdAt: Date
  /** 最后更新时间 */
  updatedAt: Date
}
