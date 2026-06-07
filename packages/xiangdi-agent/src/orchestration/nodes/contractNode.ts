/**
 * Contract SubAgent 节点
 *
 * ADR-041: 全栈架构师角色，定义前后端契约（数据表 + 云函数签名 + 事件绑定映射）。
 *
 * 模式：规划型（单次 LLM 调用 → 结构化输出）
 * 输入：userMessage + artifacts.requirements + artifacts.uiDesign
 * 输出：IntegrationContract（collections + cloudFunctions + bindings）
 * 上游依赖：requirements, uiDesign
 */
import type { LLMClient } from '../../core/index.js'
import type { DialoguePhase } from '../phases.js'
import type { OrchestratorState } from '../orchestratorGraph.js'
import type { OrchestratorSSECallback } from '../events.js'
import { IntegrationContractSchema } from '../schemas.js'
import { callSubAgentLLM, parseWithRetry, buildExecution, emitProgress } from './shared.js'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 配置
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ContractNodeConfig {
  llm: LLMClient
  sseCallback?: OrchestratorSSECallback
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// System Prompt
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CONTRACT_SYSTEM_PROMPT = `你是一位全栈架构师，正在为低代码应用设计前后端集成契约。

你将收到需求文档（StructuredRequirements）和 UI 设计（UIDesignSpec），需要产出：
1. 数据表结构定义（collections）
2. 云函数签名（cloudFunctions）
3. 前后端绑定映射（bindings）— 描述 UI 事件如何触发后端函数

输出 JSON 格式：
{
  "collections": [
    {
      "name": "collectionName",
      "displayName": "中文名",
      "description": "用途",
      "fields": [
        {
          "name": "fieldName",
          "displayName": "字段中文名",
          "type": "string|number|boolean|date|enum|ref|array|object",
          "required": true,
          "defaultValue": null,
          "refCollection": null,
          "enumValues": null
        }
      ]
    }
  ],
  "cloudFunctions": [
    {
      "functionId": "UUID（请生成真实 UUID v4）",
      "name": "functionName",
      "displayName": "中文名",
      "description": "功能描述",
      "input": [{ "name": "paramName", "type": "string", "required": true, "description": "说明" }],
      "output": [{ "name": "resultField", "type": "object", "required": true, "description": "说明" }],
      "sideEffects": [{ "collection": "collectionName", "operation": "create|read|update|delete" }]
    }
  ],
  "bindings": [
    {
      "id": "bind-xxx",
      "description": "用户点击提交按钮时创建订单",
      "frontend": {
        "pageId": "page-xxx",
        "componentId": "comp-xxx",
        "event": "onClick"
      },
      "backend": {
        "functionId": "对应云函数的 functionId",
        "paramMapping": [
          { "source": "表单字段 username", "target": "userName" }
        ]
      }
    }
  ]
}

规则：
1. functionId 必须是合法 UUID v4（如 "550e8400-e29b-41d4-a716-446655440000"）
2. 每个 interaction（UIDesignSpec 中的 interactions）至少对应一个 binding
3. sideEffects.collection 必须引用 collections 中定义的 name
4. bindings.frontend.pageId 和 componentId 必须引用 UIDesignSpec 中的 ID
5. bindings.backend.functionId 必须引用 cloudFunctions 中的 functionId
6. 每个集合至少有 _id（自动生成，无需声明）和 createdAt/updatedAt 时间戳字段
7. 云函数的 input/output 描述的是业务参数，不含系统参数

只返回 JSON，不要其他内容。`

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 节点工厂
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function createContractNode(config: ContractNodeConfig) {
  return async (state: OrchestratorState): Promise<Partial<OrchestratorState>> => {
    const { llm, sseCallback } = config
    const startedAt = Date.now()

    emitProgress(sseCallback, 'contract', 'planning', '正在定义前后端契约...')

    // ─── 组装 user prompt ──────────────────────────────────────────────────
    const parts: string[] = []
    parts.push(`用户原始需求:\n${state.userMessage}`)

    if (state.artifacts.requirements) {
      parts.push(`\n结构化需求文档:\n${JSON.stringify(state.artifacts.requirements, null, 2)}`)
    }

    if (state.artifacts.uiDesign) {
      parts.push(`\nUI 设计规格:\n${JSON.stringify(state.artifacts.uiDesign, null, 2)}`)
    }

    // inherit 模式：注入旧 contract
    const intent = state.intentResult
    if (intent?.contextStrategy === 'inherit' && state.artifacts.contract) {
      parts.push(`\n已有契约（请在此基础上修改/补充）:\n${JSON.stringify(state.artifacts.contract, null, 2)}`)
    }

    if (intent?.correctionHint) {
      parts.push(`\n修正要求:\n${intent.correctionHint}`)
    }

    const userPrompt = parts.join('\n')

    // ─── LLM 调用 ─────────────────────────────────────────────────────────
    try {
      const rawText = await callSubAgentLLM({
        llm,
        systemPrompt: CONTRACT_SYSTEM_PROMPT,
        userPrompt,
        maxTokens: 8192, // 契约内容可能较长
      })

      const result = await parseWithRetry({
        rawText,
        schema: IntegrationContractSchema,
        llm,
        systemPrompt: CONTRACT_SYSTEM_PROMPT,
        userPrompt,
      })

      if (!result.success) {
        emitProgress(sseCallback, 'contract', 'failed', `契约定义失败: ${result.error}`)
        return {
          phase: 'contract' as DialoguePhase,
          executions: [buildExecution('contract', startedAt, 'failed', result.error)],
        }
      }

      emitProgress(sseCallback, 'contract', 'completed', '前后端契约定义完成')

      return {
        phase: 'building' as DialoguePhase,
        artifacts: { ...state.artifacts, contract: result.data },
        executions: [buildExecution('contract', startedAt, 'completed')],
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      emitProgress(sseCallback, 'contract', 'failed', `LLM 调用失败: ${error}`)
      return {
        phase: 'contract' as DialoguePhase,
        executions: [buildExecution('contract', startedAt, 'failed', error)],
      }
    }
  }
}
