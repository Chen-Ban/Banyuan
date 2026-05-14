/**
 * 相地 · 内置 Checkpoints（检查点）
 *
 * 开箱即用的后置验证函数，可直接传入 HarnessConfig.checkpoints。
 * 在 AgentLoop 执行完成后运行，验证输出是否符合预期。
 *
 * 使用示例：
 * ```ts
 * const harness = new HarnessRunner(agentLoop, client, {
 *   checkpoints: [
 *     Checkpoints.outputNotEmpty(),
 *     Checkpoints.outputMatchesPattern(/成功|完成/),
 *     Checkpoints.allTasksDone(),
 *   ],
 * });
 * ```
 */

import type { Checkpoint, CheckpointFn } from "./types.js";
import { ChangeSpecBuilder } from "../spec/ChangeSpecBuilder.js";

// ─── Checkpoint 工厂函数 ──────────────────────────────────────────────────────

/**
 * 检查 AgentLoop 的输出不为空
 */
export function outputNotEmpty(): Checkpoint {
  return {
    name: "output-not-empty",
    description: "确保 Agent 输出不为空字符串",
    fn: async (ctx) => {
      if (ctx.result && ctx.result.trim().length > 0) {
        return { passed: true };
      }
      return {
        passed: false,
        reason: "Agent 输出为空，可能执行失败",
      };
    },
  };
}

/**
 * 检查输出是否匹配指定的正则表达式
 *
 * @param pattern 正则表达式
 * @param description 可选的描述
 */
export function outputMatchesPattern(
  pattern: RegExp,
  description?: string
): Checkpoint {
  return {
    name: "output-matches-pattern",
    description: description ?? `输出需匹配正则：${pattern.toString()}`,
    fn: async (ctx) => {
      if (ctx.result && pattern.test(ctx.result)) {
        return { passed: true };
      }
      return {
        passed: false,
        reason: `Agent 输出不匹配预期模式：${pattern.toString()}`,
      };
    },
  };
}

/**
 * 检查 ChangeSpec 中的所有任务是否已完成
 * 适用于 Harness 在执行过程中同步更新 tasks 状态的场景
 */
export function allTasksDone(): Checkpoint {
  return {
    name: "all-tasks-done",
    description: "确保 ChangeSpec 中的所有任务已标记为完成",
    fn: async (ctx) => {
      if (ctx.changeSpec.tasks.length === 0) {
        // 没有任务时跳过此检查
        return { passed: true };
      }
      if (ChangeSpecBuilder.isAllDone(ctx.changeSpec)) {
        return { passed: true };
      }
      const pending = ctx.changeSpec.tasks.filter((t) => !t.done);
      return {
        passed: false,
        reason: `还有 ${pending.length} 个任务未完成：${pending.map((t) => t.description).join("、")}`,
      };
    },
  };
}

/**
 * 输出长度检查
 * 防止 Agent 输出过短（可能是截断或错误）
 *
 * @param minLength 最小字符数，默认 10
 */
export function outputMinLength(minLength = 10): Checkpoint {
  return {
    name: "output-min-length",
    description: `输出长度不少于 ${minLength} 个字符`,
    fn: async (ctx) => {
      const len = ctx.result?.length ?? 0;
      if (len >= minLength) {
        return { passed: true };
      }
      return {
        passed: false,
        reason: `Agent 输出过短（${len} 字符），期望至少 ${minLength} 字符`,
      };
    },
  };
}

/**
 * 自定义 Checkpoint 工厂
 */
export function customCheckpoint(
  name: string,
  fn: CheckpointFn,
  options?: { description?: string; rollback?: Checkpoint["rollback"] }
): Checkpoint {
  return {
    name,
    description: options?.description,
    fn,
    rollback: options?.rollback,
  };
}

// ─── Checkpoints 命名空间 ─────────────────────────────────────────────────────

export const Checkpoints = {
  outputNotEmpty,
  outputMatchesPattern,
  allTasksDone,
  outputMinLength,
  custom: customCheckpoint,
} as const;
