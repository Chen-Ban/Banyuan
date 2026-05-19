/**
 * 相地 · 编排主 Agent
 *
 * 如同园林的「造园主人」—— 总揽全局，指挥匠人。
 * OrchestratorAgent 是并行生成管线的顶层驱动器。
 *
 * 完整流程：
 * 1. LayoutPlanner 拆解需求 → SubAgentTask[]
 * 2. SubAgentRunner 并行生成 → SubAgentResult[]
 * 3. Orchestrator 制定 AssemblyPlan（使用 LLM 分析端口→决定绑定和连线）
 * 4. Assembler 组装 → AIPage
 * 5. AuditorAgent 审计 → AuditResult（可选自动修复）
 * 6. 输出最终 OrchestrationResult
 *
 * 设计决策：
 * - OrchestratorAgent 自身也使用 LLM 来制定组装计划
 * - 组装计划包括：坐标分配、数据绑定、事件连线
 * - 审计失败可自动触发修复循环
 */

import type { LLMClient } from "../core/AgentLoop.js";
import type { Message } from "../core/types.js";
import { LayoutPlanner } from "./LayoutPlanner.js";
import type { LayoutPlannerInput } from "./LayoutPlanner.js";
import { SubAgentRunner } from "./SubAgentRunner.js";
import type { ProgressCallback } from "./SubAgentRunner.js";
import { Assembler, AssemblyError } from "./Assembler.js";
import { AuditorAgent } from "./AuditorAgent.js";
import type {
  OrchestrationConfig,
  OrchestrationResult,
  OrchestrationProgressEvent,
  SubAgentResult,
  SubAgentTask,
  AssemblyPlan,
  ContainerPlacement,
  DataBinding,
  EventWiring,
} from "./types.js";

// ─── OrchestratorAgent ──────────────────────────────────────────────────────

const ASSEMBLY_PLAN_SYSTEM_PROMPT = `你是一个页面布局组装专家。给定多个容器的生成结果（包含节点、端口声明、数据使用声明），你需要制定一个组装计划。

组装计划包括：
1. **定位**：为每个容器分配全局坐标位置（页面左上角为原点）
2. **数据绑定**：将不同容器的数据端口连接起来（out → in）
3. **事件连线**：将不同容器的事件端口连接起来（emit → listen）

规则：
- 容器通常自上而下排列，参考每个容器的 role 和 size
- 数据绑定必须匹配方向（out 端口 → in 端口）和类型
- 事件连线必须匹配方向（emit → listen）
- 尽量不留空白间隙（容器紧密排列）
- zIndex 默认按顺序递增，除非有覆盖关系（如 modal）

输出格式（严格 JSON）：
{
  "placements": [
    { "taskId": "task_header_0", "position": { "x": 0, "y": 0 }, "size": { "width": 375, "height": 64 }, "zIndex": 0 }
  ],
  "dataBindings": [
    { "id": "binding_1", "source": { "taskId": "task_list_1", "portId": "selectedItem" }, "target": { "taskId": "task_detail_2", "portId": "item" } }
  ],
  "eventWirings": [
    { "id": "wiring_1", "emitter": { "taskId": "task_header_0", "eventId": "searchSubmit" }, "listener": { "taskId": "task_list_1", "eventId": "onFilter" } }
  ]
}`;

export class OrchestratorAgent {
  private readonly config: OrchestrationConfig;
  private readonly layoutPlanner: LayoutPlanner;
  private readonly subAgentRunner: SubAgentRunner;
  private readonly assembler: Assembler;
  private readonly auditor: AuditorAgent;

  constructor(config?: Partial<OrchestrationConfig>) {
    this.config = { ...DEFAULT_ORCHESTRATION_CONFIG_VALUES, ...config };
    this.layoutPlanner = new LayoutPlanner(this.config);
    this.subAgentRunner = new SubAgentRunner(this.config);
    this.assembler = new Assembler();
    this.auditor = new AuditorAgent(this.config);
  }

