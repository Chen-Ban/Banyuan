/**
 * PhaseController — ADR-041 Dialogue Phase 权威推进器
 *
 * 职责：
 *   1. 持有当前 Dialogue 的 ID 和 phase 缓存（避免每次 DB 查询）
 *   2. 提供 transition(targetPhase) — 校验合法性 + DialogueService.setPhase + 发 SSE `phase_change` 事件
 *   3. 集中管理 phase 变更通知，AiService 不再直接散调 dialogueService.setPhase
 *
 * 生命周期：
 *   - 每次 AI 请求（runWithSSE / resumeSSE）实例化一个 PhaseController
 *   - PhaseController 与 Dialogue 1:1 绑定，随 SSE 流结束而销毁
 *
 * 容错策略：
 *   - transition 失败只 logger.warn，不抛异常阻断主流程
 *   - SSE 发送失败（连接已关闭）静默忽略
 *
 * SSE 事件格式（与前端 AiPhaseChangeEvent 契约对齐）：
 *   event: phase_change
 *   data: { "from": "start", "to": "requirements", "timestamp": 1700000000000 }
 */

import type { ServerResponse } from 'http'
import type { Types } from 'mongoose'
import dialogueService from './DialogueService.js'
import type { DialoguePhase, DiscardReason } from '../models/types/index.js'
import { PHASE_TRANSITIONS } from '../models/types/index.js'
import { logger } from '../utils/logger.js'

// ─── SSE 工具（复用 AiService 的 sseWrite 签名） ──────────────────────────────

function sseWritePhase(res: ServerResponse, to: DialoguePhase, from: DialoguePhase): void {
  if (res.writableEnded) return
  const payload = JSON.stringify({ from, to, timestamp: Date.now() })
  res.write(`event: phase_change\ndata: ${payload}\n\n`)
}

// ─── 终态集合 ────────────────────────────────────────────────────────────────

const TERMINAL_PHASES: Set<DialoguePhase> = new Set(['done', 'discarded', 'failed'])

// ─── PhaseController 实现 ─────────────────────────────────────────────────────

export class PhaseController {
  private dialogueId: Types.ObjectId
  private currentPhase: DialoguePhase
  private clientRes: ServerResponse

  private constructor(dialogueId: Types.ObjectId, initialPhase: DialoguePhase, clientRes: ServerResponse) {
    this.dialogueId = dialogueId
    this.currentPhase = initialPhase
    this.clientRes = clientRes
  }

  // ─── 工厂方法 ──────────────────────────────────────────────────────────────

  /**
   * 创建新 PhaseController（Dialogue 刚创建，phase=start）
   */
  static create(dialogueId: Types.ObjectId, clientRes: ServerResponse): PhaseController {
    return new PhaseController(dialogueId, 'start', clientRes)
  }

  /**
   * 附着到已有 Dialogue（resume 场景）
   */
  static attach(
    dialogueId: Types.ObjectId,
    currentPhase: DialoguePhase,
    clientRes: ServerResponse,
  ): PhaseController {
    return new PhaseController(dialogueId, currentPhase, clientRes)
  }

  // ─── 核心 API ─────────────────────────────────────────────────────────────

  /**
   * 推进 phase 到 targetPhase
   *
   * 执行流程：
   *   1. 本地校验 PHASE_TRANSITIONS 合法性（快速失败，无 IO）
   *   2. 调用 DialogueService.setPhase（原子 DB 更新）
   *   3. 向前端发送 SSE `phase_change` 事件
   *   4. 更新内存缓存
   *
   * 返回值表示是否成功转移。失败只 warn 不抛异常。
   */
  async transition(targetPhase: DialoguePhase): Promise<boolean> {
    // 1. 快速校验
    if (TERMINAL_PHASES.has(this.currentPhase)) {
      logger.warn(`[PhaseController] 尝试从终态 "${this.currentPhase}" 转移到 "${targetPhase}"，已忽略`)
      return false
    }

    const allowed = PHASE_TRANSITIONS[this.currentPhase]
    if (!allowed.includes(targetPhase)) {
      logger.warn(`[PhaseController] 非法转移: "${this.currentPhase}" → "${targetPhase}"，已忽略`)
      return false
    }

    // 2. DB 原子写入
    try {
      await dialogueService.setPhase(this.dialogueId, targetPhase)
    } catch (err) {
      logger.warn(`[PhaseController] DB phase 转移失败 ("${this.currentPhase}" → "${targetPhase}"):`, err)
      return false
    }

    // 3. SSE 推送
    const previousPhase = this.currentPhase
    sseWritePhase(this.clientRes, targetPhase, previousPhase)

    // 4. 更新内存缓存
    this.currentPhase = targetPhase

    return true
  }

  /**
   * 中断（user_aborted / connection_lost）— 直接走 discarded 终态
   *
   * 与 transition('discarded') 不同的是会写 interruptMetadata。
   *
   * 保护策略：committing 阶段不允许中断（持久化表正在写入）。
   * 此时数据一致性优先于用户意图，防止半写入状态。
   */
  async interrupt(reason: DiscardReason): Promise<void> {
    if (TERMINAL_PHASES.has(this.currentPhase)) return

    // committing 阶段不允许中断：数据一致性优先
    if (this.currentPhase === 'committing') {
      logger.warn(`[PhaseController] 拒绝中断: Dialogue ${this.dialogueId} 处于 committing 阶段`)
      return
    }

    try {
      await dialogueService.interrupt(this.dialogueId, reason, this.currentPhase)
    } catch (err) {
      logger.warn('[PhaseController] interrupt 写入失败:', err)
      return
    }

    const previousPhase = this.currentPhase
    this.currentPhase = 'discarded'
    sseWritePhase(this.clientRes, 'discarded', previousPhase)
  }

  /**
   * 标记失败 — transition('failed') 的快捷方式
   */
  async fail(): Promise<void> {
    await this.transition('failed')
  }

  // ─── 查询 ─────────────────────────────────────────────────────────────────

  /** 获取当前缓存的 phase */
  getPhase(): DialoguePhase {
    return this.currentPhase
  }

  /** 获取关联的 Dialogue ID */
  getDialogueId(): Types.ObjectId {
    return this.dialogueId
  }

  /** 当前是否已处于终态 */
  isTerminal(): boolean {
    return TERMINAL_PHASES.has(this.currentPhase)
  }
}
