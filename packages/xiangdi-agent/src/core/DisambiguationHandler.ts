/**
 * 相地 · 消歧处理器
 *
 * 「造园之妙，在于取舍。」
 * 当冲突浮现，须将模糊化为具象，令用户可择一而行。
 *
 * DisambiguationHandler 接收 ConflictReport，调用 LLM 生成具象化方案，
 * 待用户确认后将选择写回 DecisionLog，使后续执行有据可依。
 */

import type { LLMClient } from "./llmTypes.js";
import type {
  ConflictReport,
  ConflictItem,
  DecisionLog,
} from "./ConflictDetector.js";

// ─── 消歧选项 ──────────────────────────────────────────────────────────────────

/** 单个可选方案 */
export interface DisambiguationOption {
  /** 方案唯一标识 */
  id: string;
  /** 方案描述（面向用户） */
  description: string;
  /** 该方案的预期效果 */
  expectedEffect: string;
}

/** 消歧方案集合 */
export interface DisambiguationOptions {
  /** 冲突背景描述 */
  conflictContext: string;
  /** 2-3 个具象化可选方案 */
  options: DisambiguationOption[];
}

// ─── 消歧处理器 ────────────────────────────────────────────────────────────────

/**
 * DisambiguationHandler —— 消歧处理器
 *
 * 职责：
 * 1. resolve(): 将 ConflictReport 转换为具象化的可选方案（调用 LLM）
 * 2. applyChoice(): 将用户选择写入 DecisionLog
 */
export class DisambiguationHandler {
  private readonly llmClient: LLMClient;
  private readonly model: string;

  constructor(llmClient: LLMClient, model = "deepseek-v4-pro") {
    this.llmClient = llmClient;
    this.model = model;
  }

  /**
   * 解析冲突，生成具象化方案
   *
   * 构造 prompt 调用 LLM，要求输出 2-3 个具体可选方案。
   */
  async resolve(report: ConflictReport): Promise<DisambiguationOptions> {
    if (!report.hasConflict || report.conflicts.length === 0) {
      return { conflictContext: "", options: [] };
    }

    const conflictDescriptions = report.conflicts
      .map((c) => this.describeConflict(c))
      .join("\n");

    const prompt = this.buildResolutionPrompt(conflictDescriptions);

    const response = await this.llmClient.createMessage({
      model: this.model,
      max_tokens: 2048,
      system: DISAMBIGUATION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    });

    // 从 LLM 响应中解析结构化方案
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return this.buildFallbackOptions(report);
    }

    return this.parseResponse(textBlock.text, report);
  }

  /**
   * 将用户选择写入 DecisionLog
   *
   * @param choiceId 用户选中的方案 ID
   * @param decisionLog 当前会话的决策记录
   * @param resolvedOptions 消歧选项（含方案详情）
   * @param originalReport 原始冲突报告（用于提取属性信息）
   */
  applyChoice(
    choiceId: string,
    decisionLog: DecisionLog,
    resolvedOptions: DisambiguationOptions,
    originalReport: ConflictReport
  ): void {
    const chosen = resolvedOptions.options.find((o) => o.id === choiceId);
    if (!chosen) {
      return;
    }

    // 将用户的选择记录为确认决策
    // 对于冲突涉及的每个属性，将选择结果写入 DecisionLog
    for (const conflict of originalReport.conflicts) {
      decisionLog.record({
        property: conflict.property,
        value: `[用户选择] ${chosen.description}`,
        scope: conflict.scope,
        source: "user_confirmed",
        targetId: conflict.targetId,
      });
    }
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private describeConflict(conflict: ConflictItem): string {
    const typeLabel =
      conflict.conflictType === "abstract_vs_concrete"
        ? "抽象描述与具体实现冲突"
        : "前后指令覆盖";
    return (
      `- [${typeLabel}] 属性 "${conflict.property}"：` +
      `先前值为 ${JSON.stringify(conflict.oldValue)}，` +
      `新意图为 ${JSON.stringify(conflict.newIntent)}` +
      (conflict.targetId ? `（目标：${conflict.targetId}）` : "")
    );
  }

  private buildResolutionPrompt(conflictDescriptions: string): string {
    return [
      "用户在同一设计会话中给出了前后矛盾的指令，请分析冲突并提供 2-3 个具象化的解决方案。",
      "",
      "## 冲突详情",
      conflictDescriptions,
      "",
      "## 输出要求",
      "请以 JSON 格式输出，结构如下：",
      "```json",
      "{",
      '  "conflictContext": "冲突背景的一句话描述",',
      '  "options": [',
      "    {",
      '      "id": "option_1",',
      '      "description": "方案描述（面向用户，简洁易懂）",',
      '      "expectedEffect": "该方案执行后的预期视觉效果"',
      "    }",
      "  ]",
      "}",
      "```",
      "",
      "注意：",
      "- 每个方案都应该是具体、可执行的",
      "- 描述面向非技术用户，用日常语言",
      "- 预期效果要具象化，用户能想象到结果",
    ].join("\n");
  }

  private parseResponse(
    text: string,
    report: ConflictReport
  ): DisambiguationOptions {
    // 尝试从响应中提取 JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return this.buildFallbackOptions(report);
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]) as {
        conflictContext?: string;
        options?: Array<{
          id?: string;
          description?: string;
          expectedEffect?: string;
        }>;
      };

      if (
        !parsed.options ||
        !Array.isArray(parsed.options) ||
        parsed.options.length === 0
      ) {
        return this.buildFallbackOptions(report);
      }

      return {
        conflictContext: parsed.conflictContext ?? "检测到设计意图冲突",
        options: parsed.options.map((opt, idx) => ({
          id: opt.id ?? `option_${idx + 1}`,
          description: opt.description ?? `方案 ${idx + 1}`,
          expectedEffect: opt.expectedEffect ?? "效果待确认",
        })),
      };
    } catch {
      return this.buildFallbackOptions(report);
    }
  }

  /**
   * 当 LLM 解析失败时，生成降级方案
   */
  private buildFallbackOptions(report: ConflictReport): DisambiguationOptions {
    const conflict = report.conflicts[0];
    if (!conflict) {
      return { conflictContext: "检测到意图冲突", options: [] };
    }

    return {
      conflictContext: `属性 "${conflict.property}" 存在冲突：先前设为 ${JSON.stringify(conflict.oldValue)}，现在要改为 ${JSON.stringify(conflict.newIntent)}`,
      options: [
        {
          id: "keep_old",
          description: `保持原有设置（${JSON.stringify(conflict.oldValue)}）`,
          expectedEffect: "维持之前确认的设计决策不变",
        },
        {
          id: "use_new",
          description: `使用新设置（${JSON.stringify(conflict.newIntent)}）`,
          expectedEffect: "覆盖先前决策，采用最新指令",
        },
      ],
    };
  }
}

// ─── 系统提示词 ────────────────────────────────────────────────────────────────

const DISAMBIGUATION_SYSTEM_PROMPT = `你是一个设计决策助手。当用户的设计指令存在前后矛盾时，你需要：
1. 理解冲突的本质
2. 将抽象描述具象化为可选方案
3. 每个方案用非技术用户能理解的日常语言描述
4. 预期效果要让用户能想象到视觉结果

输出纯 JSON，不要包含其他内容。`;