  /**
   * 执行完整的页面编排生成
   *
   * @param client LLM 客户端
   * @param input 页面描述和尺寸
   * @param onProgress 进度回调（可选）
   * @returns 编排结果
   */
  async orchestrate(
    client: LLMClient,
    input: LayoutPlannerInput,
    onProgress?: ProgressCallback
  ): Promise<OrchestrationResult> {
    const startTime = Date.now();

    try {
      // ── 阶段 1：布局规划 ────────────────────────────────────────────────────
      onProgress?.({
        phase: "planning",
        totalTasks: 0,
        completedTasks: 0,
        detail: "正在分析页面结构...",
        timestamp: Date.now(),
      });

      const planResult = await this.layoutPlanner.plan(client, input);
      const tasks = planResult.tasks;

      // ── 阶段 2：SubAgent 并行生成 ──────────────────────────────────────────
      onProgress?.({
        phase: "generating",
        totalTasks: tasks.length,
        completedTasks: 0,
        detail: `开始并行生成 ${tasks.length} 个容器...`,
        timestamp: Date.now(),
      });

      const subAgentResults = await this.subAgentRunner.runAll(
        client,
        tasks,
        onProgress
      );

      // 检查是否有失败的 SubAgent
      const successResults = subAgentResults.filter(
        (r) => r.status !== "failed"
      );
      if (successResults.length === 0) {
        return {
          success: false,
          subAgentResults,
          durationMs: Date.now() - startTime,
          error: "所有 SubAgent 均生成失败",
        };
      }

      // ── 阶段 3：制定组装计划 ───────────────────────────────────────────────
      onProgress?.({
        phase: "assembling",
        totalTasks: tasks.length,
        completedTasks: tasks.length,
        detail: "正在制定组装计划...",
        timestamp: Date.now(),
      });

      const assemblyPlan = await this.createAssemblyPlan(
        client,
        input,
        tasks,
        subAgentResults
      );

      // ── 阶段 4：执行组装 ──────────────────────────────────────────────────
      let assembledPage = this.assembler.assemble(assemblyPlan, subAgentResults);

      // ── 阶段 5：审计（可选）────────────────────────────────────────────────
      let auditResult = undefined;

      if (this.config.enableAudit) {
        onProgress?.({
          phase: "auditing",
          totalTasks: tasks.length,
          completedTasks: tasks.length,
          detail: "正在审计页面...",
          timestamp: Date.now(),
        });

        let fixRound = 0;
        let currentPage = assembledPage;

        while (fixRound <= this.config.maxFixRounds) {
          auditResult = await this.auditor.audit(client, {
            assembledPage: currentPage,
            assemblyPlan,
            subAgentResults,
          });

          if (auditResult.passed) break;

          // 尝试自动修复
          if (auditResult.fixedPage && fixRound < this.config.maxFixRounds) {
            onProgress?.({
              phase: "fixing",
              totalTasks: tasks.length,
              completedTasks: tasks.length,
              detail: `自动修复第 ${fixRound + 1} 轮...`,
              timestamp: Date.now(),
            });
            currentPage = auditResult.fixedPage;
            fixRound++;
          } else {
            break;
          }
        }

        assembledPage = currentPage;
      }

      // ── 完成 ──────────────────────────────────────────────────────────────
      onProgress?.({
        phase: "completed",
        totalTasks: tasks.length,
        completedTasks: tasks.length,
        detail: "页面生成完成",
        timestamp: Date.now(),
      });

      return {
        success: true,
        page: assembledPage,
        assemblyPlan,
        auditResult,
        subAgentResults,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      onProgress?.({
        phase: "failed",
        totalTasks: 0,
        completedTasks: 0,
        detail: message,
        timestamp: Date.now(),
      });

      return {
        success: false,
        subAgentResults: [],
        durationMs: Date.now() - startTime,
        error: message,
      };
    }
  }

  /**
   * 使用 LLM 制定组装计划
   *
   * 分析所有 SubAgent 的端口声明和数据使用情况，
   * 决定容器定位、数据绑定和事件连线。
   */
  private async createAssemblyPlan(
    client: LLMClient,
    input: LayoutPlannerInput,
    tasks: SubAgentTask[],
    results: SubAgentResult[]
  ): Promise<AssemblyPlan> {
    // 构建给 LLM 的上下文
    const containersSummary = tasks.map((task, index) => {
      const result = results[index];
      return {
        taskId: task.taskId,
        role: task.role,
        description: task.description,
        size: task.size,
        status: result.status,
        nodeCount: result.nodes.length,
        ports: result.ports,
        dataUsage: result.dataUsage,
      };
    });

    const userPrompt = `页面尺寸：${input.pageSize.width}×${input.pageSize.height}px
页面描述：${input.pageDescription}

以下是各容器的生成结果摘要：

${JSON.stringify(containersSummary, null, 2)}

请为这些容器制定组装计划：分配全局位置、建立数据绑定和事件连线。`;

    const model = this.config.subAgentLLM?.model ?? "deepseek-chat";

    const response = await client.createMessage({
      model,
      max_tokens: 4096,
      system: ASSEMBLY_PLAN_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }] as Message[],
      temperature: 0.2,
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("[OrchestratorAgent] LLM 未返回组装计划");
    }

    return this.parseAssemblyPlan(textBlock.text, input, tasks);
  }

  /**
   * 解析 LLM 返回的组装计划 JSON
   */
  private parseAssemblyPlan(
    text: string,
    input: LayoutPlannerInput,
    tasks: SubAgentTask[]
  ): AssemblyPlan {
    const jsonMatch =
      text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/);

    if (!jsonMatch) {
      // LLM 未能返回有效 JSON，使用简单的自上而下排列兜底
      return this.fallbackAssemblyPlan(input, tasks);
    }

    try {
      const raw = JSON.parse(jsonMatch[1]) as {
        placements: ContainerPlacement[];
        dataBindings: DataBinding[];
        eventWirings: EventWiring[];
      };

      return {
        page: {
          id: `page_${Date.now()}`,
          name: "生成页面",
          width: input.pageSize.width,
          height: input.pageSize.height,
          backgroundColor: "#ffffff",
        },
        placements: raw.placements ?? [],
        dataBindings: raw.dataBindings ?? [],
        eventWirings: raw.eventWirings ?? [],
      };
    } catch {
      return this.fallbackAssemblyPlan(input, tasks);
    }
  }

  /**
   * 兜底组装计划：简单自上而下排列，无绑定
   */
  private fallbackAssemblyPlan(
    input: LayoutPlannerInput,
    tasks: SubAgentTask[]
  ): AssemblyPlan {
    let currentY = 0;
    const placements: ContainerPlacement[] = tasks.map((task, index) => {
      const placement: ContainerPlacement = {
        taskId: task.taskId,
        position: { x: 0, y: currentY },
        size: task.size,
        zIndex: index,
      };
      currentY += task.size.height;
      return placement;
    });

    return {
      page: {
        id: `page_${Date.now()}`,
        name: "生成页面",
        width: input.pageSize.width,
        height: input.pageSize.height,
        backgroundColor: "#ffffff",
      },
      placements,
      dataBindings: [],
      eventWirings: [],
    };
  }
}

// ─── 默认配置值 ──────────────────────────────────────────────────────────────

const DEFAULT_ORCHESTRATION_CONFIG_VALUES: OrchestrationConfig = {
  maxConcurrency: 4,
  subAgentTimeout: 60_000,
  enableAudit: true,
  autoFix: true,
  maxFixRounds: 2,
};
