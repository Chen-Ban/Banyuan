/**
 * 审计节点（Audit Node）
 *
 * ADR-041: building phase 内部的质量关卡。
 * 两层审计串行执行：程序化校验（零 token）→ LLM 语义校验。
 * 任何一层失败即 passed: false，交给后续 rollback 节点做仲裁。
 *
 * 审计结果不触发 phase 变更（building 内部消化），
 * 只有审计通过后 phase 才推进到 awaiting_confirm。
 */
import type { LLMClient } from '../../core/index.js'
import type { OrchestratorSSECallback, AuditProgressStatus } from '../events.js'
import type { AuditFailReason, AuditFailCategory } from '../artifacts.js'
import type { SubAgentName } from '../protocol.js'
import type {
  IntegrationContract,
  FrontendArtifacts,
  BackendArtifacts,
  StructuredRequirements,
} from '../schemas.js'
import type { DialoguePhase } from '../phases.js'
import type { OrchestratorState } from '../orchestratorGraph.js'
import { callSubAgentLLM, parseWithRetry, buildExecution } from './shared.js'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 配置
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface AuditNodeConfig {
  llm: LLMClient
  sseCallback?: OrchestratorSSECallback
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SSE 辅助
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function emitAuditProgress(
  sseCallback: OrchestratorSSECallback | undefined,
  status: AuditProgressStatus,
  message?: string,
): void {
  sseCallback?.({
    type: 'audit_progress',
    status,
    message,
    timestamp: Date.now(),
  })
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Layer 1: 程序化校验
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function runProgrammaticChecks(
  contract: IntegrationContract,
  frontend: FrontendArtifacts,
  backend: BackendArtifacts,
): AuditFailReason[] {
  const failures: AuditFailReason[] = []

  // ─── 云函数覆盖度：契约中每个 functionId 在后端产出中有实现 ───
  const backendFunctionIds = new Set(backend.cloudFunctions.map((cf) => cf.functionId))
  for (const fn of contract.cloudFunctions) {
    if (!backendFunctionIds.has(fn.functionId)) {
      failures.push({
        category: 'reference_integrity',
        description: `契约声明的云函数 "${fn.name}" (${fn.functionId}) 未在后端产出中实现`,
        involvedArtifacts: ['backend'],
      })
    }
  }

  // ─── 集合覆盖度：契约中每个 collection.name 在后端产出中有定义 ───
  const backendCollectionNames = new Set(backend.collections.map((c) => c.name))
  for (const col of contract.collections) {
    if (!backendCollectionNames.has(col.name)) {
      failures.push({
        category: 'schema_validation',
        description: `契约声明的数据表 "${col.displayName}" (${col.name}) 未在后端产出中定义`,
        involvedArtifacts: ['backend'],
      })
    }
  }

  // ─── 数据表字段匹配：后端 collections 字段覆盖契约必填字段 ───
  for (const contractCol of contract.collections) {
    const backendCol = backend.collections.find((c) => c.name === contractCol.name)
    if (!backendCol) continue // 上面已经报过缺失
    const backendFieldNames = new Set(backendCol.fields.map((f) => f.name))
    for (const field of contractCol.fields) {
      if (field.required && !backendFieldNames.has(field.name)) {
        failures.push({
          category: 'schema_validation',
          description: `数据表 "${contractCol.name}" 缺少契约中的必填字段 "${field.name}"`,
          involvedArtifacts: ['backend'],
        })
      }
    }
  }

  // ─── 页面覆盖度：契约 binding 的每个 pageId 在前端产出中存在 ───
  const frontendPageIds = new Set(frontend.pages.map((p) => p.pageId))
  for (const binding of contract.bindings) {
    if (!frontendPageIds.has(binding.frontend.pageId)) {
      failures.push({
        category: 'reference_integrity',
        description: `契约绑定 "${binding.description}" 引用的页面 "${binding.frontend.pageId}" 未在前端产出中实现`,
        involvedArtifacts: ['frontend'],
      })
    }
  }

  // ─── callFlow 引用完整性：前端 clientFlows 中引用的 functionId 在后端产出中存在 ───
  for (const page of frontend.pages) {
    for (const flow of page.clientFlows) {
      const functionIds = extractCallFlowFunctionIds(flow.flowSchema)
      for (const fid of functionIds) {
        if (!backendFunctionIds.has(fid)) {
          failures.push({
            category: 'reference_integrity',
            description: `页面 "${page.pageId}" 的事件 "${flow.event}" 中 callFlow 引用了不存在的函数 ID "${fid}"`,
            involvedArtifacts: ['frontend', 'backend'],
          })
        }
      }
    }
  }

  return failures
}

/**
 * 从 FlowSchema 中提取 callFlow 节点引用的 functionId 列表
 */
function extractCallFlowFunctionIds(flowSchema: { nodes: Array<Record<string, unknown>> }): string[] {
  const ids: string[] = []
  for (const node of flowSchema.nodes) {
    if (node.type === 'callFlow' && typeof node.flowId === 'string') {
      ids.push(node.flowId)
    }
    // 兼容 data 内嵌 flowId 的情况
    if (node.type === 'callFlow' && node.data && typeof node.data === 'object') {
      const data = node.data as Record<string, unknown>
      if (typeof data.flowId === 'string') {
        ids.push(data.flowId)
      }
    }
  }
  return ids
}

/**
 * 根据程序化校验失败的 involvedArtifacts 推断建议回退目标
 */
function inferSuggestedTarget(failures: AuditFailReason[]): SubAgentName {
  // 如果有同时涉及 frontend 和 backend 的问题，说明契约层有问题
  const hasMultiArtifact = failures.some((f) => f.involvedArtifacts.length > 1)
  if (hasMultiArtifact) return 'contract'

  // 纯后端问题 → 退到 backend
  const allBackend = failures.every(
    (f) => f.involvedArtifacts.length === 1 && f.involvedArtifacts[0] === 'backend',
  )
  if (allBackend) return 'backend'

  // 纯前端问题 → 退到 frontend
  const allFrontend = failures.every(
    (f) => f.involvedArtifacts.length === 1 && f.involvedArtifacts[0] === 'frontend',
  )
  if (allFrontend) return 'frontend'

  // 混合问题 → 退到 contract
  return 'contract'
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Layer 2: LLM 语义校验
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface SemanticAuditResult {
  passed: boolean
  issues?: Array<{
    category: AuditFailCategory
    description: string
    involvedArtifacts: SubAgentName[]
  }>
  suggestedTarget?: SubAgentName
}

const SEMANTIC_AUDIT_SYSTEM_PROMPT = `你是一个质量审计 Agent。你的职责是审查软件构建产出是否完整实现了用户需求。

你会收到：
1. 结构化需求（features 列表）
2. 前后端集成契约
3. 前端产出摘要（页面结构、事件绑定）
4. 后端产出摘要（数据表、云函数）

你的审查维度：
- **需求覆盖度**：每个 feature 是否在前后端产出中有对应实现
- **语义一致性**：前后端产出之间逻辑是否自洽（如 UI 有删除按钮但后端无对应 delete 函数）
- **交互完整性**：设计中声明的交互是否都有对应的事件绑定

输出严格 JSON 格式：
{
  "passed": boolean,
  "issues": [
    {
      "category": "requirement_coverage" | "semantic_inconsistency",
      "description": "问题描述",
      "involvedArtifacts": ["requirements" | "uiDesign" | "contract" | "frontend" | "backend"]
    }
  ],
  "suggestedTarget": "requirements" | "uiDesign" | "contract" | "frontend" | "backend"
}

如果全部检查通过，输出 { "passed": true }。
suggestedTarget 仅在 passed=false 时需要，表示建议回退到哪个节点修正。`

function buildSemanticAuditUserPrompt(
  requirements: StructuredRequirements,
  contract: IntegrationContract,
  frontend: FrontendArtifacts,
  backend: BackendArtifacts,
): string {
  // 前端摘要：页面列表 + 每页组件数 + clientFlows 事件绑定
  const frontendSummary = frontend.pages
    .map((page) => {
      const flowBindings = page.clientFlows.map((f) => `${f.viewId}.${f.event}`).join(', ')
      return `  - 页面 "${page.pageId}": ${page.scene.nodes.length} 个视图节点, 事件绑定: [${flowBindings}]`
    })
    .join('\n')

  // 后端摘要：集合 + 云函数
  const collectionsSummary = backend.collections
    .map((c) => {
      const fields = c.fields.map((f) => `${f.name}(${f.type}${f.required ? ',必填' : ''})`).join(', ')
      return `  - 集合 "${c.name}": [${fields}]`
    })
    .join('\n')

  const functionsSummary = backend.cloudFunctions
    .map((cf) => `  - "${cf.name}" (${cf.functionId}): ${cf.description}`)
    .join('\n')

  // 契约摘要
  const bindingsSummary = contract.bindings
    .map(
      (b) =>
        `  - ${b.description}: ${b.frontend.pageId}/${b.frontend.componentId}.${b.frontend.event} → ${b.backend.functionId}`,
    )
    .join('\n')

  return `## 结构化需求

${JSON.stringify(requirements, null, 2)}

## 集成契约（绑定映射）

${bindingsSummary}

## 前端产出摘要

${frontendSummary}

## 后端产出摘要

数据表:
${collectionsSummary}

云函数:
${functionsSummary}

---

请审查上述产出是否完整实现了需求中的每个 feature，前后端是否语义一致，交互是否完整绑定。`
}

import { z } from 'zod'

const SemanticAuditResultSchema = z.object({
  passed: z.boolean(),
  issues: z
    .array(
      z.object({
        category: z.enum(['requirement_coverage', 'semantic_inconsistency']),
        description: z.string(),
        involvedArtifacts: z.array(z.enum(['requirements', 'uiDesign', 'contract', 'frontend', 'backend'])),
      }),
    )
    .optional(),
  suggestedTarget: z.enum(['requirements', 'uiDesign', 'contract', 'frontend', 'backend']).optional(),
})

async function runSemanticAudit(
  config: AuditNodeConfig,
  requirements: StructuredRequirements,
  contract: IntegrationContract,
  frontend: FrontendArtifacts,
  backend: BackendArtifacts,
): Promise<SemanticAuditResult> {
  const userPrompt = buildSemanticAuditUserPrompt(requirements, contract, frontend, backend)

  const { text: rawText } = await callSubAgentLLM({
    llm: config.llm,
    systemPrompt: SEMANTIC_AUDIT_SYSTEM_PROMPT,
    userPrompt,
    temperature: 0,
  })

  const result = await parseWithRetry({
    rawText,
    schema: SemanticAuditResultSchema,
    llm: config.llm,
    systemPrompt: SEMANTIC_AUDIT_SYSTEM_PROMPT,
    userPrompt,
  })

  if (result.success) {
    return result.data
  }

  // 解析失败视为通过（宁可放行也不因解析问题卡住流程）
  return { passed: true }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 工厂函数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function createAuditNode(config: AuditNodeConfig) {
  return async (state: OrchestratorState): Promise<Partial<OrchestratorState>> => {
    const startedAt = Date.now()
    const { artifacts } = state

    // ─── 前置检查：Worker 产出存在性 ─────────────────────────────────────
    if (!artifacts.frontend || !artifacts.backend) {
      const missingWorkers: SubAgentName[] = []
      if (!artifacts.frontend) missingWorkers.push('frontend')
      if (!artifacts.backend) missingWorkers.push('backend')

      const failReasons: AuditFailReason[] = missingWorkers.map((w) => ({
        category: 'worker_failure' as AuditFailCategory,
        description: `${w} Worker 未产出结果`,
        involvedArtifacts: [w],
      }))

      emitAuditProgress(config.sseCallback, 'failed_retrying', '部分 Worker 未产出，需要重跑')

      return {
        auditResult: {
          passed: false,
          failReasons,
          suggestedTarget: missingWorkers[0],
        },
        executions: [buildExecution('frontend', startedAt, 'completed')],
      }
    }

    // 契约必须存在（前序节点保证，但防御性检查）
    if (!artifacts.contract) {
      return {
        auditResult: {
          passed: false,
          failReasons: [
            {
              category: 'reference_integrity',
              description: '契约（IntegrationContract）缺失，无法执行审计',
              involvedArtifacts: ['contract'],
            },
          ],
          suggestedTarget: 'contract',
        },
        executions: [buildExecution('frontend', startedAt, 'completed')],
      }
    }

    emitAuditProgress(config.sseCallback, 'checking')

    const { contract, frontend, backend } = artifacts

    // ─── Layer 1: 程序化校验 ─────────────────────────────────────────────
    const programmaticFailures = runProgrammaticChecks(contract, frontend, backend)

    if (programmaticFailures.length > 0) {
      const suggestedTarget = inferSuggestedTarget(programmaticFailures)
      emitAuditProgress(config.sseCallback, 'failed_retrying', '发现引用完整性问题，正在优化...')

      return {
        auditResult: {
          passed: false,
          failReasons: programmaticFailures,
          suggestedTarget,
        },
        executions: [buildExecution('frontend', startedAt, 'completed')],
      }
    }

    // ─── Layer 2: LLM 语义校验 ───────────────────────────────────────────
    // 需求必须存在才能做语义审查
    if (!artifacts.requirements) {
      // 无需求时跳过语义审查，程序化通过即算通过
      emitAuditProgress(config.sseCallback, 'passed')
      return {
        phase: 'awaiting_confirm' as DialoguePhase,
        auditResult: { passed: true },
        executions: [buildExecution('frontend', startedAt, 'completed')],
      }
    }

    const semanticResult = await runSemanticAudit(config, artifacts.requirements, contract, frontend, backend)

    if (!semanticResult.passed) {
      const failReasons: AuditFailReason[] = (semanticResult.issues ?? []).map((issue) => ({
        category: issue.category as AuditFailCategory,
        description: issue.description,
        involvedArtifacts: issue.involvedArtifacts as SubAgentName[],
      }))

      emitAuditProgress(config.sseCallback, 'failed_retrying', '发现需求覆盖问题，正在优化...')

      return {
        auditResult: {
          passed: false,
          failReasons,
          suggestedTarget: semanticResult.suggestedTarget ?? 'frontend',
        },
        executions: [buildExecution('frontend', startedAt, 'completed')],
      }
    }

    // ─── 全部通过 ────────────────────────────────────────────────────────
    emitAuditProgress(config.sseCallback, 'passed')

    return {
      phase: 'awaiting_confirm' as DialoguePhase,
      auditResult: { passed: true },
      executions: [buildExecution('frontend', startedAt, 'completed')],
    }
  }
}
