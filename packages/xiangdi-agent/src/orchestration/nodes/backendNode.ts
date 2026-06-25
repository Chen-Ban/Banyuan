/**
 * Backend Worker SubAgent 节点
 *
 * ADR-041: 后端工程师角色，多轮 think↔tools 产出 CollectionSchema + 服务端 FlowSchema。
 *
 * 模式：执行型（多轮 Agentic Loop，LangGraph SubGraph）
 * 输入：userMessage + artifacts.contract + artifacts.requirements（直接注入 system prompt）
 * 输出：BackendArtifacts（collections + cloudFunctions）
 * 上游依赖：contract, requirements
 *
 * 工具白名单（6 个）：
 *   knowledge_search, read_schema, read_cloud_functions, write_schema, write_cloud_function, delete_cloud_function
 *
 * 关键约束：
 *   - write_cloud_function 是纯写入工具（Worker 在 think 阶段生成 FlowSchema，工具不调 LLM）
 *   - write_schema 是全量替换（避免 Agent 状态跟踪负担）
 *   - functionId 必须与 IntegrationContract.cloudFunctions[].functionId 一致
 */
import type { LLMClient } from '../../core/index.js'
import type { OrchestratorSSECallback } from '../events.js'
import type { OrchestratorState } from '../orchestratorGraph.js'
import type { BackendArtifacts } from '../schemas.js'
import type { BackendToolHandlers } from './workerTools.js'
import { createBackendToolRegistry } from './workerTools.js'
import { createWorkerGraph, extractFinalText } from './workerGraph.js'
import { buildExecution, emitProgress } from './shared.js'
import type { Message } from '../../core/types.js'
import { ContextProvider, BACKEND_DECLARATION } from '../context/index.js'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 配置
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface BackendNodeConfig {
  llm: LLMClient
  sseCallback?: OrchestratorSSECallback
  /** 后端工具处理器（由 xiangdi-server 注入） */
  toolHandlers?: BackendToolHandlers
  /** LLM 模型标识 */
  model?: string
  /** 最大循环次数 */
  maxIterations?: number
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// System Prompt 构建
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// (role prompt is now defined in BACKEND_DECLARATION in context/declarations.ts)

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 节点工厂
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 创建 backend worker 节点
 *
 * 内部启动 Worker SubGraph（think↔tools LangGraph 循环），
 * 完成后从最终 messages 中提取 BackendArtifacts。
 */
export function createBackendNode(config: BackendNodeConfig) {
  return async (state: OrchestratorState): Promise<Partial<OrchestratorState>> => {
    const { llm, sseCallback, toolHandlers, model, maxIterations } = config
    const startedAt = Date.now()

    emitProgress(sseCallback, 'backend', 'executing', '后端 Worker 开始构建数据模型和云函数...')

    // ─── 从 ArtifactStore 提取上游产物 ────────────────────────────────────────
    const requirements = state.artifacts.requirements
    const contract = state.artifacts.contract

    if (!requirements || !contract) {
      emitProgress(sseCallback, 'backend', 'failed', '缺少上游产物（requirements 或 contract）')
      return {
        artifacts: { ...state.artifacts },
        executions: [buildExecution('backend', startedAt, 'failed', '缺少上游产物')],
      }
    }

    // ─── 通过 ContextProvider 按需拉取上下文，组装 system prompt ──────────────
    const ctx = ContextProvider.resolve(BACKEND_DECLARATION, state)
    const systemPrompt = ctx.systemPrompt

    // ─── 注册工具 ─────────────────────────────────────────────────────────────
    const toolRegistry = toolHandlers
      ? createBackendToolRegistry(toolHandlers)
      : createBackendToolRegistry(createPlaceholderBackendHandlers())

    // ─── 构建初始 user message ────────────────────────────────────────────────
    const userPrompt = buildBackendUserPrompt(state.userMessage, contract)
    const initialMessages: Message[] = [{ role: 'user', content: userPrompt }]

    // ─── 启动 Worker SubGraph ─────────────────────────────────────────────────
    const workerGraph = createWorkerGraph({
      llm,
      toolRegistry,
      systemPrompt,
      agentName: 'backend',
      sseCallback,
      maxIterations: maxIterations ?? 15,
      model: model ?? 'deepseek-chat',
      maxTokens: 8192,
      temperature: 0.3,
    })

    try {
      const result = await workerGraph.invoke({ messages: initialMessages })

      // ─── 从最终对话中提取 BackendArtifacts ────────────────────────────────────
      const finalText = extractFinalText(result.messages)
      const artifacts = parseBackendArtifacts(finalText)

      emitProgress(
        sseCallback,
        'backend',
        'completed',
        `后端构建完成：${artifacts.collections.length} 个数据表，${artifacts.cloudFunctions.length} 个云函数`,
      )

      return {
        artifacts: { ...state.artifacts, backend: artifacts },
        executions: [buildExecution('backend', startedAt, 'completed')],
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      emitProgress(sseCallback, 'backend', 'failed', `后端构建失败：${errorMsg}`)

      return {
        artifacts: { ...state.artifacts },
        executions: [buildExecution('backend', startedAt, 'failed', errorMsg)],
      }
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 辅助函数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 构建后端 Worker 的初始 user prompt
 */
function buildBackendUserPrompt(
  userMessage: string,
  contract: {
    collections: Array<{ name: string; displayName: string }>
    cloudFunctions: Array<{ functionId: string; name: string; displayName: string }>
  },
): string {
  const collectionList = contract.collections.map((c) => `- ${c.name}（${c.displayName}）`).join('\n')
  const functionList = contract.cloudFunctions
    .map((f) => `- ${f.functionId}: ${f.name}（${f.displayName}）`)
    .join('\n')

  return `## 用户需求

${userMessage}

## 待构建数据表

${collectionList || '（无）'}

## 待构建云函数

${functionList || '（无）'}

请按照需求规格和契约进行构建：
1. 使用 read_schema 查看现有数据模型（如果是增量场景）
2. 根据需要使用 knowledge_search 查询 FlowSchema 节点类型规范
3. 使用 write_schema 写入完整的数据表定义（全量替换）
4. 为每个云函数在 think 阶段生成完整的 FlowSchema，然后使用 write_cloud_function 逐个写入

所有数据表和云函数完成后，输出最终的 BackendArtifacts JSON 摘要。`
}

/**
 * 从 Worker 最终输出中解析 BackendArtifacts
 */
function parseBackendArtifacts(text: string): BackendArtifacts {
  // 尝试从文本中提取 JSON
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : text.trim()

  try {
    let toParse = jsonStr
    if (!toParse.startsWith('{') && !toParse.startsWith('[')) {
      const start = toParse.search(/[{[]/)
      if (start >= 0) toParse = toParse.slice(start)
    }

    const parsed = JSON.parse(toParse) as Partial<BackendArtifacts>

    return {
      collections: (parsed.collections ?? []).map((c) => ({
        name: c.name ?? 'unknown',
        fields: c.fields ?? [],
        indexes: c.indexes,
      })),
      cloudFunctions: (parsed.cloudFunctions ?? []).map((f) => ({
        functionId: f.functionId ?? '',
        name: f.name ?? 'unknown',
        displayName: f.displayName ?? '',
        description: f.description ?? '',
        flowSchema: f.flowSchema ?? { nodes: [], edges: [] },
      })),
    }
  } catch {
    // JSON 解析失败，返回空壳（审计节点会检测到并触发回退）
  }

  return { collections: [], cloudFunctions: [] }
}

/**
 * Placeholder 工具处理器（开发阶段使用，后续由 xiangdi-server 注入真实实现）
 */
function createPlaceholderBackendHandlers(): BackendToolHandlers {
  return {
    knowledgeSearch: async ({ query }) => {
      return `[placeholder] knowledge_search("${query}"): 暂无实现，请在 xiangdi-server 中注入真实的 knowledge-server 客户端。`
    },
    readSchema: async () => {
      return `[placeholder] read_schema(): 暂无实现，返回空数据模型。`
    },
    readCloudFunctions: async ({ functionId }) => {
      return functionId
        ? `[placeholder] read_cloud_functions("${functionId}"): 暂无实现。`
        : `[placeholder] read_cloud_functions(): 暂无实现，返回空云函数列表。`
    },
    writeSchema: async ({ collections }) => {
      return JSON.stringify({ success: true, collectionsCount: collections.length })
    },
    writeCloudFunction: async ({ functionId, name }) => {
      return JSON.stringify({ success: true, functionId, name })
    },
    deleteCloudFunction: async ({ functionId }) => {
      return `[placeholder] delete_cloud_function("${functionId}"): 已模拟删除成功。`
    },
  }
}
