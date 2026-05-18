/**
 * 相地 · 冲突检测器
 *
 * 「相地之法，贵在审势。」
 * 当用户前后指令相悖时，不可贸然行事，
 * 须先察觉矛盾，再呈于用户决断。
 *
 * ConflictDetector 对比即将执行的工具调用与 DecisionLog 中已有决策，
 * 识别属性级冲突，输出 ConflictReport 供后续消歧流程使用。
 */

import type { ToolUseContent } from "./types.js";

// ─── 决策记录 ──────────────────────────────────────────────────────────────────

/** 决策作用域 */
export type DecisionScope = "global" | "page" | "node";

/** 决策来源 */
export type DecisionSource = "user_confirmed" | "auto_inferred";

/** 单条决策记录 */
export interface Decision {
  /** 属性名（如 "backgroundColor"、"fontSize"） */
  property: string;
  /** 属性值 */
  value: unknown;
  /** 作用域 */
  scope: DecisionScope;
  /** 来源轮次 */
  round: number;
  /** 来源类型 */
  source: DecisionSource;
  /** 作用域限定的目标 ID（page/node 级别时指定具体对象） */
  targetId?: string;
}

/**
 * DecisionLog —— 记录本次会话内已确认的决策
 *
 * 在 Agent 执行过程中，每当用户确认或 Agent 自动推断出一个设计决策，
 * 就记入 DecisionLog，作为后续冲突检测的基准。
 */
export class DecisionLog {
  private decisions: Decision[] = [];
  private currentRound = 0;

  /**
   * 推进轮次（每次 AgentLoop 迭代调用）
   */
  advanceRound(): void {
    this.currentRound++;
  }

  /**
   * 获取当前轮次
   */
  getRound(): number {
    return this.currentRound;
  }

  /**
   * 记录一条决策
   */
  record(decision: Omit<Decision, "round">): void {
    this.decisions.push({
      ...decision,
      round: this.currentRound,
    });
  }

  /**
   * 查找与指定属性+作用域冲突的已有决策
   *
   * 冲突条件：同一属性、同一作用域（及同一 targetId）下的不同值
   */
  getConflicting(
    property: string,
    scope: DecisionScope,
    targetId?: string
  ): Decision[] {
    return this.decisions.filter(
      (d) =>
        d.property === property &&
        d.scope === scope &&
        (targetId === undefined || d.targetId === targetId)
    );
  }

  /**
   * 获取全部决策记录（只读）
   */
  getAll(): readonly Decision[] {
    return this.decisions;
  }

  /**
   * 清空决策记录
   */
  clear(): void {
    this.decisions = [];
    this.currentRound = 0;
  }
}

// ─── 冲突报告 ──────────────────────────────────────────────────────────────────

/** 冲突类型 */
export type ConflictType = "abstract_vs_concrete" | "temporal_override";

/** 单条冲突描述 */
export interface ConflictItem {
  /** 冲突的属性名 */
  property: string;
  /** 先前已确认的值 */
  oldValue: unknown;
  /** 新指令意图的值 */
  newIntent: unknown;
  /** 冲突分类 */
  conflictType: ConflictType;
  /** 冲突涉及的作用域 */
  scope: DecisionScope;
  /** 冲突涉及的目标 ID */
  targetId?: string;
}

/** 冲突检测报告 */
export interface ConflictReport {
  hasConflict: boolean;
  conflicts: ConflictItem[];
}

// ─── 冲突检测器 ────────────────────────────────────────────────────────────────

/**
 * 从 ToolUseContent 中提取属性变更意图
 *
 * 这里对 BanvasGL 画布工具的 input 结构进行解析：
 * - update_node: input.updates 包含属性变更
 * - add_node: input.properties 包含属性设置
 * - apply_patch: input.patch 包含 JSON Patch 操作
 */
interface PropertyIntent {
  property: string;
  value: unknown;
  scope: DecisionScope;
  targetId?: string;
}

function extractIntentsFromToolCall(
  toolCall: ToolUseContent
): PropertyIntent[] {
  const intents: PropertyIntent[] = [];
  const { name, input } = toolCall;

  if (name === "update_node" && input["updates"]) {
    const updates = input["updates"] as Record<string, unknown>;
    const nodeId = input["nodeId"] as string | undefined;
    for (const [key, value] of Object.entries(updates)) {
      intents.push({
        property: key,
        value,
        scope: nodeId ? "node" : "global",
        targetId: nodeId,
      });
    }
  } else if (name === "add_node" && input["properties"]) {
    const properties = input["properties"] as Record<string, unknown>;
    const pageId = input["pageId"] as string | undefined;
    for (const [key, value] of Object.entries(properties)) {
      intents.push({
        property: key,
        value,
        scope: pageId ? "page" : "global",
        targetId: pageId,
      });
    }
  } else if (name === "apply_patch" && input["patch"]) {
    const patches = input["patch"] as Array<{
      op: string;
      path: string;
      value?: unknown;
    }>;
    for (const patch of patches) {
      if (patch.op === "replace" || patch.op === "add") {
        // 从 JSON Patch path 中提取属性名（取最后一段）
        const segments = patch.path.split("/").filter(Boolean);
        const property = segments[segments.length - 1] ?? patch.path;
        intents.push({
          property,
          value: patch.value,
          scope: "node",
          targetId: segments.length > 1 ? segments[0] : undefined,
        });
      }
    }
  }

  return intents;
}

/**
 * 判断冲突类型
 *
 * - abstract_vs_concrete：旧决策为抽象描述（字符串包含模糊关键词），新值为具体值
 * - temporal_override：同类属性的前后覆盖
 */
function classifyConflict(oldValue: unknown, newValue: unknown): ConflictType {
  // 如果旧值是字符串且包含模糊/抽象关键词，视为 abstract vs concrete
  if (typeof oldValue === "string") {
    const abstractPatterns = [
      /整体/,
      /风格/,
      /调/,
      /氛围/,
      /简洁/,
      /醒目/,
      /统一/,
    ];
    const isAbstract = abstractPatterns.some((p) => p.test(oldValue));
    if (isAbstract && typeof newValue !== "string") {
      return "abstract_vs_concrete";
    }
  }
  return "temporal_override";
}

/**
 * ConflictDetector —— 冲突检测器
 *
 * 对比即将执行的工具调用与 DecisionLog 中的已有决策，
 * 识别属性级冲突，生成 ConflictReport。
 */
export class ConflictDetector {
  /**
   * 检测冲突
   *
   * @param toolCalls 即将执行的工具调用列表
   * @param decisionLog 当前会话的决策记录
   * @returns 冲突报告
   */
  check(toolCalls: ToolUseContent[], decisionLog: DecisionLog): ConflictReport {
    const conflicts: ConflictItem[] = [];

    for (const toolCall of toolCalls) {
      const intents = extractIntentsFromToolCall(toolCall);

      for (const intent of intents) {
        const existing = decisionLog.getConflicting(
          intent.property,
          intent.scope,
          intent.targetId
        );

        for (const decision of existing) {
          // 值相同不算冲突
          if (JSON.stringify(decision.value) === JSON.stringify(intent.value)) {
            continue;
          }

          // 自动推断的决策被覆盖时不触发冲突（仅用户确认的决策触发）
          if (decision.source === "auto_inferred") {
            continue;
          }

          conflicts.push({
            property: intent.property,
            oldValue: decision.value,
            newIntent: intent.value,
            conflictType: classifyConflict(decision.value, intent.value),
            scope: intent.scope,
            targetId: intent.targetId,
          });
        }
      }
    }

    return {
      hasConflict: conflicts.length > 0,
      conflicts,
    };
  }
}
