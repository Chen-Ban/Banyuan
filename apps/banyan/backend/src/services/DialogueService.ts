/**
 * DialogueService — ADR-041 Dialogue 集合的唯一 CRUD + Phase 转移
 *
 * 职责：
 *   1. 创建 Dialogue（AI 对话发起时，phase=start）
 *   2. Phase 转移（校验 PHASE_TRANSITIONS 合法性后 atomic $set）
 *   3. 快照写入（appJSON / collections / cloudFunctions）
 *   4. 消息追加（user / assistant）
 *   5. 规划产物写入（各 SubAgent 阶段产出）
 *   6. Agent 记忆暂存（confirm 时落库）
 *   7. 摘要写入（done 时）
 *   8. 中断归因（discarded 终态 + interruptMetadata）
 *   9. 查询接口（getActiveByApp / getById / getConfirmable）
 *
 * 本 Service 是 Dialogue 的唯一数据路径，承担完整读写责任。
 */

import { Types } from 'mongoose'
import Dialogue, { type IDialogueDoc } from '../models/Dialogue.js'
import {
  PHASE_TRANSITIONS,
  type DialoguePhase,
  type DialogueType,
  type DiscardReason,
  type IDialogueSummary,
  type IPlanningEntry,
  type IAssistantContent,
  type ICollectionDef,
  type ICloudFunction,
  type IMemoryUpdateInput,
} from '../models/types/index.js'

// ─── 终态集合（不可转移的 phase）──────────────────────────────────────────────

const TERMINAL_PHASES: Set<DialoguePhase> = new Set(['done', 'discarded', 'failed'])

// ─── DialogueService 实现 ─────────────────────────────────────────────────────

class DialogueService {
  // ─── 创建 ────────────────────────────────────────────────────────────────────

  /**
   * 创建 Dialogue，初始 phase=start
   *
   * 如果该 appId 下已有活跃（非终态）的 Dialogue，会先将其标记为 discarded（异常恢复）。
   */
  async create(params: {
    appId: string
    conversationId: Types.ObjectId
    type: DialogueType
    userMessage: { prompt: string; images: Array<{ url: string; alt?: string }> }
    /** 初始 appJSON（当前应用状态快照，作为本轮对话的起始状态） */
    appJSON?: string
  }): Promise<IDialogueDoc> {
    // 清理可能存在的孤儿 Dialogue（上一次未正常结束）
    await Dialogue.updateMany(
      {
        appId: params.appId,
        phase: { $nin: ['done', 'discarded', 'failed'] },
      },
      {
        $set: {
          phase: 'discarded',
          interruptMetadata: {
            reason: 'connection_lost',
            interruptedAtPhase: 'start',
            interruptedAt: new Date(),
          },
        },
      }
    )

    const dialogue = new Dialogue({
      appId: params.appId,
      conversationId: params.conversationId,
      type: params.type,
      phase: 'start',
      messages: [
        {
          role: 'user',
          userContent: {
            prompt: params.userMessage.prompt,
            images: params.userMessage.images,
          },
          createdAt: new Date(),
        },
      ],
      appJSON: params.appJSON ?? '',
      collections: [],
      cloudFunctions: [],
    })

    await dialogue.save()
    return dialogue
  }

  // ─── Phase 转移 ──────────────────────────────────────────────────────────────

  /**
   * 合法性校验后转移 phase（原子操作）
   *
   * 使用 findOneAndUpdate + 前置条件确保原子性：
   *   - 只有当前 phase 允许转移到 nextPhase 时才更新
   *   - 返回更新后的文档
   *
   * @throws 文档不存在或转移非法时抛异常
   */
  async setPhase(dialogueId: Types.ObjectId, nextPhase: DialoguePhase): Promise<IDialogueDoc> {
    // 先找出允许转移到 nextPhase 的源 phase 集合
    const validSourcePhases = Object.entries(PHASE_TRANSITIONS)
      .filter(([, targets]) => targets.includes(nextPhase))
      .map(([source]) => source)

    if (validSourcePhases.length === 0) {
      throw new Error(`[DialogueService] No valid source phase can transition to "${nextPhase}"`)
    }

    const updated = await Dialogue.findOneAndUpdate(
      {
        _id: dialogueId,
        phase: { $in: validSourcePhases },
      },
      { $set: { phase: nextPhase } },
      { new: true }
    )

    if (!updated) {
      throw new Error(`[DialogueService] Phase transition to "${nextPhase}" failed for Dialogue ${dialogueId} (not found or invalid current phase)`)
    }

    return updated
  }

