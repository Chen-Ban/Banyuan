/**
 * UI Design SubAgent 节点
 *
 * ADR-041: 视觉设计师角色，根据需求规划页面结构、组件组合、导航关系。
 *
 * 模式：规划型（单次 LLM 调用 → 结构化输出）
 * 输入：userMessage + artifacts.requirements
 * 输出：UIDesignSpec（pages + navigation + designTokens）
 * 上游依赖：requirements
 */
import type { LLMClient } from '../../core/index.js'
import type { DialoguePhase } from '../phases.js'
import type { OrchestratorState } from '../orchestratorGraph.js'
import type { OrchestratorSSECallback } from '../events.js'
import { UIDesignSpecSchema } from '../schemas.js'
import { callSubAgentLLM, parseWithRetry, buildExecution, emitProgress } from './shared.js'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 配置
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface UIDesignNodeConfig {
  llm: LLMClient
  sseCallback?: OrchestratorSSECallback
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// System Prompt
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const UI_DESIGN_SYSTEM_PROMPT = `你是一位资深 UI 设计师，正在为低代码应用设计界面结构。

你将收到结构化的需求文档（StructuredRequirements），需要规划：
1. 页面列表及每个页面的组件组合
2. 页面间的导航关系
3. 可选的设计 token 覆盖

输出 JSON 格式：
{
  "pages": [
    {
      "id": "page-xxx",
      "name": "页面名称",
      "layout": "布局描述（自然语言，如'顶部标题栏 + 中间表单区 + 底部按钮'）",
      "components": [
        {
          "id": "comp-xxx",
          "type": "BanvasGL ViewType（TEXTVIEW/GRAPHVIEW/IMAGEVIEW/COMBINEDVIEW 等）",
          "description": "组件功能描述",
          "dataBinding": "绑定的数据字段（可选）"
        }
      ],
      "interactions": [
        {
          "trigger": "触发条件",
          "action": "执行动作",
          "targetComponent": "组件 ID"
        }
      ]
    }
  ],
  "navigation": [
    {
      "from": "页面ID",
      "to": "页面ID",
      "trigger": "导航触发条件"
    }
  ],
  "designTokens": {
    "primaryColor": "#1677ff",
    "backgroundColor": "#ffffff",
    "fontFamily": "system-ui",
    "borderRadius": 8
  }
}

规则：
1. pages 至少 1 个，id 格式为 "page-" + 短标识
2. 组件 id 格式为 "comp-" + 页面短标识 + "-" + 组件短标识
3. type 必须是 BanvasGL 支持的 ViewType：TEXTVIEW, GRAPHVIEW, IMAGEVIEW, VIDEOVIEW, COMBINEDVIEW
4. 容器/布局用 COMBINEDVIEW，文本/标签用 TEXTVIEW，图标/装饰用 GRAPHVIEW，图片用 IMAGEVIEW
5. 每个 must 级别的功能至少对应一个页面或页面内的一组交互
6. navigation 描述用户操作触发的页面跳转（如"点击列表项 → 详情页"）
7. designTokens 如果用户没有特殊要求，可以省略（使用默认主题）

只返回 JSON，不要其他内容。`

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 节点工厂
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function createUIDesignNode(config: UIDesignNodeConfig) {
  return async (state: OrchestratorState): Promise<Partial<OrchestratorState>> => {
    const { llm, sseCallback } = config
    const startedAt = Date.now()

    emitProgress(sseCallback, 'uiDesign', 'planning', '正在规划 UI 结构...')

    // ─── 组装 user prompt ──────────────────────────────────────────────────
    const parts: string[] = []
    parts.push(`用户原始需求:\n${state.userMessage}`)

    if (state.artifacts.requirements) {
      parts.push(`\n结构化需求文档:\n${JSON.stringify(state.artifacts.requirements, null, 2)}`)
    }

    // inherit 模式：注入旧 uiDesign
    const intent = state.intentResult
    if (intent?.contextStrategy === 'inherit' && state.artifacts.uiDesign) {
      parts.push(`\n已有 UI 设计（请在此基础上修改/补充）:\n${JSON.stringify(state.artifacts.uiDesign, null, 2)}`)
    }

    if (intent?.correctionHint) {
      parts.push(`\n修正要求:\n${intent.correctionHint}`)
    }

    const userPrompt = parts.join('\n')

    // ─── LLM 调用 ─────────────────────────────────────────────────────────
    try {
      const rawText = await callSubAgentLLM({
        llm,
        systemPrompt: UI_DESIGN_SYSTEM_PROMPT,
        userPrompt,
      })

      const result = await parseWithRetry({
        rawText,
        schema: UIDesignSpecSchema,
        llm,
        systemPrompt: UI_DESIGN_SYSTEM_PROMPT,
        userPrompt,
      })

      if (!result.success) {
        emitProgress(sseCallback, 'uiDesign', 'failed', `UI 设计失败: ${result.error}`)
        return {
          phase: 'ui_design' as DialoguePhase,
          executions: [buildExecution('uiDesign', startedAt, 'failed', result.error)],
        }
      }

      emitProgress(sseCallback, 'uiDesign', 'completed', 'UI 结构设计完成')

      return {
        phase: 'contract' as DialoguePhase,
        artifacts: { ...state.artifacts, uiDesign: result.data },
        executions: [buildExecution('uiDesign', startedAt, 'completed')],
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      emitProgress(sseCallback, 'uiDesign', 'failed', `LLM 调用失败: ${error}`)
      return {
        phase: 'ui_design' as DialoguePhase,
        executions: [buildExecution('uiDesign', startedAt, 'failed', error)],
      }
    }
  }
}
