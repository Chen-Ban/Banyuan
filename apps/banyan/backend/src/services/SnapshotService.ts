/**
 * 快照服务（SnapshotService）
 *
 * 负责：
 *   - 在 task 类型对话完成时，生成应用状态快照
 *   - 查询快照历史（用于撤销/恢复 UI）
 *   - 恢复快照（将应用状态回退到指定对话时的状态）
 *
 * 快照内容：
 *   - appJSON: App 级别序列化字符串
 *   - cloudFunctions: 云函数列表快照
 *   - collections: 数据库表定义快照
 */

import { Types } from 'mongoose'
import Snapshot, { type ISnapshot } from '../models/Snapshot.js'
import applicationService from './ApplicationService.js'
import cloudFunctionService from './CloudFunctionService.js'
import { SchemaService } from './SchemaService.js'

class SnapshotService {
  /**
   * 为指定对话创建快照（在 task 对话 completed 时调用）
   *
   * 读取当前 Application.appJSON + CloudFunction[] + CollectionSchema.collections，
   * 打成一份快照存入独立集合。
   *
   * @param appId      应用 ID
   * @param dialogueId 对话 ID
   */
  async createSnapshot(appId: string, dialogueId: Types.ObjectId): Promise<ISnapshot> {
    // 并行读取三个数据源
    const [app, cloudFunctions, schemaDoc] = await Promise.all([
      applicationService.getApplicationById(appId),
      cloudFunctionService.listByApp(appId),
      SchemaService.getSchema(appId),
    ])

    const snapshot = new Snapshot({
      appId,
      dialogueId,
      appJSON: app?.appJSON ?? '',
      cloudFunctions: (cloudFunctions ?? []).map((cf) => ({
        functionId: cf.functionId,
        name: cf.name,
        displayName: cf.displayName ?? '',
        flowSchema: cf.flowSchema ?? { nodes: [], edges: [] },
      })),
      collections: (schemaDoc?.collections ?? []).map((col) => ({
        name: col.name,
        displayName: col.displayName,
        fields: (col.fields ?? []).map((f) => ({
          name: f.name,
          displayName: f.displayName,
          type: f.type,
          required: f.required ?? false,
          defaultValue: f.defaultValue,
          refCollection: f.refCollection,
          enumValues: f.enumValues,
        })),
      })),
    })

    await snapshot.save()
    return snapshot
  }

  /**
   * 获取指定对话的快照
   */
  async getByDialogue(dialogueId: Types.ObjectId): Promise<ISnapshot | null> {
    return Snapshot.findOne({ dialogueId })
  }

  /**
   * 获取应用的快照历史（按时间倒序）
   */
  async getHistory(appId: string, limit = 50): Promise<ISnapshot[]> {
    return Snapshot.find({ appId })
      .sort({ createdAt: -1 })
      .limit(limit)
  }

  /**
   * 恢复快照（将应用状态回退到指定快照）
   *
   * 将 snapshot 中的 appJSON/cloudFunctions/collections 写回对应的模型。
   *
   * @param snapshotId 要恢复的快照 ID
   */
  async restoreSnapshot(snapshotId: Types.ObjectId): Promise<void> {
    const snapshot = await Snapshot.findById(snapshotId)
    if (!snapshot) {
      throw new Error(`Snapshot ${snapshotId} not found`)
    }

    const { appId, appJSON, cloudFunctions, collections } = snapshot

    // 并行恢复三个数据源
    await Promise.all([
      // 恢复 appJSON
      applicationService.updateApplication(appId, { appJSON }),

      // 恢复云函数（覆盖式同步）
      cloudFunctionService.bulkSync(appId, cloudFunctions.map((cf) => ({
        functionId: cf.functionId,
        name: cf.name,
        displayName: cf.displayName,
        flowSchema: cf.flowSchema as Record<string, unknown> | undefined,
      }))),

      // 恢复数据库表定义
      SchemaService.setCollections(appId, collections as unknown as import('../models/CollectionSchema.js').ICollectionDef[]),
    ])
  }

  /**
   * 删除指定应用的所有快照（随应用删除时调用）
   */
  async deleteByApp(appId: string): Promise<void> {
    await Snapshot.deleteMany({ appId })
  }
}

export default new SnapshotService()
