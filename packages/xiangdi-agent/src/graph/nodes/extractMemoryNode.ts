/**
 * 相地 · 记忆提取节点（含偏好提取）
 *
 * 在 Agent 管线末端，分析本轮执行过程，
 * 提取有价值的经验（Episode）、可复用的事实（Fact），
 * 以及用户表达的设计/内容/交互偏好（user_preference 类别 Fact）。
 *
 * 合并了原 extractPreferencesNode 的偏好提取职责，统一在此节点完成。
 *
 * 设计原则：
 * - LLM 驱动：使用轻量模型分析 roundSummary 提取结构化记忆
 * - 静默保存：不打扰用户流程
 * - 有条件触发：简单问答不触发，只有有实际操作的任务或包含偏好信号时才触发
 * - 偏好敏感：即使无复杂操作，检测到用户偏好表达也会触发提取
 * - 失败容错：提取失败静默忽略，不影响主流程
 */
import type { LLMClient } from "../../core/llmTypes.js";
import type { StreamCallback } from "../../core/types.js";
import type { BaseMessage } from "@langchain/core/messages";
import type { AuditResult } from "../../orchestration/types.js";
import type { PlanOutput } from "../state.js";
import type { MemoryNamespace } from "../../memory/types.js";

/**
 * 记忆提取节点所需的最小状态接口
 */
export interface MemoryNodeState {
  messages: BaseMessage[];
  roundSummary: string;
  auditResult: AuditResult | null;
  auditRetries: number;
  planOutput: PlanOutput | null;
  [key: string]: unknown;
}

/**
 * 记忆提取节点配置
 */
export interface ExtractMemoryConfig {
  llmClient: LLMClient;
  streamCallback?: StreamCallback;
  /** 是否启用记忆提取（默认 true） */
  enabled?: boolean;
  /** 记忆提取使用的模型 */
  model?: string;
  /** 工具调用次数阈值（低于此值跳过提取，默认 2） */
  minToolCalls?: number;
  /** 命名空间（ADR-033），附带在 memory_update 事件中供下游存储按命名空间分区 */
  namespace?: MemoryNamespace;
}

// ─── 记忆提取 Prompt ──────────────────────────────────────────────────────────

const MEMORY_EXTRACTION_PROMPT = `你是一个经验提取助手。分析以下任务执行摘要，提取值得记录的经验和可复用的事实。

## 经验（Episode）提取规则

1. 只提取有实际操作价值的经验（不记录简单问答）
2. title：一句话概括做了什么（≤50字）
3. content：2-3句话描述具体过程和结果
4. outcome：根据执行结果判断（success/failure/partial/aborted）
5. lessons：从中学到的1-3条教训（可为空数组）
6. involvedEntities：涉及的关键实体名（View名、组件名、页面名等）
7. tags：分类标签（table/layout/style/data-binding/navigation/form 等）
8. importance 评估标准：
   - 0.3-0.4: 常规操作，无特殊发现
   - 0.5-0.6: 有一定复杂度，发现了可复用模式
   - 0.7-0.8: 复杂任务或重要教训
   - 0.9-1.0: 关键错误修复或核心架构决策

## 事实（Fact）提取规则

1. 只提取具有跨任务复用价值的稳定结论
2. 不提取一次性信息（如"用户刚才创建了一个按钮"）
3. category 可选值：user_preference / design_pattern / coding_convention / project_knowledge / tool_usage / error_pattern / general
4. confidence：对该结论的确信程度（0.4-0.8 之间，首次提取不应超过 0.8）
5. 如果本轮没有值得记录的事实，facts 返回空数组

## 输出格式（严格 JSON）

{
  "episode": {
    "title": "...",
    "content": "...",
    "outcome": "success|failure|partial|aborted",
    "lessons": ["...", "..."],
    "involvedEntities": ["...", "..."],
    "tags": ["...", "..."],
    "importance": 0.0-1.0
  },
  "facts": [
    { "category": "...", "content": "...", "confidence": 0.0-1.0 }
  ]
}

## user_preference 类别特别指引

当用户在对话中表达设计/内容/交互偏好时，必须提取为 user_preference 类别的 Fact：
- 触发信号：喜欢/偏好/习惯/风格/总是/每次都/不要/别用/我想要/prefer/always/never/style/theme/make it 等
- content 格式："{维度}: {具体偏好值}"
- 偏好维度包括但不限于：配色(colorScheme)、圆角(borderRadius)、间距(spacing)、字体(fontFamily)、布局(layout)、语气(tone)、语言(language)
- 示例：
  - { "category": "user_preference", "content": "设计风格/圆角: 大圆角(12px以上)", "confidence": 0.85 }
  - { "category": "user_preference", "content": "配色: 暗色系为主", "confidence": 0.8 }
  - { "category": "user_preference", "content": "字体: 思源黑体", "confidence": 0.9 }
  - { "category": "user_preference", "content": "内容语气: 简洁专业", "confidence": 0.75 }
- 偏好 Fact 的 confidence 通常较高（0.7-0.9），因为是用户明确表达的
- 即使本轮没有 Episode 值得记录，只要检测到偏好信号就应提取 Fact

如果本轮不值得记录任何经验，返回：
{ "episode": null, "facts": [] }`;

