/**
 * 相地 · TaskPlannerAgent（任务规划师）
 *
 * 将三份规格翻译为可执行的 ChangeSpec 原子操作序列。
 * 模式：think↔tools 循环
 */

import type { LLMClient } from '../../core/llmTypes.js';
import type { StreamCallback } from '../../core/types.js';
import type { ToolRegistry } from '../../core/ToolRegistry.js';
import type { ChangeSpec } from '../../spec/types.js';
import { ChangeSpecSchema } from '../../spec/planningTypes.js';
import { runSubAgent, type SubAgentConfig, type SubAgentRunResult } from './factory.js';
import type { TaskPlannerInput } from './state.js';

const TASK_PLANNER_SYSTEM_PROMPT = `你是任务规划师角色。你将产品需求、技术方案和视觉规格翻译为可执行的原子操作序列。

## 关注维度
- 将三份规格翻译为 ChangeSpec 格式的任务列表
- 操作之间的依赖关系（先创建容器再添加子元素）
- 操作的幂等性（避免重复创建）
- 任务粒度（每个任务对应一次明确操作）

## 不关心
- 为什么要做这个功能、视觉设计的理由

## 可用工具
- get_pages：获取完整应用状态（当前页面数据）
- get_page_tree：获取页面结构树
- validate_change_spec：预检验 ChangeSpec 的合法性

## 输出格式

分析完成后，严格输出 ChangeSpec JSON（用 \`\`\`json ... \`\`\` 包裹）：

\`\`\`json
{
  "id": "change-xxx",
  "title": "变更标题",
  "proposal": {
    "why": "为什么做",
    "what": "做什么",
    "outOfScope": "不做什么",
    "successCriteria": ["成功标准"]
  },
  "specs": ["Given...When...Then..."],
  "tasks": [
    { "id": "task-1", "description": "任务描述", "done": false, "dependsOn": [] }
  ],
  "status": "draft",
  "createdAt": 0,
  "updatedAt": 0
}
\`\`\`

注意：createdAt 和 updatedAt 设为 0，由系统填充实际时间戳。`;

export interface TaskPlannerAgentConfig {
  llmClient: LLMClient;
  toolRegistry: ToolRegistry;
  streamCallback?: StreamCallback;
  model?: string;
}

export async function runTaskPlannerAgent(
  config: TaskPlannerAgentConfig,
  input: TaskPlannerInput,
  agentMemory: string,
  signal?: AbortSignal,
): Promise<SubAgentRunResult<ChangeSpec>> {
  const subConfig: SubAgentConfig<TaskPlannerInput, ChangeSpec> = {
    llmClient: config.llmClient,
    toolRegistry: config.toolRegistry,
    llmConfig: {
      model: config.model ?? 'deepseek-chat',
      temperature: 0.2,
      maxTokens: 12288,
      maxIterations: 5,
    },
    streamCallback: config.streamCallback,
    outputValidator: ChangeSpecSchema,
    maxValidationRetries: 2,
    roleName: 'TaskPlannerAgent',
  };

  return runSubAgent(subConfig, input, TASK_PLANNER_SYSTEM_PROMPT, agentMemory, '', signal);
}
