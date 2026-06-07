/**
 * Commit 节点
 *
 * ADR-041: committing 阶段的第一步。
 * 程序化节点（零 token），职责：
 *   1. 推进 phase 到 committing
 *   2. 从 artifacts 中组装产出概览（pagesModified/collectionsModified/functionsModified）
 *   3. 写入 state.commitArtifacts 供 summarizeNode 使用
 *
 * 注意：真正的 MongoDB 持久化由 banyan 后端在收到 done 事件后执行，
 * XiangDi 服务不访问 MongoDB。
 */
import type { OrchestratorSSECallback } from '../events.js'
import type { DoneArtifactsOverview } from '../events.js'
import type { ArtifactStore } from '../artifacts.js'
import type { DialoguePhase } from '../phases.js'
import type { OrchestratorState } from '../orchestratorGraph.js'
import type { LLMClient } from '../../core/index.js'
import { buildExecution } from './shared.js'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 配置
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface CommitNodeConfig {
  llm: LLMClient
  sseCallback?: OrchestratorSSECallback
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 产出概览组装
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildDoneArtifacts(artifacts: ArtifactStore): DoneArtifactsOverview {
  const pagesModified: string[] = []
  const collectionsModified: string[] = []
  const functionsModified: string[] = []

  if (artifacts.frontend) {
    for (const page of artifacts.frontend.pages) {
      pagesModified.push(page.pageId)
    }
  }

  if (artifacts.backend) {
    for (const col of artifacts.backend.collections) {
      collectionsModified.push(col.name)
    }
    for (const cf of artifacts.backend.cloudFunctions) {
      functionsModified.push(cf.name)
    }
  }

  return { pagesModified, collectionsModified, functionsModified }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 工厂函数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function createCommitNode(config: CommitNodeConfig) {
  return (state: OrchestratorState): Partial<OrchestratorState> => {
    const startedAt = Date.now()

    // 推送 phase_change: committing
    config.sseCallback?.({
      type: 'phase_change',
      from: state.phase,
      to: 'committing',
      timestamp: Date.now(),
    })

    // 组装产出概览
    const commitArtifacts = buildDoneArtifacts(state.artifacts)

    return {
      phase: 'committing' as DialoguePhase,
      commitArtifacts,
      executions: [buildExecution('frontend', startedAt, 'completed')],
    }
  }
}
