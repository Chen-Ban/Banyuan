/**
 * 相地 · ArchAgent（架构师）
 *
 * 基于 FeatureList 设计 BanvasGL 技术实现方案。
 * 模式：think↔tools 循环（可查询知识库）
 */

import type { LLMClient } from '../../core/llmTypes.js';
import type { StreamCallback } from '../../core/types.js';
import type { ToolRegistry } from '../../core/ToolRegistry.js';
import { TechPlanSchema, type TechPlan } from '../../spec/planningTypes.js';
import { runSubAgent, type SubAgentConfig, type SubAgentRunResult } from './factory.js';
import type { ArchAgentInput } from './state.js';

const ARCH_SYSTEM_PROMPT = `你是架构师角色。你基于 BanvasGL 引擎的能力设计技术实现方案。

## 关注维度
- 哪些 View 需要新增/修改/删除
- 数据结构变化（Collection、字段）
- 实现路径（用哪些 BanvasGL 能力组合）
- 技术约束（ADR 禁止项）

## 不关心
- 用户原话、视觉风格、像素值
- 操作序列、执行策略

## 可用工具
- knowledge_search：查询 BanvasGL 文档和 API 约束
- get_adr_constraints：获取相关 ADR 禁止项
- get_existing_schema：获取当前应用的数据模型

使用工具获取信息后，综合分析并输出技术方案。

## 输出格式

分析完成后，严格输出以下 JSON 格式（用 \`\`\`json ... \`\`\` 包裹）：

\`\`\`json
{
  "viewChanges": [
    {
      "action": "create | modify | delete",
      "viewType": "视图类型",
      "viewId": "已有视图ID（modify/delete时）",
      "description": "变更说明",
      "parentId": "父容器ID",
      "properties": {}
    }
  ],
  "schemaChanges": [
    {
      "action": "create_collection | add_field | modify_field | delete_field",
      "collectionName": "集合名",
      "fieldName": "字段名",
      "fieldType": "字段类型",
      "description": "变更说明"
    }
  ],
  "constraints": ["技术约束说明"]
}
\`\`\``;

export interface ArchAgentConfig {
  llmClient: LLMClient;
  toolRegistry: ToolRegistry;
  streamCallback?: StreamCallback;
  model?: string;
}

export async function runArchAgent(
  config: ArchAgentConfig,
  input: ArchAgentInput,
  agentMemory: string,
  signal?: AbortSignal,
): Promise<SubAgentRunResult<TechPlan>> {
  const subConfig: SubAgentConfig<ArchAgentInput, TechPlan> = {
    llmClient: config.llmClient,
    toolRegistry: config.toolRegistry,
    llmConfig: {
      model: config.model ?? 'deepseek-chat',
      temperature: 0.4,
      maxTokens: 8192,
      maxIterations: 5,
    },
    streamCallback: config.streamCallback,
    outputValidator: TechPlanSchema,
    maxValidationRetries: 2,
    roleName: 'ArchAgent',
  };

  return runSubAgent(subConfig, input, ARCH_SYSTEM_PROMPT, agentMemory, '', signal);
}
