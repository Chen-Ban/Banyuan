/**
 * 相地 · SpecPlanner
 *
 * 用一次专门的 LLM 调用，将用户的自然语言输入转化为结构化的 ChangeSpec。
 * 这是"理解 → 对齐"链路的自动化实现。
 *
 * 与 AgentLoop 的区别：
 *   - SpecPlanner：单次调用，无工具，只输出 JSON，职责是"规划"
 *   - AgentLoop：多轮循环，带工具，职责是"执行"
 *
 * 典型流程：
 *   用户输入
 *     → SpecPlanner.plan()        [一次 LLM 调用]
 *     → ChangeSpec (draft)
 *     → HumanGate 用户确认/修改
 *     → ChangeSpec (approved)
 *     → HarnessRunner.run()
 *     → AgentLoop 执行
 */

import type { LLMClient } from "../core/AgentLoop.js";
import type { ProjectSpec } from "./types.js";
import { ChangeSpecBuilder } from "./ChangeSpecBuilder.js";
import type { ChangeSpec } from "./types.js";

// ─── SpecPlanner 配置 ─────────────────────────────────────────────────────────

export interface SpecPlannerConfig {
  /**
   * 用于规划的 LLM 客户端（与执行阶段可以是同一个，也可以不同）
   */
  client: LLMClient;
  /**
   * 规划用的模型，建议使用推理能力强的模型
   * 默认与执行阶段相同，但可以单独指定（如用更强的模型做规划）
   */
  model: string;
  /**
   * 规划阶段的最大 token 数，规划输出通常较短
   * 默认 2048
   */
  maxTokens?: number;
}

// ─── 规划结果 ─────────────────────────────────────────────────────────────────

export interface PlanResult {
  /** 生成的 ChangeSpec，status 为 "draft" */
  spec: ChangeSpec;
  /** LLM 原始输出（用于调试） */
  rawOutput: string;
  /** 是否成功解析为结构化 Spec（false 时 spec 为 fromText 的降级结果） */
  parsed: boolean;
}

// ─── SpecPlanner ──────────────────────────────────────────────────────────────

export class SpecPlanner {
  constructor(private readonly config: SpecPlannerConfig) {}

  /**
   * 将用户输入规划为 ChangeSpec
   *
   * @param userInput 用户的自然语言描述
   * @param projectSpec 可选的项目级规范，注入后 LLM 能感知项目约束
   * @param signal 可选的 AbortSignal
   */
  async plan(
    userInput: string,
    projectSpec?: ProjectSpec | null,
    signal?: AbortSignal
  ): Promise<PlanResult> {
    const systemPrompt = buildPlannerSystemPrompt(projectSpec);

    let rawOutput = "";

    try {
      const response = await this.config.client.createMessage({
        model: this.config.model,
        max_tokens: this.config.maxTokens ?? 2048,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: buildPlannerUserPrompt(userInput),
          },
        ],
        // 规划阶段不传工具，强制 LLM 只输出文本 JSON
        tools: undefined,
        // 低温度，让输出更确定
        temperature: 0.2,
      });

      // 提取文本输出
      for (const block of response.content) {
        if (block.type === "text") {
          rawOutput += block.text;
        }
      }

      // 尝试解析 JSON
      const parsed = extractAndParseJSON(rawOutput);
      if (parsed) {
        const proposal =
          parsed.proposal != null && typeof parsed.proposal === "object"
            ? (parsed.proposal as Record<string, unknown>)
            : {};

        const spec = ChangeSpecBuilder.fromStructured({
          id: typeof parsed.id === "string" ? parsed.id : `plan-${Date.now()}`,
          title:
            typeof parsed.title === "string"
              ? parsed.title
              : userInput.slice(0, 80),
          proposal: {
            why:
              typeof proposal.why === "string"
                ? proposal.why
                : "用户发起的变更请求",
            what:
              typeof proposal.what === "string" ? proposal.what : userInput,
            outOfScope:
              typeof proposal.outOfScope === "string"
                ? proposal.outOfScope
                : undefined,
            successCriteria: Array.isArray(proposal.successCriteria)
              ? (proposal.successCriteria as string[])
              : undefined,
          },
          specs: Array.isArray(parsed.specs) ? (parsed.specs as string[]) : [],
          tasks: normalizeTasks(parsed.tasks),
          status: "draft",
        });

        return { spec, rawOutput, parsed: true };
      }
    } catch (err) {
      // LLM 调用失败，降级为 fromText
      rawOutput = err instanceof Error ? err.message : String(err);
    }

    // 降级：LLM 输出无法解析时，退回到 fromText
    return {
      spec: ChangeSpecBuilder.fromText(userInput),
      rawOutput,
      parsed: false,
    };
  }
}

