/**
 * 快照服务（SnapshotService）— V2（过程暂存 + 确认同步 + 历史回滚）
 *
 * 核心职责：
 *   - 对话开始执行时创建 pending 快照（暂存区）
 *   - AI 执行期间增量更新快照中的 appJSON/collections/cloudFunctions
 *   - AI 执行完毕后标记为 done（等待用户确认）
 *   - 用户确认：将快照数据同步到持久化表 → confirmed
 *   - 用户撤销：标记为 discarded，持久化表不受影响
 *   - 历史回滚：取某个 confirmed 快照，重新同步到持久化表
 *
 * 设计原则：
 *   - Snapshot 是"对话即事务"的 staging 区，替代 PendingStore 的文件暂存
 *   - 所有数据在 MongoDB 中，天然支持多实例和进程恢复
 *   - 一个 appId 同一时间最多一个 pending/done 状态的快照（由业务层保证）
 */

import { Types } from 'mongoose'
import Snapshot, { type ISnapshot, type ICloudFunctionSnapshot, type ICollectionSnapshot } from '../models/Snapshot.js'
import applicationService from './ApplicationService.js'
import cloudFunctionService from './CloudFunctionService.js'
import { SchemaService } from './SchemaService.js'
import type { ICollectionDef } from '../models/CollectionSchema.js'

class SnapshotService {
  // ─── 创建（AI 开始执行时调用）────────────────────────────────────────────────

