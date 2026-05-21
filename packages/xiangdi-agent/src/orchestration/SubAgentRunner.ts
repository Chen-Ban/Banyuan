/**
 * 相地 · SubAgent 并行执行器
 *
 * 如同园林中各工匠分区同时施工，
 * SubAgentRunner 管理多个子 Agent 的并行执行，
 * 每个子 Agent 在隔离的上下文中生成一个容器。
 *
 * 职责：
 * 1. 为每个 SubAgentTask 创建独立的 AgentLoop 实例
 * 2. 控制并发度，限制同时运行的 SubAgent 数量
 * 3. 处理超时和错误，汇总所有结果
 *
 * 设计决策：
 * - 每个 SubAgent 使用独立的 ContextManager（无消息共享）
 * - 每个 SubAgent 配备精简的 ToolRegistry（只含容器生成相关工具）
 * - 通过 AbortController 实现超时控制
 */

import { AgentLoop } from "../core/AgentLoop.js";
import type { LLMClient } from "../core/AgentLoop.js";
import { ToolRegistry } from "../core/ToolRegistry.js";
import { ContextManager } from "../core/ContextManager.js";
import type { ToolDefinition } from "../core/types.js";
import type {
  SubAgentTask,
  SubAgentResult,
  ContainerPorts,
  FlowFragment,
  DataUsageDeclaration,
  OrchestrationConfig,
  OrchestrationProgressEvent,
} from "./types.js";
import type { AINode } from "../schema/AISchema.js";

// ─── SubAgent 工具协议 ──────────────────────────────────────────────────────

/**
 * SubAgent 专用工具：提交容器生成结果
 *
 * SubAgent 在完成容器生成后调用此工具提交结果。
 * 这是 SubAgent 唯一的「输出」工具。
 */
const SUBMIT_CONTAINER_TOOL: ToolDefinition = {
  name: "submit_container",
  description: `提交容器生成结果。在你完成容器的所有节点设计后调用此工具。

你必须提供：
- nodes: 容器内的所有 AINode 节点（本地坐标系，左上角为 0,0）
- ports: 容器对外暴露的数据端口和事件端口
- flowFragments: 容器内部的流程逻辑片段
- dataUsage: 数据使用声明（哪些节点使用了哪些端口的数据）`,
  input_schema: {
    type: "object",
    properties: {
      nodes: {
        type: "object",
        properties: {},
        description: "AINode[] - 容器内节点列表（JSON 数组）",
      },
      ports: {
        type: "object",
        properties: {
          data: { type: "object", properties: {} },
          events: { type: "object", properties: {} },
        },
        description: "ContainerPorts - 数据端口和事件端口",
      },
      flowFragments: {
        type: "object",
        properties: {},
        description: "FlowFragment[] - 内部流程片段（JSON 数组）",
      },
      dataUsage: {
        type: "object",
        properties: {},
        description: "DataUsageDeclaration[] - 数据使用声明（JSON 数组）",
      },
    },
    required: ["nodes", "ports"],
  },
};

// ─── SubAgent 系统提示词 ─────────────────────────────────────────────────────

