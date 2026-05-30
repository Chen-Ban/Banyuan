/**
 * 相地 · VisualAgent（视觉设计师）
 *
 * 产出布局结构、设计规范和组件选型。
 * 模式：think↔tools 循环（轻量，通常 1-2 次工具调用）
 */

import type { LLMClient } from '../../core/llmTypes.js';
import type { StreamCallback } from '../../core/types.js';
import type { ToolRegistry } from '../../core/ToolRegistry.js';
import { VisualSpecSchema, type VisualSpec } from '../../spec/planningTypes.js';
import { runSubAgent, type SubAgentConfig, type SubAgentRunResult } from './factory.js';
import type { VisualAgentInput } from './state.js';

const VISUAL_SYSTEM_PROMPT = `你是视觉设计师角色。你负责产出布局结构、设计规范和组件选型。

## 关注维度
- 布局结构（页面如何组织）
- 视觉层级（主次关系、信息密度）
- 组件选型（用哪些 BanvasGL 内置物料）
- 设计规范（颜色、间距、圆角、字体）
- 与已有页面的风格一致性

## 不关心
- 技术实现细节、数据结构
- 操作序列、工具调用协议

## 可用工具
- get_page_tree：获取当前页面结构树（了解已有布局）
- get_design_tokens：获取应用已有的设计 token

## 输出格式

分析完成后，严格输出以下 JSON（用 \`\`\`json ... \`\`\` 包裹）：

\`\`\`json
{
  "pages": [
    {
      "sceneId": "已有场景ID（修改时）",
      "name": "页面名称",
      "layoutDescription": "布局描述",
      "hierarchy": "视觉层次说明",
      "informationDensity": "low | medium | high"
    }
  ],
  "designTokens": {
    "colors": { "primary": "#1976D2", "background": "#FFFFFF" },
    "spacing": { "xs": 4, "sm": 8, "md": 16, "lg": 24, "xl": 32 },
    "borderRadius": { "sm": 4, "md": 8, "lg": 16 },
    "typography": {
      "h1": { "fontSize": 24, "fontWeight": 700, "lineHeight": 1.4 },
      "body": { "fontSize": 14, "fontWeight": 400, "lineHeight": 1.6 }
    }
  },
  "componentChoices": [
    { "featureId": "feature-1", "componentType": "CombinedView", "reason": "选择原因" }
  ]
}
\`\`\``;

export interface VisualAgentConfig {
  llmClient: LLMClient;
  toolRegistry: ToolRegistry;
  streamCallback?: StreamCallback;
  model?: string;
}

export async function runVisualAgent(
  config: VisualAgentConfig,
  input: VisualAgentInput,
  agentMemory: string,
  signal?: AbortSignal,
): Promise<SubAgentRunResult<VisualSpec>> {
  const subConfig: SubAgentConfig<VisualAgentInput, VisualSpec> = {
    llmClient: config.llmClient,
    toolRegistry: config.toolRegistry,
    llmConfig: {
      model: config.model ?? 'deepseek-chat',
      temperature: 0.6,
      maxTokens: 6144,
      maxIterations: 3,
    },
    streamCallback: config.streamCallback,
    outputValidator: VisualSpecSchema,
    maxValidationRetries: 2,
    roleName: 'VisualAgent',
  };

  return runSubAgent(subConfig, input, VISUAL_SYSTEM_PROMPT, agentMemory, '', signal);
}
