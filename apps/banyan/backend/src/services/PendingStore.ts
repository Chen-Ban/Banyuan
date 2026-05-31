/**
 * PendingStore — 待确认对话临时存储
 *
 * 用于在 AI 对话过程中暂存所有副作用数据（appJSON、schema、memory、assistant 消息等），
 * 直到用户明确确认（confirm）才一次性写入 MongoDB，实现"对话即事务"语义。
 *
 * 存储策略：
 *   - 进程内 Map（快速读写） + 文件落盘（进程重启恢复）
 *   - 文件路径：./data/pending/{appId}/{dialogueId}.json
 *   - TTL 清理：超过 2 小时未确认的自动删除
 *   - 每个 appId 最多 1 个 pending（互斥锁保证）
 *
 * 后续可替换为 Redis 实现（接口不变）。
 */

import { promises as fs } from 'fs'
import path from 'path'
import type { IAssistantContent } from '../models/Conversation.js'
import type { ICollectionDef } from '../models/CollectionSchema.js'
import type { MemoryUpdateInput } from './MemoryService.js'
import type { AgentRole } from '../models/PlanningArtifact.js'

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

/** Pending 数据状态 */
export type PendingStatus = 'streaming' | 'done' | 'interrupted' | 'failed'

/** 规划产物条目（暂存） */
export interface PendingPlanningEntry {
  agent: AgentRole
  output: unknown
  reasoning?: string
  tokenUsage: { input: number; output: number }
  durationMs: number
}

/** 待确认的对话数据（完整快照） */
export interface PendingDialogueData {
  /** 应用 ID */
  appId: string
  /** 对话 ID（预生成的 ObjectId hex string） */
  dialogueId: string
  /** XiangDi threadId */
  threadId: string
  /** 对话类型 */
  type: 'chat' | 'task'
  /** 用户消息 */
  userMessage: { prompt: string; images: Array<{ url: string; alt?: string }> }
  /** 收集的 assistant 消息内容块 */
  assistantContent: IAssistantContent[]
  /** 最终 appJSON（done 时设置） */
  finalAppJSON: string | null
  /** Schema 变更（暂存，confirm 时写入） */
  schemaUpdates: ICollectionDef[] | null
  /** Agent 记忆更新（暂存，confirm 时写入） */
  memoryUpdates: MemoryUpdateInput | null
  /** 对话摘要 */
  roundSummary: string | null
  /** 规划产物条目列表 */
  planningEntries: PendingPlanningEntry[]
  /** 规划产物失败的 Agent */
  planningFailedAgent: AgentRole | null
  /** 当前状态 */
  status: PendingStatus
  /** 创建时间戳（ms） */
  createdAt: number
  /** TTL（ms），默认 2 小时 */
  ttl: number
}

// ─── 常量 ─────────────────────────────────────────────────────────────────────

/** 默认 TTL：2 小时 */
const DEFAULT_TTL_MS = 2 * 60 * 60 * 1000

/** 清理间隔：10 分钟 */
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000

/** 持久化目录（相对于 cwd） */
const PENDING_DATA_DIR = path.resolve(process.cwd(), 'data', 'pending')

// ─── PendingStore 实现 ────────────────────────────────────────────────────────

