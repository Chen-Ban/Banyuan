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

const VISUAL_SYSTEM_PROMPT = `你是视觉设计师角色。你负责产出页面布局描述和设计规范（Design Tokens）。

## 职责聚焦（ADR-035）
- 布局描述：每页的空间组织方式、视觉层次、信息密度
- 设计规范：颜色体系、间距体系、圆角规范、字体排版
- 风格一致性：与应用已有页面保持视觉统一

## 不在你的职责范围
- viewType / 组件类型选型 → 由 ArchAgent 负责
- 数据结构、操作序列 → 由 ArchAgent / TaskPlanner 负责
- 具体视图属性（宽高、position） → 由执行阶段确定

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
      "layoutDescription": "布局描述：空间如何划分、各区域的视觉职责",
      "hierarchy": "视觉层次：什么最突出、什么是辅助信息",
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
    { "featureId": "feature-1", "componentType": "说明此 feature 在视觉上扮演的角色（如 card-container / data-list / action-bar）", "reason": "布局层面选择此角色的原因" }
  ]
}
\`\`\`

注意：componentChoices.componentType 字段在此处表达的是「视觉角色」而非具体 BanvasGL ViewType。
具体 ViewType（CombinedView/FlexView 等）由 ArchAgent 在技术层面确定。`;

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