function buildSubAgentSystemPrompt(task: SubAgentTask): string {
  return `你是一个 UI 容器生成专家。你的任务是为页面中的一个独立区域生成完整的 UI 节点结构。

## 当前容器信息

- 角色：${task.role}
- 描述：${task.description}
- 尺寸：${task.size.width}×${task.size.height}px
- 所属页面：${task.context.pageDescription}
- 页面尺寸：${task.context.pageSize.width}×${task.context.pageSize.height}px

## 坐标系规则

所有节点使用**本地坐标系**，即容器左上角为 (0, 0)。
主 Agent 会负责将你的输出转换到页面全局坐标系。

## 节点类型

你可以使用以下节点类型：
- rect: 矩形（背景、卡片、按钮等）
- text: 文本节点
- image: 图片节点
- group: 分组容器
- cubic_bezier: 三次贝塞尔曲线
- quadratic_bezier: 二次贝塞尔曲线

## 端口声明规则

1. **数据端口（Data Ports）**：声明容器需要的外部数据（in）和对外暴露的数据（out）
   - 例如列表容器需要 "items" 数据（in），搜索框暴露 "searchText"（out）
2. **事件端口（Event Ports）**：声明容器触发的事件（emit）和监听的事件（listen）
   - 例如按钮触发 "click" 事件（emit），表单监听 "reset" 事件（listen）

## 数据使用声明

对于每个使用了数据端口的节点，声明绑定关系：
- portId: 引用的端口 ID
- nodeId: 使用数据的节点 ID
- binding: 绑定方式（text_content | visibility | style | src | items | custom）
- expression: 描述如何使用数据

## 输出要求

设计完成后，调用 \`submit_container\` 工具提交结果。
${task.constraints ? `\n## 设计约束\n${JSON.stringify(task.constraints, null, 2)}` : ""}
${task.context.neighbors?.length ? `\n## 相邻容器\n${task.context.neighbors.map((n) => `- ${n.direction}: [${n.role}] ${n.description}`).join("\n")}` : ""}
${task.context.dataModel ? `\n## 数据模型\n${JSON.stringify(task.context.dataModel, null, 2)}` : ""}`;
}

// ─── SubAgentRunner ─────────────────────────────────────────────────────────

/**
 * 进度回调
 */
export type ProgressCallback = (event: OrchestrationProgressEvent) => void;

export class SubAgentRunner {
  private readonly config: OrchestrationConfig;

  constructor(config: OrchestrationConfig) {
    this.config = config;
  }

  /**
   * 并行执行多个 SubAgent 任务
   *
   * @param client LLM 客户端（所有 SubAgent 共享同一个客户端实例）
   * @param tasks SubAgent 任务列表
   * @param onProgress 进度回调
   * @returns 所有 SubAgent 的结果
   */
  async runAll(
    client: LLMClient,
    tasks: SubAgentTask[],
    onProgress?: ProgressCallback
  ): Promise<SubAgentResult[]> {
    const results: SubAgentResult[] = [];
    let completedCount = 0;

    // 使用信号量控制并发
    const semaphore = new Semaphore(this.config.maxConcurrency);

    const taskPromises = tasks.map(async (task) => {
      await semaphore.acquire();
      try {
        const result = await this.runSingle(client, task);
        results.push(result);
        completedCount++;
        onProgress?.({
          phase: "generating",
          totalTasks: tasks.length,
          completedTasks: completedCount,
          detail: `容器 [${task.role}] 生成${result.status === "success" ? "完成" : "失败"}`,
          timestamp: Date.now(),
        });
      } finally {
        semaphore.release();
      }
    });

    await Promise.all(taskPromises);

    // 按原始 task 顺序排列结果
    const orderedResults = tasks.map(
      (task) => results.find((r) => r.taskId === task.taskId)!
    );

    return orderedResults;
  }

  /**
   * 执行单个 SubAgent 任务
   */
  private async runSingle(
    client: LLMClient,
    task: SubAgentTask
  ): Promise<SubAgentResult> {
    // 创建隔离的上下文
    const context = new ContextManager({ maxMessages: 20 });
    const registry = new ToolRegistry();

    // 用于收集 SubAgent 提交的结果
    let submittedResult: SubmittedContainerData | null = null;

    // 注册 submit_container 工具
    registry.register(SUBMIT_CONTAINER_TOOL, async (input: Record<string, unknown>) => {
      submittedResult = input as unknown as SubmittedContainerData;
      return { success: true, message: "容器结果已提交" };
    });

    // 创建独立的 AgentLoop
    const agentLoop = new AgentLoop(
      {
        llm: {
          model: this.config.subAgentLLM?.model ?? "deepseek-chat",
          maxTokens: this.config.subAgentLLM?.maxTokens ?? 8192,
          temperature: this.config.subAgentLLM?.temperature ?? 0.7,
        },
        maxIterations: 5,
        systemPrompt: buildSubAgentSystemPrompt(task),
      },
      registry,
      context
    );

    // 超时控制
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.config.subAgentTimeout);

    try {
      // 运行 SubAgent
      const userMessage = `请为「${task.description}」区域生成完整的 UI 容器。尺寸为 ${task.size.width}×${task.size.height}px。完成后调用 submit_container 提交结果。`;

      await agentLoop.run(client, userMessage, controller.signal);

      // 检查是否有提交结果
      if (!submittedResult) {
        return {
          taskId: task.taskId,
          status: "failed",
          nodes: [],
          ports: { data: [], events: [] },
          flowFragments: [],
          dataUsage: [],
          error: "SubAgent 未调用 submit_container 提交结果",
        };
      }

      // 解析提交的结果
      return this.parseSubmittedResult(task.taskId, submittedResult);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        taskId: task.taskId,
        status: "failed",
        nodes: [],
        ports: { data: [], events: [] },
        flowFragments: [],
        dataUsage: [],
        error: message.includes("aborted")
          ? `SubAgent 执行超时（${this.config.subAgentTimeout}ms）`
          : message,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * 解析 SubAgent 提交的原始数据
   */
  private parseSubmittedResult(
    taskId: string,
    raw: SubmittedContainerData
  ): SubAgentResult {
    try {
      const nodes = (Array.isArray(raw.nodes) ? raw.nodes : []) as AINode[];
      const ports = (raw.ports ?? { data: [], events: [] }) as ContainerPorts;
      const flowFragments = (Array.isArray(raw.flowFragments)
        ? raw.flowFragments
        : []) as FlowFragment[];
      const dataUsage = (Array.isArray(raw.dataUsage)
        ? raw.dataUsage
        : []) as DataUsageDeclaration[];

      return {
        taskId,
        status: nodes.length > 0 ? "success" : "partial",
        nodes,
        ports,
        flowFragments,
        dataUsage,
      };
    } catch {
      return {
        taskId,
        status: "partial",
        nodes: [],
        ports: { data: [], events: [] },
        flowFragments: [],
        dataUsage: [],
        diagnostics: ["提交数据解析异常，使用空结果"],
      };
    }
  }
}

// ─── 辅助类型 ────────────────────────────────────────────────────────────────

interface SubmittedContainerData {
  nodes: unknown;
  ports: unknown;
  flowFragments?: unknown;
  dataUsage?: unknown;
}

// ─── 简易信号量（并发控制）────────────────────────────────────────────────────

class Semaphore {
  private current = 0;
  private readonly max: number;
  private queue: Array<() => void> = [];

  constructor(max: number) {
    this.max = max;
  }

  async acquire(): Promise<void> {
    if (this.current < this.max) {
      this.current++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    this.current--;
    const next = this.queue.shift();
    if (next) {
      this.current++;
      next();
    }
  }
}
