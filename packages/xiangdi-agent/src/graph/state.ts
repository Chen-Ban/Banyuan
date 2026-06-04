/**
 * 相地 · LangGraph 状态定义 V2
 *
 * MasterGraph 统一管线：
 *   START → plan ↔ humanGate → execute → assemble → audit → summarize → extractMemory → END
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                        五层上下文模型                                     │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │ L1: SystemPrompt   — 系统能力描述（角色定义 + 工具定义 + 通用规则）         │
 * │ L2: AgentMemory    — Agent 经验 + 事实（含用户偏好，从历史任务中积累） │
 * │ L3: ContextSummary — 历史对话摘要（未命中 round 的 roundSummary 拼接，动态生成）│
 * │ L4: RecentMessages — 对话历史（最近几轮的完整消息交互）                   │
 * │ L5: CurrentPrompt  — 当前用户输入（含结构化追加的 humanGate 反馈）        │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * L3↔L4 关系：
 *   - 每轮对话结束时，summarize 节点生成 roundSummary
 *   - banyan 后端将 roundSummary 持久化到 MongoDB
 *   - 下一轮对话时，ContextBuilder 构建分层上下文：
 *     · 语义检索命中 + 最近 N 轮 → 展开原始消息保留在 L4（RecentMessages）
 *     · 未选中 round 的 roundSummary 拼接 → L3（ContextSummary）
 *   - 对 XiangDi 服务来说是透明的：L2、L3 和 L4 由 banyan 后端在请求时构建好传入
 *
 * HumanGate 反馈机制：
 *   - 不是简单追加一句话，而是将"LLM 提出的方案 + 用户的澄清"结构化追加到 L5 后面
 *   - 形成完整的 CoT 链条：原始请求 → 系统方案 → 用户纠正
 *   - 这样 Plan 重新规划时能精确理解"哪里不对、要怎么改"
 */
import { Annotation } from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages";
import type { ProjectSpec } from "../spec/types.js";
import type { ConflictReport } from "../core/ConflictDetector.js";
import type { DisambiguationOptions } from "../core/DisambiguationHandler.js";
import type {
  SubAgentResult,
  AssemblyPlan,
  AuditResult,
} from "../orchestration/types.js";
import type { PlanningSnapshot, ResumeClassification } from "./resume/types.js";

// ─── Intent 分类结果（Phase 2: ADR-039 统一 Graph）──────────────────────────

/**
 * Intent 节点的分类结果。
 * - respond: 纯对话/信息查询，路由到 respond 节点
 * - task: 需要画布操作/数据修改，路由到 plan 节点
 */
export type IntentType = "respond" | "task";

/**
 * Intent 节点输出。
 * 零 token 规则优先，LLM fallback 分类。
 */
export interface IntentResult {
  /** 分类结果 */
  type: IntentType;
  /** 分类来源：rule（规则命中） | llm（LLM 分类） */
  source: "rule" | "llm";
  /** 置信度（rule 命中时为 1.0，LLM 分类时为模型返回值） */
  confidence: number;
  /** 分类原因（可选，调试用） */
  reason?: string;
}

// Messages reducer that appends messages
function messagesReducer(curr: BaseMessage[], update: BaseMessage[]): BaseMessage[] {
  return [...curr, ...update];
}

// ─── Plan 产出类型 ────────────────────────────────────────────────────────────

/**
 * Plan 阶段生成的任务定义（带依赖关系）
 */
export interface PlanTask {
  /** 任务唯一 ID */
  taskId: string;
  /** 任务自然语言描述（作为 execute 阶段的 prompt） */
  description: string;
  /** 依赖的其他任务 ID（这些任务执行完毕后才能开始本任务） */
  dependsOn: string[];
  /** 执行优先级（同一依赖层内的排序，数字越小优先级越高） */
  priority: number;
  /** 任务分类（帮助 execute 选择合适的 system prompt 和工具集） */
  category: "create" | "modify" | "delete" | "query" | "style" | "layout" | "data" | "flow";
  /** 任务涉及的页面/节点范围（可选，帮助工具定位） */
  scope?: {
    pageId?: string;
    nodeIds?: string[];
  };
  /** 任务执行所需的额外上下文 */
  context?: Record<string, unknown>;
}