// ─── Prompt 构建 ──────────────────────────────────────────────────────────────

/**
 * 规划阶段的 system prompt
 * 要求 LLM 只输出 JSON，不做任何执行
 */
function buildPlannerSystemPrompt(projectSpec?: ProjectSpec | null): string {
  const base = `你是一个需求分析助手，负责将用户的自然语言描述转化为结构化的变更计划（ChangeSpec）。

你的输出必须是一个合法的 JSON 对象，格式如下：

\`\`\`json
{
  "id": "slug-style-id",
  "title": "简短的变更标题（不超过 80 字）",
  "proposal": {
    "why": "为什么要做这个变更（用户的目的和动机）",
    "what": "具体要做什么（功能描述）",
    "outOfScope": "明确不包含的内容（可选）",
    "successCriteria": ["验收标准1", "验收标准2"]
  },
  "specs": [
    "Given 用户在登录页 When 点击登录按钮 Then 跳转到首页",
    "..."
  ],
  "tasks": [
    { "description": "创建登录页面，尺寸 375×812px" },
    { "description": "添加用户名输入框，位于页面中部" },
    { "description": "添加密码输入框，位于用户名输入框下方" },
    { "description": "添加登录按钮，蓝色背景，全宽" }
  ]
}
\`\`\`

规则：
- id 使用 kebab-case，如 "add-login-page"
- tasks 按执行顺序排列，从页面/容器到具体组件
- specs 使用 Given/When/Then 格式描述行为契约
- 只输出 JSON，不要有任何解释文字
- 不要执行任何操作，只做规划`;

  if (!projectSpec) return base;

  const constraints: string[] = [];

  if (projectSpec.conventions.length > 0) {
    constraints.push(`\n## 项目规范约束\n${projectSpec.conventions.map((c) => `- ${c}`).join("\n")}`);
  }
  if (projectSpec.prohibitions.length > 0) {
    constraints.push(`\n## 禁止事项\n${projectSpec.prohibitions.map((p) => `- ${p}`).join("\n")}`);
  }

  return constraints.length > 0 ? base + "\n" + constraints.join("\n") : base;
}

/**
 * 规划阶段的 user prompt
 */
function buildPlannerUserPrompt(userInput: string): string {
  return `请将以下需求转化为 ChangeSpec JSON：\n\n${userInput}`;
}

// ─── JSON 提取与解析 ──────────────────────────────────────────────────────────

/**
 * 从 LLM 输出中提取并解析 JSON
 * 兼容 LLM 在 JSON 前后添加 markdown 代码块的情况
 */
function extractAndParseJSON(text: string): Record<string, unknown> | null {
  // 尝试直接解析
  try {
    return JSON.parse(text.trim()) as Record<string, unknown>;
  } catch {
    // 继续尝试提取
  }

  // 提取 ```json ... ``` 代码块
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim()) as Record<string, unknown>;
    } catch {
      // 继续
    }
  }

  // 提取第一个 { ... } 块
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0]) as Record<string, unknown>;
    } catch {
      // 无法解析
    }
  }

  return null;
}

/**
 * 将 LLM 返回的 tasks 数组规范化为 ChangeTask 格式
 */
function normalizeTasks(
  raw: unknown
): Array<{ id: string; description: string; done: boolean }> {
  if (!Array.isArray(raw)) return [];

  let counter = 0;
  return raw
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      id: typeof item.id === "string" ? item.id : `task-${++counter}`,
      description: typeof item.description === "string" ? item.description : String(item),
      done: false,
    }));
}
