/**
 * 相地 · 布局规划器
 *
 * 如同园林营造中「叠山理水」先定大势，再分区域，
 * LayoutPlanner 将用户的页面需求拆解为多个独立容器任务，
 * 每个容器由一个 SubAgent 独立生成。
 *
 * 职责：
 * 1. 解析用户描述 → 识别页面中的逻辑区域
 * 2. 为每个区域分配尺寸（本地参考系）
 * 3. 生成 SubAgentTask[] 供并行执行
 *
 * 实现方式：
 * - 使用 LLM 进行需求理解和区域拆解
 * - 输出结构化的 SubAgentTask 列表
 */

import type { LLMClient } from "../core/AgentLoop.js";
import type {
  SubAgentTask,
  SubAgentConstraints,
  ContainerRole,
  OrchestrationConfig,
} from "./types.js";

// ─── 规划输入 ────────────────────────────────────────────────────────────────

export interface LayoutPlannerInput {
  /** 用户的页面需求描述 */
  pageDescription: string;
  /** 页面尺寸 */
  pageSize: { width: number; height: number };
  /** 全局设计约束（可选，来自 ProjectSpec） */
  globalConstraints?: SubAgentConstraints;
  /** 全局数据模型（可选） */
  dataModel?: Record<string, unknown>;
}

// ─── 规划结果 ────────────────────────────────────────────────────────────────

export interface LayoutPlannerResult {
  /** 生成的 SubAgent 任务列表 */
  tasks: SubAgentTask[];
  /** 规划说明（LLM 的推理过程） */
  reasoning: string;
}

// ─── LLM 输出的原始结构 ─────────────────────────────────────────────────────

interface RawLayoutRegion {
  role: ContainerRole;
  description: string;
  width: number;
  height: number;
  order: number;
}

// ─── LayoutPlanner ───────────────────────────────────────────────────────────

const LAYOUT_PLANNER_SYSTEM_PROMPT = `你是一个界面布局规划专家。给定一个页面的自然语言描述和目标尺寸，你需要将页面拆解为多个独立的容器区域。

规则：
1. 每个容器应该是一个逻辑独立的 UI 区域（如 header、表单、列表、底部导航等）
2. 所有容器的尺寸之和应该覆盖整个页面（允许小范围重叠或间隙）
3. 宽度通常等于页面宽度（除非是并排布局）
4. 使用以下角色标注每个容器：header, footer, list, form, detail, chart, media, sidebar, modal, custom
5. 按从上到下的视觉顺序排列

输出格式（严格 JSON）：
{
  "reasoning": "你的拆解推理过程",
  "regions": [
    {
      "role": "header",
      "description": "容器的具体内容描述",
      "width": 375,
      "height": 64,
      "order": 0
    }
  ]
}`;

export class LayoutPlanner {
  private readonly config: OrchestrationConfig;

  constructor(config: OrchestrationConfig) {
    this.config = config;
  }

  /**
   * 执行布局规划
   *
   * @param client LLM 客户端
   * @param input 规划输入
   * @returns 规划结果
   */
  async plan(
    client: LLMClient,
    input: LayoutPlannerInput
  ): Promise<LayoutPlannerResult> {
    const userPrompt = this.buildUserPrompt(input);

    const model = this.config.subAgentLLM?.model ?? "deepseek-chat";
    const maxTokens = this.config.subAgentLLM?.maxTokens ?? 4096;

    const response = await client.createMessage({
      model,
      max_tokens: maxTokens,
      system: LAYOUT_PLANNER_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      temperature: 0.3,
    });

    // 提取 LLM 文本回复
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("[LayoutPlanner] LLM 未返回文本内容");
    }

    const parsed = this.parseResponse(textBlock.text, input);
    return parsed;
  }

  /**
   * 构建用户提示词
   */
  private buildUserPrompt(input: LayoutPlannerInput): string {
    let prompt = `页面描述：${input.pageDescription}\n`;
    prompt += `页面尺寸：${input.pageSize.width}×${input.pageSize.height}px\n`;

    if (input.dataModel) {
      prompt += `\n数据模型：\n${JSON.stringify(input.dataModel, null, 2)}\n`;
    }

    if (input.globalConstraints) {
      prompt += `\n设计约束：\n${JSON.stringify(input.globalConstraints, null, 2)}\n`;
    }

    prompt += `\n请将这个页面拆解为独立的容器区域。`;
    return prompt;
  }

  /**
   * 解析 LLM 响应为结构化结果
   */
  private parseResponse(
    text: string,
    input: LayoutPlannerInput
  ): LayoutPlannerResult {
    // 尝试提取 JSON（可能被 markdown code block 包裹）
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) ??
                      text.match(/(\{[\s\S]*\})/);

    if (!jsonMatch) {
      throw new Error("[LayoutPlanner] 无法从 LLM 响应中提取 JSON");
    }

    const raw = JSON.parse(jsonMatch[1]) as {
      reasoning: string;
      regions: RawLayoutRegion[];
    };

    if (!raw.regions || !Array.isArray(raw.regions) || raw.regions.length === 0) {
      throw new Error("[LayoutPlanner] LLM 未返回有效的区域列表");
    }

    // 按 order 排序
    const sortedRegions = [...raw.regions].sort((a, b) => a.order - b.order);

    // 转换为 SubAgentTask
    const tasks: SubAgentTask[] = sortedRegions.map((region, index) => {
      const taskId = `task_${region.role}_${index}`;

      // 构建邻居信息
      const neighbors = sortedRegions
        .filter((_, i) => i !== index)
        .map((neighbor, ni) => ({
          role: neighbor.role,
          direction: (ni < index ? "above" : "below") as "above" | "below",
          description: neighbor.description,
        }));

      const task: SubAgentTask = {
        taskId,
        role: region.role,
        description: region.description,
        size: {
          width: region.width,
          height: region.height,
        },
        constraints: input.globalConstraints,
        context: {
          pageDescription: input.pageDescription,
          pageSize: input.pageSize,
          neighbors,
          dataModel: input.dataModel,
        },
      };

      return task;
    });

    return {
      tasks,
      reasoning: raw.reasoning,
    };
  }
}
