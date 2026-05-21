/**
 * 相地 · 内置 HumanGates（人工介入节点）
 *
 * 开箱即用的人工介入节点，可直接传入 HarnessConfig.humanGates。
 * 这是 Harness Engineering 中"人在回路"（Human-in-the-Loop）的实现。
 *
 * 注意：这些工厂函数返回的 HumanGate 默认自动批准（不阻塞）。
 * 实际使用时，需要通过 HarnessRunner.requestHumanDecision 接入真实交互。
 *
 * 使用示例：
 * ```ts
 * const harness = new HarnessRunner(agentLoop, client, {
 *   humanGates: [
 *     HumanGates.reviewProposal(),
 *     HumanGates.reviewTasks(),
 *   ],
 * });
 * ```
 */

import type { HumanGate } from "./types.js";
import { ChangeSpecBuilder } from "../spec/ChangeSpecBuilder.js";

// ─── HumanGate 工厂函数 ───────────────────────────────────────────────────────

/**
 * 执行前审核 Proposal
 * 展示 ChangeSpec 的 proposal，等待用户确认后再执行
 */
export function reviewProposal(): HumanGate {
  return {
    trigger: "before_run",
    prompt: (ctx) => {
      const { proposal, title } = ctx.changeSpec;
      return [
        `📋 请审核以下变更 Proposal：`,
        ``,
        `**标题：** ${title}`,
        `**Why：** ${proposal.why}`,
        `**What：** ${proposal.what}`,
        proposal.outOfScope ? `**不包含：** ${proposal.outOfScope}` : "",
        ``,
        `是否批准执行？`,
      ]
        .filter(Boolean)
        .join("\n");
    },
    onDecision: async (decision, ctx) => {
      if (!decision.approved) return false;
      // 若用户提供了修改意见，更新 proposal
      if (decision.comment) {
        ctx.changeSpec = {
          ...ctx.changeSpec,
          proposal: {
            ...ctx.changeSpec.proposal,
            what: `${ctx.changeSpec.proposal.what}\n\n[用户补充] ${decision.comment}`,
          },
          updatedAt: Date.now(),
        };
      }
      return true;
    },
  };
}

/**
 * 执行前审核 Tasks 列表
 * 展示所有待执行任务，等待用户确认
 */
export function reviewTasks(): HumanGate {
  return {
    trigger: "before_run",
    prompt: (ctx) => {
      const { tasks, title } = ctx.changeSpec;
      if (tasks.length === 0) {
        return `⚠️ 变更 "${title}" 没有任务列表，是否继续？`;
      }
      const taskList = tasks
        .map((t, i) => `  ${i + 1}. ${t.description}`)
        .join("\n");
      return [
        `📝 变更 "${title}" 的执行计划：`,
        ``,
        taskList,
        ``,
        `共 ${tasks.length} 个任务，是否开始执行？`,
      ].join("\n");
    },
    onDecision: async (decision) => decision.approved,
  };
}

/**
 * 执行后确认结果
 * 展示 Agent 的输出，等待用户确认是否接受
 */
export function confirmResult(): HumanGate {
  return {
    trigger: "after_run",
    prompt: (ctx) => {
      const preview = ctx.result
        ? ctx.result.slice(0, 500) + (ctx.result.length > 500 ? "..." : "")
        : "(无输出)";
      return [
        `✅ Agent 执行完成，输出预览：`,
        ``,
        preview,
        ``,
        `是否接受此结果？`,
      ].join("\n");
    },
    onDecision: async (decision) => decision.approved,
  };
}

/**
 * 出错时询问是否重试
 */
export function retryOnError(): HumanGate {
  return {
    trigger: "on_error",
    prompt: (ctx) => {
      return [
        `❌ 执行出错：${ctx.error?.message ?? "未知错误"}`,
        ``,
        `是否重试？`,
      ].join("\n");
    },
    onDecision: async (decision) => decision.approved,
  };
}

// ─── HumanGates 命名空间 ──────────────────────────────────────────────────────

export const HumanGates = {
  reviewProposal,
  reviewTasks,
  confirmResult,
  retryOnError,
} as const;