// ─── 偏好信号检测 ─────────────────────────────────────────────────────────────

const PREFERENCE_SIGNALS = [
  "喜欢", "偏好", "习惯", "风格", "总是", "每次都", "不要", "别用", "我想要",
  "圆角", "配色", "字体", "间距", "布局", "排版",
  "简约", "商务", "活泼", "暗色", "亮色",
  "prefer", "always", "never", "style", "theme", "font", "color",
  "rounded", "flat", "minimal", "modern",
  "i like", "i want", "don't use", "make it",
];

/**
 * 检测最近的用户消息中是否包含偏好信号关键词
 */
function hasPreferenceSignal(messages: BaseMessage[]): boolean {
  const recent = messages.slice(-6);
  for (const msg of recent) {
    if (msg._getType() !== "human") continue;
    const content = typeof msg.content === "string"
      ? msg.content
      : Array.isArray(msg.content)
        ? msg.content.map((c) => (typeof c === "string" ? c : "text" in c ? (c as { text: string }).text : "")).join(" ")
        : "";
    const lower = content.toLowerCase();
    if (PREFERENCE_SIGNALS.some((s) => lower.includes(s.toLowerCase()))) return true;
  }
  return false;
}

/**
 * 统计消息中的工具调用次数
 */
function countToolCalls(messages: BaseMessage[]): number {
  let count = 0;
  for (const msg of messages) {
    if (msg._getType() === "ai") {
      const content = msg.content;
      if (Array.isArray(content)) {
        count += content.filter(
          (block) => typeof block === "object" && block !== null && "type" in block && block.type === "tool_use"
        ).length;
      }
    }
  }
  return count;
}

// ─── ADR-035: 代码推导 Episode 元数据 ──────────────────────────────────────────

interface DerivedEpisodeMetadata {
  title: string;
  outcome: "success" | "failure" | "partial";
  tags: string[];
  importance: number;
  involvedEntities: string[];
}

/**
 * 从 state 中代码推导 Episode 的结构化元数据，无需 LLM。
 * 只有 lessons（经验教训归纳）保留给 LLM。
 */
