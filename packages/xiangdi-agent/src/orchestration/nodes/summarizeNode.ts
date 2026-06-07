/**
 * 总结节点（Summarize Node）
 *
 * ADR-041: committing 阶段的第二步。
 * 职责：
 *   1. 用 LLM 生成用户可读的变更摘要
 *   2. 通过 text_delta SSE 流式推送给前端
 *   3. 推送 phase_change: done
 *   4. 推送 done { summary, artifacts } 终止事件
 *
 * 归属：committing 阶段的内部动作，不作为独立 phase 暴露给用户。
 */
import type { LLMClient } from '../../core/index.js'
import type { OrchestratorSSECallback, DoneArtifactsOverview } from '../events.js'
import type { ArtifactStore } from '../artifacts.js'
import type { DialoguePhase } from '../phases.js'
import type { OrchestratorState } from '../orchestratorGraph.js'
import { callSubAgentLLM } from './shared.js'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 配置
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface SummarizeNodeConfig {
  llm: LLMClient
  sseCallback?: OrchestratorSSECallback
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Prompt
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SUMMARIZE_SYSTEM_PROMPT = `你是一个变更摘要生成器。根据本轮构建的全部产出，生成一段简洁的用户可读摘要。

## 输出要求

- 使用中文
- 以"本次为您"开头
- 列出做了什么（新增/修改了哪些页面、数据表、云函数）
- 简明扼要，不超过 200 字
- 不要使用 markdown 标题或列表符号，用自然语言一段话描述
- 不要提及技术细节（如 FlowSchema、AIProjection 等内部概念）`

function buildSummarizeUserPrompt(
  artifacts: ArtifactStore,
  commitArtifacts: DoneArtifactsOverview | null,
): string {
  const parts: string[] = []

  if (artifacts.requirements) {
    const features = artifacts.requirements.features.map(f => f.title).join('、')
    parts.push(`需求功能：${features}`)
  }

  if (commitArtifacts) {
    if (commitArtifacts.pagesModified.length > 0) {
      parts.push(`页面：${commitArtifacts.pagesModified.join('、')}`)
    }
    if (commitArtifacts.collectionsModified.length > 0) {
      parts.push(`数据表：${commitArtifacts.collectionsModified.join('、')}`)
    }
    if (commitArtifacts.functionsModified.length > 0) {
      parts.push(`云函数：${commitArtifacts.functionsModified.join('、')}`)
    }
  }

  if (artifacts.uiDesign) {
    const pageNames = artifacts.uiDesign.pages.map(p => p.name).join('、')
    parts.push(`UI 设计页面：${pageNames}`)
  }

  return `## 本轮构建产出概览

${parts.join('\n')}

---

请生成一段用户可读的变更摘要。`
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 工厂函数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function createSummarizeNode(config: SummarizeNodeConfig) {
  return async (state: OrchestratorState): Promise<Partial<OrchestratorState>> => {
    const { artifacts, commitArtifacts } = state

    // ─── LLM 生成摘要 ────────────────────────────────────────────────────
    const userPrompt = buildSummarizeUserPrompt(artifacts, commitArtifacts)

    let summary: string
    try {
      summary = await callSubAgentLLM({
        llm: config.llm,
        systemPrompt: SUMMARIZE_SYSTEM_PROMPT,
        userPrompt,
        temperature: 0.3,
        maxTokens: 512,
      })
    } catch {
      // LLM 失败时用程序化兜底摘要
      summary = buildFallbackSummary(commitArtifacts)
    }

    // ─── 流式推送摘要文本（text_delta） ──────────────────────────────────
    // 由于 callSubAgentLLM 当前是非流式的，这里模拟分段推送
    // 后续可优化为真正的 streaming
    if (config.sseCallback) {
      // 分段推送，每段约 20 字符
      const chunkSize = 20
      for (let i = 0; i < summary.length; i += chunkSize) {
        const chunk = summary.slice(i, i + chunkSize)
        config.sseCallback({
          type: 'text_delta',
          delta: chunk,
          timestamp: Date.now(),
        })
      }
    }

    // ─── 推送 phase_change: done ──────────────────────────────────────────
    config.sseCallback?.({
      type: 'phase_change',
      from: 'committing',
      to: 'done',
      timestamp: Date.now(),
    })

    // ─── 推送 done 终止事件 ──────────────────────────────────────────────
    config.sseCallback?.({
      type: 'done',
      finalPhase: 'done',
      summary,
      artifacts: commitArtifacts ?? undefined,
      timestamp: Date.now(),
    })

    return {
      phase: 'done' as DialoguePhase,
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 兜底摘要
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildFallbackSummary(commitArtifacts: DoneArtifactsOverview | null): string {
  if (!commitArtifacts) return '本次为您完成了应用构建。'

  const parts: string[] = []
  if (commitArtifacts.pagesModified.length > 0) {
    parts.push(`${commitArtifacts.pagesModified.length} 个页面`)
  }
  if (commitArtifacts.collectionsModified.length > 0) {
    parts.push(`${commitArtifacts.collectionsModified.length} 个数据表`)
  }
  if (commitArtifacts.functionsModified.length > 0) {
    parts.push(`${commitArtifacts.functionsModified.length} 个云函数`)
  }

  return `本次为您构建了${parts.join('、')}。`
}