class PendingStore {
  /** 进程内缓存：appId → PendingDialogueData */
  private cache = new Map<string, PendingDialogueData>()
  /** 清理定时器 */
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  constructor() {
    // 启动 TTL 清理定时器
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS)
    this.cleanupTimer.unref()
    // 启动时尝试恢复磁盘数据
    this.recoverFromDisk().catch((err) => {
      console.warn('[PendingStore] 磁盘恢复失败:', err.message)
    })
  }

  // ─── 公共 API ─────────────────────────────────────────────────────────────

  /**
   * 创建新的 PendingDialogue
   *
   * 注意：同一 appId 最多只有一个 pending。如果已有旧的，会被覆盖。
   */
  create(params: {
    appId: string
    dialogueId: string
    threadId: string
    type: 'chat' | 'task'
    userMessage: { prompt: string; images: Array<{ url: string; alt?: string }> }
  }): PendingDialogueData {
    const data: PendingDialogueData = {
      appId: params.appId,
      dialogueId: params.dialogueId,
      threadId: params.threadId,
      type: params.type,
      userMessage: params.userMessage,
      assistantContent: [],
      finalAppJSON: null,
      schemaUpdates: null,
      memoryUpdates: null,
      roundSummary: null,
      planningEntries: [],
      planningFailedAgent: null,
      status: 'streaming',
      createdAt: Date.now(),
      ttl: DEFAULT_TTL_MS,
    }
    this.cache.set(params.appId, data)
    return data
  }

  /**
   * 获取指定 appId 的 pending 数据
   */
  get(appId: string): PendingDialogueData | null {
    return this.cache.get(appId) ?? null
  }

  /**
   * 获取指定 appId 的最新 pending（仅 status=done 的才返回，供前端确认）
   */
  getConfirmable(appId: string): PendingDialogueData | null {
    const data = this.cache.get(appId)
    if (!data) return null
    if (data.status !== 'done') return null
    return data
  }

  /**
   * 更新 pending 数据的状态
   */
  updateStatus(appId: string, status: PendingStatus): void {
    const data = this.cache.get(appId)
    if (data) {
      data.status = status
    }
  }

  /**
   * 设置最终 appJSON
   */
  setFinalAppJSON(appId: string, appJSON: string): void {
    const data = this.cache.get(appId)
    if (data) {
      data.finalAppJSON = appJSON
    }
  }

  /**
   * 设置 assistant 内容
   */
  setAssistantContent(appId: string, content: IAssistantContent[]): void {
    const data = this.cache.get(appId)
    if (data) {
      data.assistantContent = content
    }
  }

  /**
   * 设置 Schema 更新
   */
  setSchemaUpdates(appId: string, collections: ICollectionDef[]): void {
    const data = this.cache.get(appId)
    if (data) {
      data.schemaUpdates = collections
    }
  }

  /**
   * 设置 Agent 记忆更新
   */
  setMemoryUpdates(appId: string, memoryInput: MemoryUpdateInput): void {
    const data = this.cache.get(appId)
    if (data) {
      data.memoryUpdates = memoryInput
    }
  }

  /**
   * 设置对话摘要
   */
  setRoundSummary(appId: string, summary: string): void {
    const data = this.cache.get(appId)
    if (data) {
      data.roundSummary = summary
    }
  }

  /**
   * 添加规划产物条目
   */
  addPlanningEntry(appId: string, entry: PendingPlanningEntry): void {
    const data = this.cache.get(appId)
    if (data) {
      data.planningEntries.push(entry)
    }
  }

  /**
   * 标记规划产物失败
   */
  setPlanningFailed(appId: string, agent: AgentRole): void {
    const data = this.cache.get(appId)
    if (data) {
      data.planningFailedAgent = agent
    }
  }

  /**
   * 完成 pending（done 事件后调用）：更新状态并异步落盘
   */
  async markDone(appId: string): Promise<void> {
    const data = this.cache.get(appId)
    if (data) {
      data.status = 'done'
      await this.persistToDisk(data)
    }
  }

  /**
   * 删除 pending 数据（confirm 或 discard 后调用）
   */
  async delete(appId: string): Promise<void> {
    const data = this.cache.get(appId)
    this.cache.delete(appId)
    if (data) {
      await this.removeFromDisk(data.appId, data.dialogueId).catch(() => {})
    }
  }

  /**
   * 判断指定 appId 是否有 pending 数据
   */
  has(appId: string): boolean {
    return this.cache.has(appId)
  }

  // ─── 磁盘持久化 ───────────────────────────────────────────────────────────

  private async persistToDisk(data: PendingDialogueData): Promise<void> {
    try {
      const dir = path.join(PENDING_DATA_DIR, data.appId)
      await fs.mkdir(dir, { recursive: true })
      const filePath = path.join(dir, `${data.dialogueId}.json`)
      await fs.writeFile(filePath, JSON.stringify(data), 'utf-8')
    } catch (err) {
      console.warn('[PendingStore] 落盘失败:', (err as Error).message)
    }
  }

  private async removeFromDisk(appId: string, dialogueId: string): Promise<void> {
    const filePath = path.join(PENDING_DATA_DIR, appId, `${dialogueId}.json`)
    await fs.unlink(filePath).catch(() => {})
    // 尝试删除空目录（忽略非空报错）
    const dir = path.join(PENDING_DATA_DIR, appId)
    await fs.rmdir(dir).catch(() => {})
  }

  /**
   * 进程启动时从磁盘恢复 pending 数据
   * 仅恢复 status=done 且未超时的数据
   */
  private async recoverFromDisk(): Promise<void> {
    let appDirs: string[]
    try {
      appDirs = await fs.readdir(PENDING_DATA_DIR)
    } catch {
      // 目录不存在，无需恢复
      return
    }

    const now = Date.now()
    for (const appId of appDirs) {
      const appDir = path.join(PENDING_DATA_DIR, appId)
      let files: string[]
      try {
        const stat = await fs.stat(appDir)
        if (!stat.isDirectory()) continue
        files = await fs.readdir(appDir)
      } catch {
        continue
      }
      for (const file of files) {
        if (!file.endsWith('.json')) continue
        try {
          const content = await fs.readFile(path.join(appDir, file), 'utf-8')
          const data = JSON.parse(content) as PendingDialogueData
          // 跳过已超时的
          if (now - data.createdAt > data.ttl) {
            await this.removeFromDisk(data.appId, data.dialogueId).catch(() => {})
            continue
          }
          // 仅恢复 done 状态的（streaming/interrupted 状态的数据不可恢复）
          if (data.status === 'done') {
            this.cache.set(data.appId, data)
          } else {
            await this.removeFromDisk(data.appId, data.dialogueId).catch(() => {})
          }
        } catch {
          // 解析失败，跳过
        }
      }
    }
  }

  // ─── TTL 清理 ──────────────────────────────────────────────────────────────

  private cleanup(): void {
    const now = Date.now()
    for (const [appId, data] of this.cache) {
      if (now - data.createdAt > data.ttl) {
        this.cache.delete(appId)
        this.removeFromDisk(data.appId, data.dialogueId).catch(() => {})
      }
    }
  }

  /**
   * 关闭 store（测试/优雅停机时调用）
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
    this.cache.clear()
  }
}

export default new PendingStore()