function deriveEpisodeMetadata(
  state: MemoryNodeState,
  outcome: "success" | "failure" | "partial",
  toolCallCount: number
): DerivedEpisodeMetadata {
  // title: 从 planOutput.intentSummary 或 roundSummary 的第一行截取
  const title = state.planOutput?.intentSummary
    || (state.roundSummary ? state.roundSummary.split("\n")[0].slice(0, 50) : "未知任务");

  // tags: 从 planOutput.tasks 中提取 taskType/agent 信息
  const tags: string[] = [];
  if (state.planOutput?.tasks) {
    for (const task of state.planOutput.tasks) {
      if ("type" in task && typeof task.type === "string" && !tags.includes(task.type)) {
        tags.push(task.type);
      }
      if ("agent" in task && typeof task.agent === "string" && !tags.includes(task.agent)) {
        tags.push(task.agent);
      }
    }
  }
  // 从 outcome 添加结果 tag
  if (outcome === "failure") tags.push("failed");
  if (state.auditRetries > 0) tags.push("retried");

  // importance: 基于工具调用次数 + 是否重试 + 任务数量的启发式评分
  const taskCount = state.planOutput?.tasks?.length ?? 0;
  let importance = 0.3; // 基线
  if (toolCallCount >= 5) importance += 0.2;
  if (toolCallCount >= 10) importance += 0.1;
  if (taskCount >= 3) importance += 0.1;
  if (state.auditRetries > 0) importance += 0.1;
  if (outcome === "failure") importance += 0.1;
  importance = Math.min(importance, 1.0);

  // involvedEntities: 从 planOutput.tasks 中收集涉及的实体名
  const involvedEntities: string[] = [];
  if (state.planOutput?.tasks) {
    for (const task of state.planOutput.tasks) {
      if ("target" in task && typeof task.target === "string" && !involvedEntities.includes(task.target)) {
        involvedEntities.push(task.target);
      }
      if ("viewId" in task && typeof task.viewId === "string" && !involvedEntities.includes(task.viewId)) {
        involvedEntities.push(task.viewId);
      }
    }
  }

  return { title, outcome, tags, importance, involvedEntities };
}

/**
 * 创建记忆提取节点函数
 *
 * 节点行为：
 * 1. 前置条件检查（roundSummary 存在、工具调用次数达标）
 * 2. 代码推导 Episode 元数据（ADR-035）
 * 3. 调用 LLM 仅提取 lessons 和 facts
 * 4. 合并代码推导结果与 LLM 归纳，通过 streamCallback 发出 memory_update 事件
 * 5. 节点不修改 AgentState，只产生副作用（SSE 事件）
 */
