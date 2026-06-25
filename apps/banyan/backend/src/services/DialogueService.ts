/**
 * DialogueService — ADR-041 Dialogue 集合的唯一 CRUD + Phase 转移
 *
 * 职责：
 *   1. 创建 Dialogue（AI 对话发起时，phase=start），同时给三张内容表 append 草稿版本
 *   2. Phase 转移（校验 PHASE_TRANSITIONS 合法性后 atomic $set）
 *   3. 提供最新已接受（done）对话的三个内容版本号（读取聚合与拷贝基线）
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
  type IMemoryUpdateInput,
} from '../models/types/index.js'
import uiDefinitionService from './UIDefinitionService.js'
import { SchemaService } from './SchemaService.js'
import cloudFunctionService from './CloudFunctionService.js'

/** 三个内容表的版本号三元组 */
export interface IContentVersions {
  uiDefinitionVersion: number
  schemaVersion: number
  cloudFunctionVersion: number
}

// ─── 终态集合（不可转移的 phase）──────────────────────────────────────────────

const TERMINAL_PHASES: Set<DialoguePhase> = new Set(['done', 'discarded', 'failed'])

// ─── DialogueService 实现 ─────────────────────────────────────────────────────

class DialogueService {
  // ─── 创建 ────────────────────────────────────────────────────────────────────

  /**
   * 创建 Dialogue，初始 phase=start
   *
   * 单活跃约束：如果该 appId 下已有活跃（非终态）的 Dialogue，先将其标记为 discarded（异常恢复）。
   *
   * 版本号引用模型：
   *   1. 取最新已接受（done）对话的三个内容版本号作为拷贝基线
   *   2. 给三张内容表各 append 一个草稿版本（拷贝基线内容），绑定本对话 _id
   *   3. 将三个新版本号写入 Dialogue
   */
  async create(params: {
    appId: string
    conversationId: Types.ObjectId
    type: DialogueType
    userMessage: { prompt: string; images: Array<{ url: string; alt?: string }> }
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
      },
    )

    // 取最新已接受版本作为拷贝基线
    const base = await this.getLatestAcceptedVersions(params.appId)

    const dialogueId = new Types.ObjectId()

    // 给三张内容表 append 草稿版本（绑定本对话 _id），方案 A：三表强制对齐 append
    const [uiDefinitionVersion, schemaVersion, cloudFunctionVersion] = await Promise.all([
      uiDefinitionService.createDraftVersion(params.appId, dialogueId, base.uiDefinitionVersion),
      SchemaService.createDraftVersion(params.appId, dialogueId, base.schemaVersion),
      cloudFunctionService.createDraftVersion(params.appId, dialogueId, base.cloudFunctionVersion),
    ])

    const dialogue = new Dialogue({
      _id: dialogueId,
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
      uiDefinitionVersion,
      schemaVersion,
      cloudFunctionVersion,
    })

