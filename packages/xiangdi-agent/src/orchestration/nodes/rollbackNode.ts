/**
 * 回退仲裁节点（Rollback Node）
 *
 * ADR-041: 审计失败后的 LLM 仲裁。
 * 对审计的 suggestedTarget 做冗余裁决（可能推翻），
 * 然后执行工件清空 + feedback 注入。
 *
 * 整个管线只有 intent 和 rollback 两个"路由决策" LLM 调用点。
 * rollback 不做需求理解，不做工件生成，只做根因定位 + 回退目标选择。
 *
 * 硬上限：rollbackCount >= 3 时直接终止流程，不再 LLM 仲裁。
 */
import { z } from 'zod'
import type { LLMClient } from '../../core/index.js'
import type { OrchestratorSSECallback } from '../events.js'
import type { AuditResult, RollbackResult, ArtifactStore } from '../artifacts.js'
import type { SubAgentName } from '../protocol.js'
import type { OrchestratorState } from '../orchestratorGraph.js'
import type { DialoguePhase } from '../phases.js'
import { callSubAgentLLM, parseWithRetry, buildExecution, emitProgress } from './shared.js'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 配置
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface RollbackNodeConfig {
  llm: LLMClient
  sseCallback?: OrchestratorSSECallback
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 常量
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const MAX_ROLLBACK_COUNT = 3

/** SOP 顺序（用于工件清空） */
const SOP_ORDER: SubAgentName[] = ['requirements', 'uiDesign', 'contract', 'frontend', 'backend']

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LLM Prompt
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ROLLBACK_SYSTEM_PROMPT = `你是一个回退仲裁器。审计发现了问题，你需要判断应该退回到哪个节点重新执行。

## 决策原则

1. 最小回退原则：退到能修复问题的最近节点，不要过度回退。退到 contract 能解决的问题不要退到 requirements。
2. 根因追溯：表面问题可能源于上游。如"前端引用了不存在的函数 ID"，根因在 contract（没定义该函数）而非 frontend。
3. 避免循环：检查 previousRollbacks，如果之前已退回某节点且同类问题再次出现，说明该节点无法自行修复，应退到更上游。

## 失败类别 → 典型回退目标

- reference_integrity（引用完整性）：通常退到 contract（契约定义不完整或 ID 不匹配）
- schema_validation（结构校验失败）：退到对应 Worker（frontend 或 backend 的产出格式有误）
- requirement_coverage（需求覆盖不足）：退到 requirements（需求遗漏）或 uiDesign（设计遗漏了功能入口）
- worker_failure（Worker 执行失败/超时）：退到对应 Worker 重跑（frontend 或 backend）
- semantic_inconsistency（语义不一致）：根据 description 判断根因在哪一层

## 特殊规则

- 如果 suggestedTarget 存在且与你的判断一致，直接采用
- 如果两个 Worker 都失败，优先退到 contract（可能是契约不够清晰导致两边都无法执行）
- feedbackForTarget 必须具体、可操作（不要写"请修复问题"，要写"函数 createOrder 缺少 userId 入参定义"）

## 输出

严格输出 JSON，不要解释。`

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Output Schema
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const RollbackResultSchema = z.object({
  target: z.enum(['requirements', 'uiDesign', 'contract', 'frontend', 'backend']),
  reasoning: z.string(),
  feedbackForTarget: z.string(),
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 工件摘要生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildArtifactsSummary(artifacts: ArtifactStore): Record<string, string> {
  const summary: Record<string, string> = {}

  if (artifacts.requirements) {
    const featureNames = artifacts.requirements.features.map((f) => f.title).join('、')
    summary.requirements = `${artifacts.requirements.features.length} 个功能：${featureNames}`
  }

  if (artifacts.uiDesign) {
    const pageNames = artifacts.uiDesign.pages.map((p) => p.name).join('、')
    summary.uiDesign = `${artifacts.uiDesign.pages.length} 个页面：${pageNames}`
  }

  if (artifacts.contract) {
    summary.contract = `${artifacts.contract.collections.length} 个数据表、${artifacts.contract.cloudFunctions.length} 个云函数、${artifacts.contract.bindings.length} 个绑定`
  }

  if (artifacts.frontend) {
    const pageIds = artifacts.frontend.pages.map((p) => p.pageId).join('、')
    summary.frontend = `${artifacts.frontend.pages.length} 个页面产出：${pageIds}`
  }

  if (artifacts.backend) {
    const fnNames = artifacts.backend.cloudFunctions.map((cf) => cf.name).join('、')
    summary.backend = `${artifacts.backend.collections.length} 个数据表、${artifacts.backend.cloudFunctions.length} 个云函数：${fnNames}`
  }

  return summary
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// User Prompt 构造
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface PreviousRollback {
  target: SubAgentName
  reason: string
}

function buildUserPrompt(
  auditResult: AuditResult,
  artifactsSummary: Record<string, string>,
  rollbackCount: number,
  previousRollbacks: PreviousRollback[],
): string {
  const failReasonsText = (auditResult.failReasons ?? [])
    .map((r) => `- [${r.category}] ${r.description}（涉及：${r.involvedArtifacts.join(', ')}）`)
    .join('\n')

  const artifactsText = Object.entries(artifactsSummary)
    .map(([key, val]) => `- ${key}: ${val}`)
    .join('\n')

  const previousText =
    previousRollbacks.length > 0
      ? previousRollbacks.map((r) => `- 退到 ${r.target}：${r.reason}`).join('\n')
      : '无'

  return `## 审计失败原因

${failReasonsText}

## 审计建议的回退目标

${auditResult.suggestedTarget ?? '未给出建议'}

## 当前工件摘要

${artifactsText}

## 已回退次数

${rollbackCount}

## 之前的回退记录

${previousText}

---

请判断应该退到哪个节点，并给出具体的修正指令。`
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 工件清空
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 清空目标节点及其后续所有节点的工件
 */
function clearArtifactsFrom(artifacts: ArtifactStore, target: SubAgentName): ArtifactStore {
  const targetIndex = SOP_ORDER.indexOf(target)
  if (targetIndex < 0) return artifacts

  const cleared = { ...artifacts }
  for (let i = targetIndex; i < SOP_ORDER.length; i++) {
    const key = SOP_ORDER[i] === 'uiDesign' ? 'uiDesign' : SOP_ORDER[i]
    delete (cleared as Record<string, unknown>)[key]
  }
  return cleared
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 从 executions 提取 previousRollbacks
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function extractPreviousRollbacks(state: OrchestratorState): PreviousRollback[] {
  // 从 rollbackResult 历史（如果 state 有多轮执行痕迹）
  // 当前架构中 rollbackResult 每次被覆盖，所以用 executions 中 rollback 节点的记录间接推导
  // 但最直接的方式是：如果有上一次的 rollbackResult 且本次审计又失败了，说明上一次回退没解决问题
  if (state.rollbackResult) {
    return [
      {
        target: state.rollbackResult.target,
        reason: state.rollbackResult.reasoning,
      },
    ]
  }
  return []
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 工厂函数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function createRollbackNode(config: RollbackNodeConfig) {
  return async (state: OrchestratorState): Promise<Partial<OrchestratorState>> => {
    const startedAt = Date.now()
    const { auditResult, artifacts, rollbackCount } = state

    // ─── 硬上限检查 ──────────────────────────────────────────────────────
    if (rollbackCount >= MAX_ROLLBACK_COUNT) {
      emitProgress(config.sseCallback, 'frontend', 'failed', '回退次数超限，流程终止')

      return {
        phase: 'done' as DialoguePhase,
        rollbackResult: {
          target: 'requirements',
          reasoning: `回退次数已达上限 (${MAX_ROLLBACK_COUNT})，终止流程`,
          feedbackForTarget: '',
        },
        executions: [buildExecution('frontend', startedAt, 'failed', '回退次数超限')],
      }
    }

    // ─── 防御性检查 ──────────────────────────────────────────────────────
    if (!auditResult || auditResult.passed) {
      // 不应该进入 rollback（审计通过了）
      return {
        rollbackResult: {
          target: 'requirements',
          reasoning: '异常状态：审计通过但进入了 rollback 节点',
          feedbackForTarget: '',
        },
        executions: [buildExecution('frontend', startedAt, 'failed', '审计通过但进入 rollback')],
      }
    }

    // ─── 构造 LLM 输入 ──────────────────────────────────────────────────
    const artifactsSummary = buildArtifactsSummary(artifacts)
    const previousRollbacks = extractPreviousRollbacks(state)
    const userPrompt = buildUserPrompt(auditResult, artifactsSummary, rollbackCount, previousRollbacks)

    // ─── LLM 仲裁 ───────────────────────────────────────────────────────
    const { text: rawText } = await callSubAgentLLM({
      llm: config.llm,
      systemPrompt: ROLLBACK_SYSTEM_PROMPT,
      userPrompt,
      temperature: 0,
      maxTokens: 512,
    })

    const parseResult = await parseWithRetry({
      rawText,
      schema: RollbackResultSchema,
      llm: config.llm,
      systemPrompt: ROLLBACK_SYSTEM_PROMPT,
      userPrompt,
    })

    let rollbackResult: RollbackResult
    if (parseResult.success) {
      rollbackResult = parseResult.data
    } else {
      // LLM 解析失败 → 降级到审计建议，或默认 requirements
      rollbackResult = {
        target: auditResult.suggestedTarget ?? 'requirements',
        reasoning: `LLM 仲裁解析失败，降级采用审计建议: ${parseResult.error}`,
        feedbackForTarget: (auditResult.failReasons ?? []).map((r) => r.description).join('; '),
      }
    }

    // ─── 工件清空 ────────────────────────────────────────────────────────
    const clearedArtifacts = clearArtifactsFrom(artifacts, rollbackResult.target)

    // ─── 返回 state 更新 ─────────────────────────────────────────────────
    return {
      artifacts: clearedArtifacts,
      rollbackResult,
      rollbackCount: rollbackCount + 1,
      // 注入 auditFeedback 到 state（目标节点读取此字段作为修正依据）
      auditFeedback: rollbackResult.feedbackForTarget,
      executions: [buildExecution('frontend', startedAt, 'completed')],
    }
  }
}