export function createExtractMemoryNode(config: ExtractMemoryConfig) {
  const {
    llmClient,
    streamCallback,
    enabled = true,
    model = "deepseek-v4-pro",
    minToolCalls = 2,
  } = config;

  return async function extractMemoryNode(state: MemoryNodeState): Promise<Partial<MemoryNodeState>> {
    // 跳过条件：功能禁用、无 streamCallback
    if (!enabled || !streamCallback) {
      return {};
    }

    // 检测偏好信号
    const hasPrefSignal = hasPreferenceSignal(state.messages);

    // 跳过条件：没有 roundSummary 且无偏好信号（说明是简单交互）
    if (!state.roundSummary && !hasPrefSignal) {
      return {};
    }

    // 跳过条件：工具调用次数不足 + 无偏好信号（简单问答不值得记录）
    const toolCallCount = countToolCalls(state.messages);
    if (toolCallCount < minToolCalls && state.auditRetries === 0 && !hasPrefSignal) {
      return {};
    }

    try {
      // ─── ADR-035: 混合提取 ─────────────────────────────────────────────
      // Episode 元数据尽量用代码推导，仅 lessons 需要 LLM 归纳
      const outcomeHint: "success" | "failure" | "partial" = state.auditResult?.passed
        ? "success"
        : state.auditResult
          ? "failure"
          : "partial";

      // 代码推导 Episode 元数据
      const codeDerivedEpisode = deriveEpisodeMetadata(state, outcomeHint, toolCallCount);

      // 如果没有 roundSummary 但有偏好信号，从对话中构建上下文
      let contextText: string;
      if (!state.roundSummary && hasPrefSignal) {
        const recentUserMsgs = state.messages.slice(-6)
          .filter((m) => m._getType() === "human")
          .map((m) => typeof m.content === "string" ? m.content : "")
          .filter(Boolean)
          .join("\n");
        contextText = [
          `## 用户最近对话（请重点提取偏好信号）`,
          recentUserMsgs,
          ``,
          `## 执行信息`,
          `- 检测到用户偏好表达信号`,
          `- 本轮无复杂操作，重点提取 user_preference Fact`,
          ``,
          `## 已推导的 Episode 元数据（仅需补充 lessons）`,
          `- title: ${codeDerivedEpisode.title}`,
          `- outcome: ${codeDerivedEpisode.outcome}`,
          `- importance: ${codeDerivedEpisode.importance}`,
        ].join("\n");
      } else {
        contextText = [
          `## 任务摘要`,
          state.roundSummary,
          ``,
          `## 执行信息`,
          `- 执行结果: ${outcomeHint}`,
          `- 工具调用次数: ${toolCallCount}`,
          `- 审核重试次数: ${state.auditRetries}`,
          state.planOutput?.intentSummary
            ? `- 用户意图: ${state.planOutput.intentSummary}`
            : null,
          state.planOutput?.tasks
            ? `- 任务数量: ${state.planOutput.tasks.length}`
            : null,
          ``,
          `## 已推导的 Episode 元数据（仅需补充 lessons 和 facts）`,
          `- title: ${codeDerivedEpisode.title}`,
          `- outcome: ${codeDerivedEpisode.outcome}`,
          `- tags: ${codeDerivedEpisode.tags.join(", ")}`,
          `- importance: ${codeDerivedEpisode.importance}`,
          `- involvedEntities: ${codeDerivedEpisode.involvedEntities.join(", ")}`,
          ``,
          `请基于以上已推导信息，只补充 lessons 和 facts。episode 其他字段已确定无需重复。`,
        ].filter(Boolean).join("\n");
      }

      const response = await llmClient.createMessage({
        model,
        max_tokens: 512,
        system: MEMORY_EXTRACTION_PROMPT,
        messages: [
          { role: "user", content: contextText },
        ],
        temperature: 0.2,
      });

      // 解析 LLM 返回的 JSON
      const textContent = response.content
        .filter((block): block is { type: "text"; text: string } => block.type === "text")
        .map((block) => block.text)
        .join("");

      if (!textContent.trim()) {
        return {};
      }

      // 清理可能的 markdown 代码块标记
      const cleanJson = textContent
        .replace(/^```json\s*/i, "")
        .replace(/```\s*$/, "")
        .trim();

      const parsed = JSON.parse(cleanJson) as {
        episode: {
          title: string;
          content: string;
          outcome: "success" | "failure" | "partial" | "aborted";
          lessons: string[];
          involvedEntities: string[];
          tags: string[];
          importance: number;
        } | null;
        facts: Array<{
          category: string;
          content: string;
          confidence: number;
        }>;
      };

      // 验证：episode 和 facts 都为空则跳过
      if (!parsed.episode && (!parsed.facts || parsed.facts.length === 0)) {
        return {};
      }

      // ADR-035: 合并代码推导的元数据与 LLM 归纳的 lessons
      const finalEpisode = parsed.episode
        ? {
            ...parsed.episode,
            title: codeDerivedEpisode.title || parsed.episode.title,
            outcome: codeDerivedEpisode.outcome,
            tags: codeDerivedEpisode.tags.length > 0 ? codeDerivedEpisode.tags : parsed.episode.tags,
            importance: codeDerivedEpisode.importance,
            involvedEntities: codeDerivedEpisode.involvedEntities.length > 0
              ? codeDerivedEpisode.involvedEntities
              : parsed.episode.involvedEntities,
            // lessons 保留 LLM 归纳结果
            lessons: parsed.episode.lessons,
          }
        : toolCallCount >= minToolCalls
          ? { ...codeDerivedEpisode, content: state.roundSummary || codeDerivedEpisode.title, lessons: [] }
          : null;

      // 发出 memory_update 事件
      streamCallback({
        type: "memory_update",
        data: {
          episode: finalEpisode,
          facts: parsed.facts ?? [],
          ...(config.namespace ? { namespace: config.namespace } : {}),
        },
      });
    } catch {
      // 记忆提取失败不影响主流程，静默忽略
    }

    // 该节点不修改 state，纯副作用节点
    return {};
  };
}
