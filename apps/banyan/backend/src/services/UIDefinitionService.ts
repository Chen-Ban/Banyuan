/**
 * UIDefinitionService（ADR-042 + 版本号引用模型）
 *
 * 管理 UIDefinition append-only 版本化集合。
 * 每个版本由一个 Dialogue 持有（dialogueId），生命周期：
 *   1. 对话创建时 createDraftVersion：拷贝最新已接受版本，append 一个新版本（绑定 dialogueId）
 *   2. 构建期间 updateByVersion：按版本号原地修改该 draft 记录
 *   3. 用户接受（Dialogue → done）后，该版本即"已接受"，读取聚合走最新 done Dialogue 的版本号
 *
 * 不需要向后兼容。
 */

import type { Types } from 'mongoose'
import { UIDefinition } from '../models/index.js'
import type { IUIDefinition } from '../models/types/versioned-content.js'

class UIDefinitionService {
  // ─── 读取 ──────────────────────────────────────────────────────────────────

  /**
   * 获取指定版本的 UIDefinition
   */
  async getByVersion(appId: string, version: number): Promise<IUIDefinition | null> {
    const doc = await UIDefinition.findOne({ appId, version }).lean()
    return doc as IUIDefinition | null
  }

  /**
   * 获取应用当前的最大版本号（含未接受的 draft），用于计算下一个版本号。
   */
  async getMaxVersion(appId: string): Promise<number> {
    const latest = await UIDefinition.findOne({ appId }).sort({ version: -1 }).lean()
    return latest ? latest.version : 0
  }

  // ─── 写入 ────────────────────────────────────────────────────────────────────

  /**
   * 创建草稿版本（对话发起时调用）
   *
   * 拷贝指定的基线版本内容，append 一个新版本并绑定 dialogueId。
   * 若 baseVersion 不存在（首个对话），以空内容起步。
   *
   * @param appId       应用 ID
   * @param dialogueId  持有该版本的对话 ID
   * @param baseVersion 拷贝基线版本号（最新已接受版本，0 表示无基线）
   * @returns 新版本号
   */
  async createDraftVersion(
    appId: string,
    dialogueId: Types.ObjectId,
    baseVersion: number,
  ): Promise<number> {
    const base = baseVersion > 0 ? await this.getByVersion(appId, baseVersion) : null
    const newVersion = (await this.getMaxVersion(appId)) + 1

    await UIDefinition.create({
      appId,
      version: newVersion,
      dialogueId,
      uiJSON: base?.uiJSON ?? '',
    })

    return newVersion
  }

  /**
   * 按版本号原地更新 UI 定义 JSON（构建期间 agent / 用户修改）
   */
  async updateByVersion(appId: string, version: number, uiJSON: string): Promise<void> {
    await UIDefinition.updateOne({ appId, version }, { $set: { uiJSON } })
  }
}

export default new UIDefinitionService()