/**
 * Plan 阶段的完整产出
 */
export interface PlanOutput {
  /** 用户意图摘要（自然语言，一句话） */
  intentSummary: string;
  /** 完整方案描述（展示给用户确认） */
  planDescription: string;
  /** 拆分的任务列表（含执行顺序和依赖关系） */
  tasks: PlanTask[];
  /** 影响范围概述 */
  impactScope?: string;
}

// ─── MasterState ──────────────────────────────────────────────────────────────

/**
 * MasterGraph 统一状态。
 *
 * 管线：START → plan ↔ humanGate → execute → assemble → audit → summarize → extractMemory → END
 */
export const MasterStateAnnotation = Annotation.Root({
  // ─── 五层上下文 ─────────────────────────────────────────────────────────────
  /**
   * L4 + L5 的载体：对话消息。
   *
   * 组成结构（由 banyan 后端在请求时构建）：
   * - L4 部分：最近几轮的完整消息（HumanMessage / AIMessage）
   * - L5 部分：当前用户输入（最后一条 HumanMessage）
   * - 运行时追加：humanGate 反馈时，结构化追加到最后一条 HumanMessage 之后
   *
   * 注意：L2（AgentMemory）和 L3（ContextSummary）不在 messages 中，
   * 它们是 banyan 后端作为独立字段传给 XiangDi 服务的。
   */
  messages: Annotation<BaseMessage[]>({
    reducer: messagesReducer,
    default: () => [],
  }),
  /** L1: 系统提示词（角色定义 + 工具定义 + 通用规则，节点 Schema 由 knowledge_search 工具按需提供） */
  systemPrompt: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),
  /**
   * L2: Agent 记忆（经验 + 事实，含用户偏好）。
   *
   * 由 banyan 后端从 MongoDB AgentMemory 集合检索相关记忆后格式化传入。
   * 包含历史任务的经验教训、积累的稳定事实和用户偏好，对规划和执行都有指导价值。
   */
  agentMemory: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),
  /**
   * L3: 历史对话摘要（未选中 round 的 roundSummary 拼接）。
   *
   * 由 banyan 后端 ContextBuilder 动态生成：对未选中的 round，拼接其 roundSummary。
   * XiangDi 服务不负责管理 L3 的持久化和融合逻辑。
   */
  contextSummary: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),
  /** 项目级规范（可选，由外部注入） */
  projectSpec: Annotation<ProjectSpec | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  // ─── Intent 阶段（Phase 2: ADR-039）────────────────────────────────────────
  /** Intent 节点分类结果 */
  intentResult: Annotation<IntentResult | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  // ─── Respond 阶段（Phase 2: ADR-039）────────────────────────────────────────
  /** Respond 节点产生的消息（含 readonlyTools ReAct） */
  respondMessages: Annotation<BaseMessage[]>({
    reducer: messagesReducer,
    default: () => [],
  }),
  /** Respond 节点使用的只读工具调用记录（用于 summarize 判断） */
  readonlyToolCalls: Annotation<number>({
    reducer: (_, update) => update,
    default: () => 0,
  }),

  // ─── Plan 阶段 ─────────────────────────────────────────────────────────────
  /** Plan 的完整产出（方案 + 任务列表） */
  planOutput: Annotation<PlanOutput | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),
  /** Plan 轮次计数（plan↔humanGate 循环次数） */
  planIterations: Annotation<number>({
    reducer: (_, update) => update,
    default: () => 0,
  }),

  // ─── HumanGate 阶段 ────────────────────────────────────────────────────────
  /** 人工审批是否通过（默认 true 即 autoRun） */
  humanApproved: Annotation<boolean>({
    reducer: (_, update) => update,
    default: () => true,
  }),

  // ─── Execute 阶段 ──────────────────────────────────────────────────────────
  /** SubAgent 结果列表（与 tasks 1:1 对应） */
  subResults: Annotation<SubAgentResult[]>({
    reducer: (curr, update) => [...curr, ...update],
    default: () => [],
  }),
  /** Execute 阶段的最大迭代次数（每个 task 内的 think↔tools 循环上限） */
  maxIterations: Annotation<number>({
    reducer: (_, update) => update,
    default: () => 30,
  }),
  /** 最终生成的文本回复（最后一次 LLM 输出） */
  finalText: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),

  // ─── Assemble 阶段 ─────────────────────────────────────────────────────────
  /** 组装计划（多 task 场景），单 task 时为 null */
  assemblyPlan: Annotation<AssemblyPlan | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  // ─── Audit 阶段 ────────────────────────────────────────────────────────────
  /** 审计结果 */
  auditResult: Annotation<AuditResult | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),
  /** 审计重试次数 */
  auditRetries: Annotation<number>({
    reducer: (_, update) => update,
    default: () => 0,
  }),
  /** 审计失败时的错误摘要（注入回 Execute 让 LLM 知道问题） */
  auditErrorSummary: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),

  // ─── Summary（阶段性小结 → 整轮总结）──────────────────────────────────────
  /**
   * Plan 阶段小结（plan↔humanGate 循环结束后生成）。
   * 记录：最终确认的方案、迭代了几次、用户的关键反馈。
   */
  planPhaseSummary: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),
  /**
   * Execute 阶段小结（execute↔audit 循环结束后生成）。
   * 记录：执行了哪些任务、审计情况、最终结果概述。
   */
  executePhaseSummary: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),
  /**
   * 整轮对话总结（summarize 节点生成，综合两阶段小结）。
   *
   * 通过 SSE round_summary 事件推给 banyan 后端。
   * 后端持久化到 MongoDB，下一轮对话时：
   * - 如果该 round 被语义检索命中 → 展开原始消息保留在 L4
   * - 如果未被选中 → 其 roundSummary 拼接进 L3（ContextSummary）
   */
  roundSummary: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),

  // ─── Conflict Detection（保留，用于未来消歧）────────────────────────────────
  /** 挂起的冲突报告 + 消歧选项 */
  conflictPending: Annotation<{ report: ConflictReport; options: DisambiguationOptions } | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  // ─── Multi-Agent Planning（ADR-032/034）──────────────────────────────────
  /** 中断时的状态快照（断点恢复用） */
  planningSnapshot: Annotation<PlanningSnapshot | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),
  /** ResumeClassifier 的分类结果（恢复路由用） */
  resumeIntent: Annotation<ResumeClassification | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),
});