  /**
   * 创建 pending 快照
   *
   * 在 task 对话的 AI 开始执行时调用。此时快照内容为空，
   * 后续通过 updateAppJSON / updateCollections / updateCloudFunctions 增量写入。
   *
   * @param appId      应用 ID
   * @param dialogueId 对话 ID（预生成的 ObjectId）
   * @param baseAppJSON 当前应用的 appJSON（作为基线，AI 在此基础上修改）
   */
  async createPending(appId: string, dialogueId: Types.ObjectId, baseAppJSON?: string): Promise<ISnapshot> {
    // 如果已有同 appId 的 pending/done 快照（异常情况：上一次未正常结束），标记为 discarded
    await Snapshot.updateMany(
      { appId, status: { $in: ['pending', 'done'] } },
      { $set: { status: 'discarded' } }
    )

    // 读取当前持久化状态作为基线
    const [app, cloudFunctions, schemaDoc] = await Promise.all([
      baseAppJSON ? Promise.resolve(null) : applicationService.getApplicationById(appId),
      cloudFunctionService.listByApp(appId),
      SchemaService.getSchema(appId),
    ])

    const snapshot = new Snapshot({
      appId,
      dialogueId,
      status: 'pending',
      appJSON: baseAppJSON ?? app?.appJSON ?? '',
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

  // ─── 增量更新（AI 执行期间调用）─────────────────────────────────────────────

  /**
   * 更新快照中的 appJSON（AI 每次修改页面后调用）
   */
  async updateAppJSON(appId: string, appJSON: string): Promise<void> {
    await Snapshot.updateOne(
      { appId, status: { $in: ['pending', 'done'] } },
      { $set: { appJSON } }
    )
  }

  /**
   * 更新快照中的数据库表定义
   */
  async updateCollections(appId: string, collections: ICollectionSnapshot[]): Promise<void> {
    await Snapshot.updateOne(
      { appId, status: { $in: ['pending', 'done'] } },
      { $set: { collections } }
    )
  }

  /**
   * 更新快照中的云函数列表
   */
  async updateCloudFunctions(appId: string, cloudFunctions: ICloudFunctionSnapshot[]): Promise<void> {
    await Snapshot.updateOne(
      { appId, status: { $in: ['pending', 'done'] } },
      { $set: { cloudFunctions } }
    )
  }

  // ─── 状态流转 ───────────────────────────────────────────────────────────────

  /**
   * AI 执行完毕，标记为 done（等待用户确认）
   */
  async markDone(appId: string): Promise<void> {
    await Snapshot.updateOne(
      { appId, status: 'pending' },
      { $set: { status: 'done' } }
    )
  }

  /**
   * AI 执行失败/中断，标记为 done（用户仍可确认已有的改动，或撤销）
   *
   * 中断场景下 Snapshot 中已有的数据是 AI 执行到中断点为止的状态，
   * 用户可以选择确认（保留已有改动）或撤销（回到执行前状态）。
   */
  async markDoneOnInterrupt(appId: string): Promise<void> {
    await Snapshot.updateOne(
      { appId, status: 'pending' },
      { $set: { status: 'done' } }
    )
  }

  /**
   * 用户确认：将快照数据同步到持久化表，状态 → confirmed
   *
   * 这是"对话即事务"的 commit 操作。
   *
   * @returns 被确认的快照（含完整数据，供调用方使用）
   */
  async confirm(appId: string): Promise<ISnapshot> {
    const snapshot = await Snapshot.findOne({ appId, status: 'done' })
    if (!snapshot) {
      throw new Error(`[SnapshotService] 没有可确认的快照: appId=${appId}`)
    }

    // 同步到持久化表
    await this.syncToPersistence(snapshot)

    // 标记为已确认
    snapshot.status = 'confirmed'
    await snapshot.save()

    return snapshot
  }

  /**
   * 用户撤销：标记为 discarded，不同步到持久化表
   *
   * 这是"对话即事务"的 rollback 操作。
   */
  async discard(appId: string): Promise<void> {
    await Snapshot.updateOne(
      { appId, status: 'done' },
      { $set: { status: 'discarded' } }
    )
  }

  // ─── 历史回滚 ───────────────────────────────────────────────────────────────

  /**
   * 恢复到指定快照（将历史 confirmed 快照的数据写回持久化表）
   *
   * 本质上是对历史快照执行一次同步操作，等价于 confirm。
   *
   * @param snapshotId 要恢复的快照 ID
   */
  async restoreSnapshot(snapshotId: Types.ObjectId): Promise<void> {
    const snapshot = await Snapshot.findById(snapshotId)
    if (!snapshot) {
      throw new Error(`[SnapshotService] Snapshot ${snapshotId} not found`)
    }
    if (snapshot.status !== 'confirmed') {
      throw new Error(`[SnapshotService] 只能恢复 confirmed 状态的快照，当前状态: ${snapshot.status}`)
    }

    await this.syncToPersistence(snapshot)
  }

  // ─── 查询 ───────────────────────────────────────────────────────────────────

  /**
   * 获取当前 pending/done 状态的快照（供前端展示暂存状态）
   */
  async getActivePending(appId: string): Promise<ISnapshot | null> {
    return Snapshot.findOne({ appId, status: { $in: ['pending', 'done'] } })
  }

  /**
   * 获取指定对话的快照
   */
  async getByDialogue(dialogueId: Types.ObjectId): Promise<ISnapshot | null> {
    return Snapshot.findOne({ dialogueId })
  }

  /**
   * 获取应用的已确认快照历史（按时间倒序，用于回滚 UI）
   */
  async getConfirmedHistory(appId: string, limit = 50): Promise<ISnapshot[]> {
    return Snapshot.find({ appId, status: 'confirmed' })
      .sort({ createdAt: -1 })
      .limit(limit)
  }

  /**
   * 删除指定应用的所有快照（随应用删除时调用）
   */
  async deleteByApp(appId: string): Promise<void> {
    await Snapshot.deleteMany({ appId })
  }

  // ─── 内部方法 ───────────────────────────────────────────────────────────────

  /**
   * 将快照数据同步写入持久化表（Application + CloudFunction + CollectionSchema）
   */
  private async syncToPersistence(snapshot: ISnapshot): Promise<void> {
    const { appId, appJSON, cloudFunctions, collections } = snapshot

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
      SchemaService.setCollections(appId, collections as unknown as ICollectionDef[]),
    ])
  }
}

export default new SnapshotService()