  // ─── 查询 ────────────────────────────────────────────────────────────────────

  /**
   * 查找 appId 下当前活跃（非终态）的 Dialogue
   *
   * 正常情况下最多只有 1 个（create 时会清理孤儿）。
   * 返回最新的那个。
   */
  async getActiveByApp(appId: string): Promise<IDialogueDoc | null> {
    return Dialogue.findOne({
      appId,
      phase: { $nin: ['done', 'discarded', 'failed'] },
    }).sort({ createdAt: -1 })
  }

  /**
   * 按 ID 查找 Dialogue
   */
  async getById(dialogueId: Types.ObjectId): Promise<IDialogueDoc | null> {
    return Dialogue.findById(dialogueId)
  }

  // ─── 字段更新 ────────────────────────────────────────────────────────────────

  /**
   * 设置 threadId（XiangDi 返回 thread ID 后调用）
   */
  async setThreadId(dialogueId: Types.ObjectId, threadId: string): Promise<void> {
    await Dialogue.updateOne({ _id: dialogueId }, { $set: { threadId } })
  }

  /**
   * 增量更新 appJSON（executing 期间每次快照更新时调用）
   */
  async updateAppJSON(dialogueId: Types.ObjectId, appJSON: string): Promise<void> {
    await Dialogue.updateOne({ _id: dialogueId }, { $set: { appJSON } })
  }

  /**
   * 覆盖 collections 快照
   */
  async updateCollections(dialogueId: Types.ObjectId, collections: ICollectionDef[]): Promise<void> {
    await Dialogue.updateOne({ _id: dialogueId }, { $set: { collections } })
  }

  /**
   * 覆盖 cloudFunctions 快照
   */
  async updateCloudFunctions(dialogueId: Types.ObjectId, cloudFunctions: ICloudFunction[]): Promise<void> {
    await Dialogue.updateOne({ _id: dialogueId }, { $set: { cloudFunctions } })
  }

  // ─── 消息追加 ────────────────────────────────────────────────────────────────

  /**
   * 追加 assistant 内容块
   *
   * 策略：如果最后一条消息是 assistant 角色，追加到其 assistantContent；
   * 否则创建新的 assistant 消息。
   */
  async appendAssistantContent(dialogueId: Types.ObjectId, content: IAssistantContent[]): Promise<void> {
    if (content.length === 0) return

    const doc = await Dialogue.findById(dialogueId)
    if (!doc) return

    const lastMsg = doc.messages[doc.messages.length - 1]
    if (lastMsg && lastMsg.role === 'assistant') {
      // 追加到现有 assistant 消息
      await Dialogue.updateOne(
        { _id: dialogueId },
        { $push: { [`messages.${doc.messages.length - 1}.assistantContent`]: { $each: content } } }
      )
    } else {
      // 创建新的 assistant 消息
      await Dialogue.updateOne(
        { _id: dialogueId },
        {
          $push: {
            messages: {
              role: 'assistant',
              assistantContent: content,
              createdAt: new Date(),
            },
          },
        }
      )
    }
  }

  // ─── 中断归因 ────────────────────────────────────────────────────────────────

  /**
   * 中断操作：phase → discarded + 写 interruptMetadata
   *
   * 如果 Dialogue 已处于终态则跳过（幂等）。
   */
  async interrupt(dialogueId: Types.ObjectId, reason: DiscardReason, currentPhase: DialoguePhase): Promise<void> {
    // 终态不可转移
    if (TERMINAL_PHASES.has(currentPhase)) return

    await Dialogue.updateOne(
      {
        _id: dialogueId,
        phase: { $nin: ['done', 'discarded', 'failed'] },
      },
      {
        $set: {
          phase: 'discarded',
          interruptMetadata: {
            reason,
            interruptedAtPhase: currentPhase,
            interruptedAt: new Date(),
          },
        },
      }
    )
  }

