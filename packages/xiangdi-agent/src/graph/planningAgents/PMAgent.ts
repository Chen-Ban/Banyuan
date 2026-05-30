/**
 * 相地 · PMAgent（产品经理）
 *
 * 将用户模糊诉求翻译为结构化 FeatureList。
 * 模式：纯 LLM 单次调用（无工具）
 */

import type { LLMClient } from '../../core/llmTypes.js';
import type { StreamCallback } from '../../core/types.js';
import { ToolRegistry } from '../../core/ToolRegistry.js';
import { FeatureListSchema, type FeatureList } from '../../spec/planningTypes.js';
import { runSubAgent, type SubAgentConfig, type SubAgentRunResult } from './factory.js';
import type { PMAgentInput } from './state.js';

const PM_SYSTEM_PROMPT = `你是产品经理角色。你的职责是将用户的自然语言诉求翻译为结构化的功能需求列表。

## 关注维度
- 用户意图是什么（功能目标，不是实现方式）
- 与已有功能的承接关系
- 功能边界（明确要做什么，不做什么）
- 用户体验流程

## 不关心
- BanvasGL API、数据结构、技术可行性
- 具体的像素值、颜色代码
- 操作序列、工具调用

## 输出格式

严格输出以下 JSON 格式（用 \`\`\`json ... \`\`\` 包裹）：

\`\`\`json
{
  "features": [
    {
      "id": "feature-1",
      "title": "功能标题",
      "description": "功能描述",
      "userStory": "作为...，我希望...，以便...",
      "acceptanceCriteria": ["验收标准1", "验收标准2"],
      "priority": "must | should | could",
      "relatedExistingFeatures": ["已有相关功能"]
    }
  ],
  "outOfScope": ["明确不做的事情"],
  "dependencies": [
    { "featureId": "feature-2", "dependsOn": "feature-1", "reason": "依赖原因" }
  ]
}
\`\`\``;

export interface PMAgentConfig {
  llmClient: LLMClient;
  streamCallback?: StreamCallback;
  model?: string;
}

export async function runPMAgent(
  config: PMAgentConfig,
  input: PMAgentInput,
  agentMemory: string,
  signal?: AbortSignal,
): Promise<SubAgentRunResult<FeatureList>> {
  const subConfig: SubAgentConfig<PMAgentInput, FeatureList> = {
    llmClient: config.llmClient,
    toolRegistry: new ToolRegistry(),
    llmConfig: {
      model: config.model ?? 'deepseek-chat',
      temperature: 0.3,
      maxTokens: 4096,
      maxIterations: 1,
    },
    streamCallback: config.streamCallback,
    outputValidator: FeatureListSchema,
    maxValidationRetries: 2,
    roleName: 'PMAgent',
  };

  return runSubAgent(subConfig, input, PM_SYSTEM_PROMPT, agentMemory, input.conversationContext, signal);
}
