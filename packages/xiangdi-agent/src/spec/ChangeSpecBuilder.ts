/**
 * 相地 · ChangeSpec 构建器
 *
 * 将用户的自然语言输入转化为结构化的 ChangeSpec（变更级过程文件）。
 * 这是 SDD 中"施工图纸"的生成入口。
 *
 * 两种使用模式：
 *
 *   1. 轻量模式（ChangeSpecBuilder.fromText）
 *      直接从用户输入文本构建最小化 ChangeSpec，不调用 LLM。
 *      适用于简单任务或快速原型。
 *
 *   2. LLM 辅助模式（ChangeSpecBuilder.fromLLM）
 *      调用 LLM 生成完整的 proposal + specs + tasks。
 *      适用于复杂任务，生成后需人工审核（Harness 的 human-in-the-loop 节点）。
 */

import type { ChangeSpec, ChangeTask } from "./types.js";

// ─── ID 生成 ──────────────────────────────────────────────────────────────────

let _idCounter = 0;

function generateId(prefix = "change"): string {
  _idCounter++;
  return `${prefix}-${Date.now()}-${_idCounter}`;
}

function generateTaskId(): string {
  _idCounter++;
  return `task-${_idCounter}`;
}

// ─── ChangeSpecBuilder ────────────────────────────────────────────────────────

export class ChangeSpecBuilder {
  /**
   * 从用户输入文本快速构建最小化 ChangeSpec（不调用 LLM）
   *
   * 生成的 ChangeSpec 处于 "draft" 状态，tasks 为空，
   * 需要后续通过 Harness 的 planning 阶段补全。
   *
   * @param userInput 用户的自然语言描述
   * @param id 可选的变更 ID，默认自动生成
   */
  static fromText(userInput: string, id?: string): ChangeSpec {
    const now = Date.now();
    return {
      id: id ?? generateId(),
      title: userInput.slice(0, 80).trim(),
      proposal: {
        why: "用户发起的变更请求",
        what: userInput,
      },
      specs: [],
      tasks: [],
      status: "draft",
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * 从结构化数据构建 ChangeSpec
   * 适用于已有完整信息的场景（如从文件恢复、或 LLM 返回结构化 JSON）
   */
  static fromStructured(data: Omit<ChangeSpec, "createdAt" | "updatedAt" | "status"> & {
    status?: ChangeSpec["status"];
  }): ChangeSpec {
    const now = Date.now();
    return {
      ...data,
      status: data.status ?? "draft",
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * 向 ChangeSpec 追加任务项
   */
  static addTask(
    spec: ChangeSpec,
    description: string,
    dependsOn?: string[]
  ): ChangeSpec {
    const task: ChangeTask = {
      id: generateTaskId(),
      description,
      done: false,
      dependsOn,
    };
    return {
      ...spec,
      tasks: [...spec.tasks, task],
      updatedAt: Date.now(),
    };
  }

  /**
   * 标记某个任务为完成
   */
  static completeTask(spec: ChangeSpec, taskId: string): ChangeSpec {
    return {
      ...spec,
      tasks: spec.tasks.map((t) =>
        t.id === taskId ? { ...t, done: true } : t
      ),
      updatedAt: Date.now(),
    };
  }

  /**
   * 推进 ChangeSpec 的状态
   */
  static transition(
    spec: ChangeSpec,
    nextStatus: ChangeSpec["status"]
  ): ChangeSpec {
    return {
      ...spec,
      status: nextStatus,
      updatedAt: Date.now(),
    };
  }

  /**
   * 获取下一个待执行的任务（依赖已满足且未完成）
   */
  static nextPendingTask(spec: ChangeSpec): ChangeTask | null {
    const donIds = new Set(spec.tasks.filter((t) => t.done).map((t) => t.id));
    return (
      spec.tasks.find((t) => {
        if (t.done) return false;
        if (!t.dependsOn || t.dependsOn.length === 0) return true;
        return t.dependsOn.every((dep) => donIds.has(dep));
      }) ?? null
    );
  }

  /**
   * 检查所有任务是否已完成
   */
  static isAllDone(spec: ChangeSpec): boolean {
    return spec.tasks.length > 0 && spec.tasks.every((t) => t.done);
  }

  /**
   * 将 ChangeSpec 序列化为 Markdown（用于持久化或注入 prompt）
   */
  static toMarkdown(spec: ChangeSpec): string {
    const lines: string[] = [
      `# Change: ${spec.title}`,
      ``,
      `**Status:** ${spec.status}`,
      `**ID:** ${spec.id}`,
      ``,
      `## Proposal`,
      ``,
      `**Why:** ${spec.proposal.why}`,
      ``,
      `**What:** ${spec.proposal.what}`,
    ];

    if (spec.proposal.outOfScope) {
      lines.push(``, `**Out of Scope:** ${spec.proposal.outOfScope}`);
    }

    if (spec.proposal.successCriteria?.length) {
      lines.push(``, `**Success Criteria:**`);
      for (const c of spec.proposal.successCriteria) {
        lines.push(`- ${c}`);
      }
    }

    if (spec.specs.length > 0) {
      lines.push(``, `## Specs`, ``);
      for (const s of spec.specs) {
        lines.push(`- ${s}`);
      }
    }

    if (spec.tasks.length > 0) {
      lines.push(``, `## Tasks`, ``);
      for (const t of spec.tasks) {
        const checkbox = t.done ? "[x]" : "[ ]";
        lines.push(`- ${checkbox} ${t.description}`);
      }
    }

    return lines.join("\n");
  }
}