  // ─── 摘要 ──────────────────────────────────────────────────────────────────────

  /**
   * 写入结构化 summary（含 embedding，done 时调用）
   */
  async setSummary(dialogueId: Types.ObjectId, summary: IDialogueSummary): Promise<void> {
    await Dialogue.updateOne({ _id: dialogueId }, { $set: { summary } })
  }

  // ─── 规划产物 ──────────────────────────────────────────────────────────────

  /**
   * 追加规划产物条目（某个 Agent 完成时调用）
   */
  async appendPlanningEntry(dialogueId: Types.ObjectId, entry: IPlanningEntry): Promise<void> {
    await Dialogue.updateOne(
      { _id: dialogueId },
      { $push: { planningEntries: { ...entry, createdAt: new Date() } } }
    )
  }


  // ─── Agent 记忆暂存 ────────────────────────────────────────────────────────

  /**
   * 暂存 Agent 记忆更新（confirm 时落库到 AgentMemory 集合）
   *
   * task 模式下 memoryUpdates 暂存在 Dialogue 文档中，
   * 避免在 confirm 之前就写入 AgentMemory（保持事务一致性）。
   */
  async setMemoryUpdates(dialogueId: Types.ObjectId, memoryInput: IMemoryUpdateInput): Promise<void> {
    await Dialogue.updateOne(
      { _id: dialogueId },
      { $set: { memoryUpdates: memoryInput } }
    )
  }

  // ─── 文本摘要（简单 string，区别于结构化 summary）────────────────────────────

  /**
   * 设置 roundSummary 文本到结构化 summary.text
   *
   * 如果结构化 summary 尚未设置，创建一个只含 text 的初始结构。
   */
  async setRoundSummary(dialogueId: Types.ObjectId, summaryText: string): Promise<void> {
    await Dialogue.updateOne(
      { _id: dialogueId },
      {
        $set: {
          'summary.text': summaryText,
          'summary.pageIds': [],
          'summary.viewIds': [],
          'summary.changeTags': [],
        },
      }
    )
  }

  // ─── 查询扩展 ─────────────────────────────────────────────────────────────

  /**
   * 获取应用最近一个 failed 状态的 Dialogue（5分钟内）
   *
   * 用于 getStatus 展示失败状态——超过 5 分钟的 failed 对话不再展示。
   */
  async getRecentFailed(appId: string): Promise<IDialogueDoc | null> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
    return Dialogue.findOne({
      appId,
      phase: 'failed',
      updatedAt: { $gte: fiveMinutesAgo },
    }).sort({ updatedAt: -1 })
  }

  /**
   * 获取可确认的 Dialogue（phase=awaiting_confirm）
   *
   * 替代原 pendingStore.getConfirmable(appId)
   */
  async getConfirmable(appId: string): Promise<IDialogueDoc | null> {
    return Dialogue.findOne({
      appId,
      phase: 'awaiting_confirm',
    }).sort({ createdAt: -1 })
  }

  /**
   * 获取应用最近 N 个已完成的 Dialogue（用于历史查询）
   */
  async getRecentDone(appId: string, limit = 20): Promise<IDialogueDoc[]> {
    return Dialogue.find({
      appId,
      phase: 'done',
    })
      .sort({ createdAt: -1 })
      .limit(limit)
  }

  /**
   * 获取 Dialogue 的规划产物（兼容 PlanningController 查询）
   */
  async getPlanningEntries(dialogueId: Types.ObjectId): Promise<IPlanningEntry[]> {
    const doc = await Dialogue.findById(dialogueId, { planningEntries: 1 }).lean()
    return doc?.planningEntries ?? []
  }
}

export default new DialogueService()
