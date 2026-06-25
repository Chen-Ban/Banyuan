/**
 * Frontend Worker SubAgent 节点
 *
 * ADR-041: 前端工程师角色，多轮 think↔tools 产出 AIProjection + 客户端 FlowSchema。
 *
 * 模式：执行型（多轮 Agentic Loop，LangGraph SubGraph）
 * 输入：userMessage + artifacts.contract + artifacts.uiDesign（直接注入 system prompt）
 * 输出：FrontendArtifacts（pages[].scene + pages[].clientFlows）
 * 上游依赖：contract, uiDesign
 *
 * 工具白名单（7 个）：
 *   knowledge_search, read_pages, write_page, create_page, delete_page, material_search, material_get_detail
 *
 * 执行粒度：页面级逐一处理（Worker 在 think 阶段自行决定处理顺序）
 * 写入粒度：整页（write_page 覆盖单个 AIProjectionScene，不影响其他页面）
 */
import type { LLMClient } from '../../core/index.js'
import type { OrchestratorSSECallback } from '../events.js'
import type { OrchestratorState } from '../orchestratorGraph.js'
import type { FrontendArtifacts } from '../schemas.js'
import type { FrontendToolHandlers } from './workerTools.js'
import { createFrontendToolRegistry } from './workerTools.js'
import { createWorkerGraph, extractFinalText } from './workerGraph.js'
import { buildExecution, emitProgress } from './shared.js'
import { ContextProvider, FRONTEND_DECLARATION } from '../context/index.js'
import type { Message } from '../../core/types.js'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 配置
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface FrontendNodeConfig {
  llm: LLMClient
  sseCallback?: OrchestratorSSECallback
  /** 前端工具处理器（由 xiangdi-server 注入） */
  toolHandlers?: FrontendToolHandlers
  /** LLM 模型标识 */
  model?: string
  /** 最大循环次数 */
  maxIterations?: number
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 节点工厂
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 创建 frontend worker 节点
 *
 * 内部启动 Worker SubGraph（think↔tools LangGraph 循环），
 * 完成后从最终 messages 中提取 FrontendArtifacts。
 */
export function createFrontendNode(config: FrontendNodeConfig) {
  return async (state: OrchestratorState): Promise<Partial<OrchestratorState>> => {
    const { llm, sseCallback, toolHandlers, model, maxIterations } = config
    const startedAt = Date.now()

    emitProgress(sseCallback, 'frontend', 'executing', '前端 Worker 开始构建视图...')

    // ─── 从 ArtifactStore 提取上游产物 ────────────────────────────────────────
    const uiDesign = state.artifacts.uiDesign
    const contract = state.artifacts.contract

    if (!uiDesign || !contract) {
      emitProgress(sseCallback, 'frontend', 'failed', '缺少上游产物（uiDesign 或 contract）')
      return {
        artifacts: { ...state.artifacts },
        executions: [buildExecution('frontend', startedAt, 'failed', '缺少上游产物')],
      }
    }

    // ─── 通过 ContextProvider 按需组装 system prompt ──────────────────────────
    const ctx = ContextProvider.resolve(FRONTEND_DECLARATION, state)
    const systemPrompt = ctx.systemPrompt

    // ─── 注册工具 ─────────────────────────────────────────────────────────────
    const toolRegistry = toolHandlers
      ? createFrontendToolRegistry(toolHandlers)
      : createFrontendToolRegistry(createPlaceholderFrontendHandlers())

    // ─── 构建初始 user message ────────────────────────────────────────────────
    const userPrompt = buildFrontendUserPrompt(state.userMessage, uiDesign)
    const initialMessages: Message[] = [{ role: 'user', content: userPrompt }]

    // ─── 启动 Worker SubGraph ─────────────────────────────────────────────────
    const workerGraph = createWorkerGraph({
      llm,
      toolRegistry,
      systemPrompt,
      agentName: 'frontend',
      sseCallback,
      maxIterations: maxIterations ?? 15,
      model: model ?? 'deepseek-chat',
      maxTokens: 8192,
      temperature: 0.3,
    })

    try {
      const result = await workerGraph.invoke({ messages: initialMessages })

      // ─── 从最终对话中提取 FrontendArtifacts ───────────────────────────────────
      const finalText = extractFinalText(result.messages)
      const artifacts = parseFrontendArtifacts(finalText)

      emitProgress(sseCallback, 'frontend', 'completed', `前端构建完成：${artifacts.pages.length} 个页面`)

      return {
        artifacts: { ...state.artifacts, frontend: artifacts },
        executions: [buildExecution('frontend', startedAt, 'completed')],
        totalTokenUsage: result.lastTokenUsage ?? { inputTokens: 0, outputTokens: 0 },
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      emitProgress(sseCallback, 'frontend', 'failed', `前端构建失败：${errorMsg}`)

      return {
        artifacts: { ...state.artifacts },
        executions: [buildExecution('frontend', startedAt, 'failed', errorMsg)],
      }
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 辅助函数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 构建前端 Worker 的初始 user prompt
 */
function buildFrontendUserPrompt(
  userMessage: string,
  uiDesign: { pages: Array<{ id: string; name: string }> },
): string {
  const pageList = uiDesign.pages.map((p) => `- ${p.id}: ${p.name}`).join('\n')

  return `## 用户需求

${userMessage}

## 待构建页面

${pageList}

请按照 UI 设计规格和契约，逐个页面进行构建。对于每个页面：
1. 使用 create_page 创建页面
2. 根据需要使用 knowledge_search 查询 BanvasGL 组件知识
3. 根据需要使用 material_search / material_get_detail 了解物料规格
4. 使用 write_page 写入完整的 AIProjectionScene

所有页面完成后，输出最终的 FrontendArtifacts JSON 摘要。`
}

/**
 * 从 Worker 最终输出中解析 FrontendArtifacts
 */
function parseFrontendArtifacts(text: string): FrontendArtifacts {
  // 尝试从文本中提取 JSON
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : text.trim()

  try {
    // 尝试找到 JSON 对象
    let toParse = jsonStr
    if (!toParse.startsWith('{') && !toParse.startsWith('[')) {
      const start = toParse.search(/[{[]/)
      if (start >= 0) toParse = toParse.slice(start)
    }

    const parsed = JSON.parse(toParse) as Partial<FrontendArtifacts>
    if (parsed.pages && Array.isArray(parsed.pages)) {
      return {
        pages: parsed.pages.map((p) => ({
          pageId: p.pageId ?? 'unknown',
          scene: p.scene ?? { id: p.pageId ?? 'unknown', name: 'unknown', nodes: [] },
          clientFlows: p.clientFlows ?? [],
        })),
      }
    }
  } catch {
    // JSON 解析失败，返回空壳
  }

  // 兜底：返回空产出（审计节点会检测到并触发回退）
  return { pages: [] }
}

/**
 * Placeholder 工具处理器（开发阶段使用，后续由 xiangdi-server 注入真实实现）
 */
function createPlaceholderFrontendHandlers(): FrontendToolHandlers {
  return {
    knowledgeSearch: async ({ query }) => {
      return `[placeholder] knowledge_search("${query}"): 暂无实现，请在 xiangdi-server 中注入真实的 knowledge-server 客户端。`
    },
    readPages: async ({ pageId }) => {
      return pageId
        ? `[placeholder] read_pages("${pageId}"): 暂无实现。`
        : `[placeholder] read_pages(): 暂无实现，返回空页面列表。`
    },
    writePage: async ({ pageId }) => {
      return `[placeholder] write_page("${pageId}"): 已模拟写入成功。`
    },
    createPage: async ({ name, pageId }) => {
      const id = pageId ?? `page-${Date.now()}`
      return JSON.stringify({ success: true, pageId: id, name })
    },
    deletePage: async ({ pageId }) => {
      return `[placeholder] delete_page("${pageId}"): 已模拟删除成功。`
    },
    materialSearch: async ({ keyword }) => {
      return `[placeholder] material_search("${keyword}"): 暂无实现。`
    },
    materialGetDetail: async ({ materialId }) => {
      return `[placeholder] material_get_detail("${materialId}"): 暂无实现。`
    },
  }
}