export type MasterState = typeof MasterStateAnnotation.State;

// ─── Execute SubGraph State（内嵌的 think↔tools 循环）────────────────────────

/**
 * Execute 子图状态。
 *
 * 每个并行执行的 task 都有自己独立的 ExecuteState，
 * 包含 L1（systemPrompt）+ L2（agentMemory）+ 该 task 的具体描述。
 */
export const ExecuteStateAnnotation = Annotation.Root({
  /** 该 task 的消息历史（独立于主图的 messages） */
  messages: Annotation<BaseMessage[]>({
    reducer: messagesReducer,
    default: () => [],
  }),
  /** L1: 系统提示词 */
  systemPrompt: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),
  /** L2: Agent 记忆（经验 + 事实，含用户偏好），与主图共享 */
  agentMemory: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),
  /** 当前 task 描述（来自 PlanTask） */
  taskDescription: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),
  /** 当前 task ID */
  taskId: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),
  /** think 迭代次数 */
  iteration: Annotation<number>({
    reducer: (_, update) => update,
    default: () => 0,
  }),
  /** 最大 think 迭代次数 */
  maxIterations: Annotation<number>({
    reducer: (_, update) => update,
    default: () => 30,
  }),
  /** 该 task 的最终文本输出 */
  finalText: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),
  /** 审计不通过时注入的错误信息 */
  auditErrors: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),
});

export type ExecuteState = typeof ExecuteStateAnnotation.State;
