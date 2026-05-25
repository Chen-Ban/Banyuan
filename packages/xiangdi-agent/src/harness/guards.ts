/**
 * 相地 · 内置 Guards（守卫）
 *
 * 开箱即用的前置检查函数，可直接传入 HarnessConfig.guards。
 * 每个 Guard 是独立的、可组合的，遵循单一职责原则。
 *
 * 使用示例：
 * ```ts
 * const harness = new HarnessRunner(masterGraph, client, {
 *   guards: [
 *     Guards.specApproved(),
 *     Guards.hasAtLeastOneTask(),
 *     Guards.noProhibitedKeywords(["delete all", "drop table"]),
 *   ],
 * });
 * ```
 */

import type { Guard, GuardFn } from "./types.js";

// ─── Guard 工厂函数 ───────────────────────────────────────────────────────────

/**
 * 检查 ChangeSpec 是否已被批准（status === "approved"）
 * 防止在 draft 状态下直接执行
 */
export function specApproved(): Guard {
  return {
    name: "spec-approved",
    description: "确保 ChangeSpec 已通过审核（status === approved）",
    fn: async (ctx) => {
      const { status } = ctx.changeSpec;
      if (status === "approved" || status === "in_progress") {
        return { passed: true };
      }
      return {
        passed: false,
        reason: `ChangeSpec 状态为 "${status}"，需要先批准（approved）才能执行`,
        suggestion: "调用 ChangeSpecBuilder.transition(spec, 'approved') 批准变更",
      };
    },
  };
}

/**
 * 检查 ChangeSpec 是否包含至少一个任务
 * 防止空任务列表导致 Agent 无所适从
 */
export function hasAtLeastOneTask(): Guard {
  return {
    name: "has-at-least-one-task",
    description: "确保 ChangeSpec 包含至少一个任务",
    fn: async (ctx) => {
      if (ctx.changeSpec.tasks.length > 0) {
        return { passed: true };
      }
      return {
        passed: false,
        reason: "ChangeSpec 的 tasks 列表为空，无法执行",
        suggestion: "使用 ChangeSpecBuilder.addTask() 添加任务",
      };
    },
  };
}

/**
 * 检查 ChangeSpec 的 proposal.what 是否包含禁止关键词
 * 防止危险操作（如批量删除、清空数据库等）
 *
 * @param keywords 禁止关键词列表（大小写不敏感）
 */
export function noProhibitedKeywords(keywords: string[]): Guard {
  return {
    name: "no-prohibited-keywords",
    description: `禁止包含关键词：${keywords.join(", ")}`,
    fn: async (ctx) => {
      const text = [
        ctx.changeSpec.proposal.what,
        ctx.changeSpec.title,
        ...ctx.changeSpec.specs,
      ]
        .join(" ")
        .toLowerCase();

      for (const keyword of keywords) {
        if (text.includes(keyword.toLowerCase())) {
          return {
            passed: false,
            reason: `ChangeSpec 包含禁止关键词："${keyword}"`,
          };
        }
      }
      return { passed: true };
    },
  };
}

/**
 * 检查 ChangeSpec 的 proposal 是否完整（why 和 what 不为空）
 */
export function proposalComplete(): Guard {
  return {
    name: "proposal-complete",
    description: "确保 proposal 的 why 和 what 字段不为空",
    fn: async (ctx) => {
      const { why, what } = ctx.changeSpec.proposal;
      if (!why?.trim()) {
        return { passed: false, reason: "proposal.why 不能为空" };
      }
      if (!what?.trim()) {
        return { passed: false, reason: "proposal.what 不能为空" };
      }
      return { passed: true };
    },
  };
}

/**
 * 自定义 Guard 工厂
 * 快速创建一个具名 Guard
 */
export function customGuard(name: string, fn: GuardFn, description?: string): Guard {
  return { name, description, fn };
}

// ─── Guards 命名空间（便于 tree-shaking 友好的导入）──────────────────────────

export const Guards = {
  specApproved,
  hasAtLeastOneTask,
  noProhibitedKeywords,
  proposalComplete,
  custom: customGuard,
} as const;