    await dialogue.save()
    return dialogue
  }

  /**
   * 获取应用最新已接受（done）对话的三个内容版本号。
   *
   * 这是读取聚合与拷贝基线的唯一权威来源——未接受（discarded/failed/进行中）
   * 对话所持有的版本均被忽略。无 done 对话时返回全 0（空内容基线）。
   */
  async getLatestAcceptedVersions(appId: string): Promise<IContentVersions> {
    const latestDone = await Dialogue.findOne(
      { appId, phase: 'done' },
      { uiDefinitionVersion: 1, schemaVersion: 1, cloudFunctionVersion: 1 },
    )
      .sort({ createdAt: -1 })
      .lean()

    if (!latestDone) {
      return { uiDefinitionVersion: 0, schemaVersion: 0, cloudFunctionVersion: 0 }
    }

    return {
      uiDefinitionVersion: latestDone.uiDefinitionVersion,
      schemaVersion: latestDone.schemaVersion,
      cloudFunctionVersion: latestDone.cloudFunctionVersion,
    }
  }

  /**
   * 获取「当前工作版本」的三个内容版本号。
   *
   * 用于 XiangDi 服务回拉应用状态（agent 工作面）：
   *   - 若存在活跃（非终态）对话，返回其持有的草稿版本号（agent 正在原地编辑这些记录）
   *   - 否则回退到最新已接受版本（无活跃对话时的只读基线）
   */
  async getWorkingVersions(appId: string): Promise<IContentVersions> {
    const active = await Dialogue.findOne(
      { appId, phase: { $nin: ['done', 'discarded', 'failed'] } },
      { uiDefinitionVersion: 1, schemaVersion: 1, cloudFunctionVersion: 1 },
    )
      .sort({ createdAt: -1 })
      .lean()

    if (active) {
      return {
        uiDefinitionVersion: active.uiDefinitionVersion,
        schemaVersion: active.schemaVersion,
        cloudFunctionVersion: active.cloudFunctionVersion,
      }
    }

    return this.getLatestAcceptedVersions(appId)
  }

  /**
   * 执行一次「自动验收的直接编辑」对话（方向 B：保证语义一致性）。
   *
   * 设计：用户绕过 AI 的自主修改（改表结构 / 云函数 / UI 定义）也包装成一个
   * type='edit' 的对话，使「所有内容变更都归属于某个对话」这一不变式成立，
   * 从而读取聚合（getLatestAcceptedVersions + getByVersion）始终成立。
   *
   * 生命周期：start → committing → done（无 awaiting_confirm，自动验收）。
   * 内容写入：在 mutator 中按对话持有的三个版本号原地更新三表草稿记录。
   *
   * 单活跃约束：若已存在活跃（非终态）对话，拒绝创建（不可与进行中的 AI 对话并发）。
   *
   * @param params.appId            应用 ID
   * @param params.conversationId   会话 ID
   * @param params.summary          系统生成的、描述本次操作的用户消息文本
   * @param params.mutate           原地修改回调，入参为本对话持有的三个版本号
   */
  async runAutoConfirmedEdit<T>(params: {
    appId: string
    conversationId: Types.ObjectId
    summary: string
    mutate: (versions: IContentVersions) => Promise<T>
  }): Promise<T> {
    // 单活跃约束：存在活跃对话时拒绝（避免与进行中的 AI 对话竞态）
    const active = await this.getActiveByApp(params.appId)
    if (active) {
      throw Object.assign(
        new Error('[DialogueService] 当前存在进行中的对话，请先完成或撤销后再进行直接编辑'),
        { status: 409 },
      )
    }

    // 取最新已接受版本作为拷贝基线
    const base = await this.getLatestAcceptedVersions(params.appId)
    const dialogueId = new Types.ObjectId()

    // 给三表 append 草稿版本（方案 A：三表强制对齐 append）
    const [uiDefinitionVersion, schemaVersion, cloudFunctionVersion] = await Promise.all([
      uiDefinitionService.createDraftVersion(params.appId, dialogueId, base.uiDefinitionVersion),
      SchemaService.createDraftVersion(params.appId, dialogueId, base.schemaVersion),
      cloudFunctionService.createDraftVersion(params.appId, dialogueId, base.cloudFunctionVersion),
    ])

    const versions: IContentVersions = { uiDefinitionVersion, schemaVersion, cloudFunctionVersion }

    // 创建对话（系统生成的用户消息描述本次直接编辑操作）
    const dialogue = new Dialogue({
      _id: dialogueId,
      appId: params.appId,
      conversationId: params.conversationId,
      type: 'edit',
      phase: 'start',
      messages: [
        {
          role: 'user',
          userContent: { prompt: params.summary, images: [] },
          createdAt: new Date(),
        },
      ],
      uiDefinitionVersion,
      schemaVersion,
      cloudFunctionVersion,
    })
    await dialogue.save()

    try {
      // 原地修改三表草稿记录
      const result = await params.mutate(versions)

      // 自动验收：start → committing → done
      await this.setPhase(dialogueId, 'committing')
      await this.setRoundSummary(dialogueId, params.summary)
      await this.setPhase(dialogueId, 'done')

      return result
    } catch (err) {
      // mutate 或 setPhase 失败时，将对话标记为 failed 终态，防止阻塞后续编辑
      await Dialogue.updateOne({ _id: dialogueId }, { $set: { phase: 'failed' } }).catch(() => {
        /* 静默，不覆盖原始错误 */
      })
      throw err
    }
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
      { new: true },
    )

    if (!updated) {
      throw new Error(
        `[DialogueService] Phase transition to "${nextPhase}" failed for Dialogue ${dialogueId} (not found or invalid current phase)`,
      )
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
        { $push: { [`messages.${doc.messages.length - 1}.assistantContent`]: { $each: content } } },
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
        },
      )
    }
  }

  // ─── 中断归因 ────────────────────────────────────────────────────────────────

  /**
   * 中断操作：phase → discarded + 写 interruptMetadata
   *
   * 如果 Dialogue 已处于终态则跳过（幂等）。
   */
  async interrupt(
    dialogueId: Types.ObjectId,
    reason: DiscardReason,
    currentPhase: DialoguePhase,
  ): Promise<void> {
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
      },
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
      { $push: { planningEntries: { ...entry, createdAt: new Date() } } },
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
    await Dialogue.updateOne({ _id: dialogueId }, { $set: { memoryUpdates: memoryInput } })
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
      },
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
