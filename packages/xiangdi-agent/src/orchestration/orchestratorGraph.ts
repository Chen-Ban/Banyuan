/**
 * Orchestrator 主图（ADR-041）
 *
 * StateGraph 实现：Orchestrator + 领域 SubAgent 统一管线。
 *
 * 主路径：
 *   START → [mode router] → respond（chat 模式直达） → END
 *                          → intent（task 模式）→ [startFrom router] → requirements → ui_design → contract → parallel_build
 *   parallel_build → audit → [router] → commit / rollback
 *   rollback → [router] → requirements / ui_design / contract / parallel_build
 *   commit → summarize → END
 *
 * 特征：
 *   - intent 节点决定入口点（fresh 或 inherit）
 *   - 规划阶段（requirements → ui_design → contract）串行执行
 *   - 构建阶段（frontend + backend）通过 Send API 并行执行
 *   - 审计节点验证引用完整性后，决定 commit 或 rollback
 *   - rollback 可退回任意规划/构建节点
 */
import { Annotation, StateGraph, START, END, Send } from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages";
import type { LLMClient } from "../core/index.js";
import type { DialoguePhase } from "./phases.js";
import type { SubAgentName } from "./protocol.js";
import type { ArtifactStore, IntentResult, AuditResult, RollbackResult, NodeExecution } from "./artifacts.js";
import type { OrchestratorSSECallback, DoneArtifactsOverview } from "./events.js";
import { createIntentNode } from "./nodes/intentNode.js";
import { createRespondNode } from "./nodes/respondNode.js";
import { createRequirementsNode } from "./nodes/requirementsNode.js";
import { createUIDesignNode } from "./nodes/uiDesignNode.js";
import { createContractNode } from "./nodes/contractNode.js";
import { createFrontendNode } from "./nodes/frontendNode.js";
import { createBackendNode } from "./nodes/backendNode.js";
import { createAuditNode } from "./nodes/auditNode.js";
import { createRollbackNode } from "./nodes/rollbackNode.js";
import { createCommitNode } from "./nodes/commitNode.js";
import { createSummarizeNode } from "./nodes/summarizeNode.js";
import type { FrontendToolHandlers, BackendToolHandlers } from "./nodes/workerTools.js";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// OrchestratorState Annotation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function messagesReducer(curr: BaseMessage[], update: BaseMessage[]): BaseMessage[] {
  return [...curr, ...update];
}

function executionsReducer(curr: NodeExecution[], update: NodeExecution[]): NodeExecution[] {
  // 合并策略：按 node 字段更新（相同 node 的记录替换，新 node 追加）
  const map = new Map(curr.map(e => [e.node, e]));
  for (const exec of update) {
    map.set(exec.node, exec);
  }
  return [...map.values()];
}

export type OrchestratorMode = 'task' | 'chat'

export const OrchestratorStateAnnotation = Annotation.Root({
  // ─── 模式（由前端 type 字段决定）─────────────────────────────────────────────
  /** task=走构建管线，chat=纯对话回复 */
  mode: Annotation<OrchestratorMode>({
    reducer: (_, update) => update,
    default: () => "task" as OrchestratorMode,
  }),

  // ─── 对话上下文 ────────────────────────────────────────────────────────────
  /** 对话历史（LangGraph 标准 messages channel） */
  messages: Annotation<BaseMessage[]>({
    reducer: messagesReducer,
    default: () => [],
  }),
  /** 本轮用户输入（从最后一条 HumanMessage 提取） */
  userMessage: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),
  /** 系统提示词（L1） */
  systemPrompt: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),
  /** Agent 记忆（L2） */
  agentMemory: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),
  /** 历史对话摘要（L3） */
  contextSummary: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),

  // ─── 管线状态 ──────────────────────────────────────────────────────────────
  /** 当前对话阶段 */
  phase: Annotation<DialoguePhase>({
    reducer: (_, update) => update,
    default: () => "start" as DialoguePhase,
  }),
  /** 工件仓库（各 SubAgent 的结构化产出） */
  artifacts: Annotation<ArtifactStore>({
    reducer: (_, update) => update,
    default: () => ({}),
  }),
  /** Intent 节点判断结果 */
  intentResult: Annotation<IntentResult | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),
  /** 审计节点结果 */
  auditResult: Annotation<AuditResult | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),
  /** 回退仲裁结果 */
  rollbackResult: Annotation<RollbackResult | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),
  /** 回退次数（硬上限 3） */
  rollbackCount: Annotation<number>({
    reducer: (_, update) => update,
    default: () => 0,
  }),
  /** 审计反馈（回退时注入目标节点的修正指令） */
  auditFeedback: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),
  /** SubAgent 执行记录（可观测性） */
  executions: Annotation<NodeExecution[]>({
    reducer: executionsReducer,
    default: () => [],
  }),
  /** Commit 阶段组装的产出概览（传递给 summarizeNode） */
  commitArtifacts: Annotation<DoneArtifactsOverview | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),
});

export type OrchestratorState = typeof OrchestratorStateAnnotation.State;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Graph 配置
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface OrchestratorGraphConfig {
  /** LLM 客户端（SubAgent 共用） */
  llm: LLMClient;
  /** SSE 事件推送回调 */
  sseCallback?: OrchestratorSSECallback;
  /** BanvasGL 版本号（commit 阶段写入） */
  banvasVersion: string;
  /** 前端 Worker 工具处理器（由 xiangdi-server 注入） */
  frontendToolHandlers?: FrontendToolHandlers;
  /** 后端 Worker 工具处理器（由 xiangdi-server 注入） */
  backendToolHandlers?: BackendToolHandlers;
  /** Worker LLM 模型标识（可覆盖，默认与主 llm 同模型） */
  workerModel?: string;
  /** Worker 最大循环次数（默认 15） */
  workerMaxIterations?: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 节点创建说明
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 所有节点通过工厂函数创建（注入 config），见下方 createOrchestratorGraph。
// 工厂定义在 ./nodes/ 目录下各文件中。

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 节点工厂注释
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 审计节点：由 createAuditNode 工厂创建
// 回退仲裁节点：由 createRollbackNode 工厂创建
// Commit 节点：由 createCommitNode 工厂创建（程序化，零 token）
// 总结节点：由 createSummarizeNode 工厂创建（LLM 生成变更摘要）

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 路由函数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** START 后路由：根据 mode 分流到 intent（任务管线）或 respond（纯对话） */
function routeByMode(state: OrchestratorState): string {
  return state.mode === 'chat' ? 'respond' : 'intent';
}

/** Intent 后路由：根据 startFrom 路由到对应管线节点 */
function routeAfterIntent(state: OrchestratorState): string {
  const intent = state.intentResult;
  if (!intent) return "requirements";

  const nodeMap: Record<SubAgentName, string> = {
    requirements: "requirements",
    uiDesign: "ui_design",
    contract: "contract",
    frontend: "parallel_build",
    backend: "parallel_build",
  };
  return nodeMap[intent.startFrom] ?? "requirements";
}

/** 审计后路由：commit 或 rollback */
function routeAfterAudit(state: OrchestratorState): string {
  const audit = state.auditResult;
  if (audit?.passed) return "commit";
  return "rollback";
}

/** 回退后路由：路由到目标节点 */
function routeAfterRollback(state: OrchestratorState): string {
  const rollback = state.rollbackResult;
  if (!rollback) return "requirements";

  const nodeMap: Record<SubAgentName, string> = {
    requirements: "requirements",
    uiDesign: "ui_design",
    contract: "contract",
    frontend: "parallel_build",
    backend: "parallel_build",
  };
  return nodeMap[rollback.target] ?? "requirements";
}

/** 并行构建：使用 Send API 同时触发 frontend + backend */
function routeToParallelBuild(_state: OrchestratorState): Send[] {
  return [
    new Send("frontend", {}),
    new Send("backend", {}),
  ];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 图构建工厂
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 创建 Orchestrator 主图
 *
 * 返回编译好的 CompiledGraph，可通过 .invoke() 或 .stream() 执行。
 */
export function createOrchestratorGraph(config: OrchestratorGraphConfig) {
  const nodeConfig = { llm: config.llm, sseCallback: config.sseCallback }

  const intentNode = createIntentNode(nodeConfig)
  const respondNode = createRespondNode(nodeConfig)
  const requirementsNode = createRequirementsNode(nodeConfig)
  const uiDesignNode = createUIDesignNode(nodeConfig)
  const contractNode = createContractNode(nodeConfig)
  const frontendNode = createFrontendNode({
    llm: config.llm,
    sseCallback: config.sseCallback,
    toolHandlers: config.frontendToolHandlers,
    model: config.workerModel,
    maxIterations: config.workerMaxIterations,
  })
  const backendNode = createBackendNode({
    llm: config.llm,
    sseCallback: config.sseCallback,
    toolHandlers: config.backendToolHandlers,
    model: config.workerModel,
    maxIterations: config.workerMaxIterations,
  })
  const auditNode = createAuditNode(nodeConfig)
  const rollbackNode = createRollbackNode(nodeConfig)
  const commitNodeFn = createCommitNode(nodeConfig)
  const summarizeNodeFn = createSummarizeNode(nodeConfig)

  const graph = new StateGraph(OrchestratorStateAnnotation)
    // ─── 节点注册 ────────────────────────────────────────────────────────────
    .addNode("intent", intentNode)
    .addNode("respond", respondNode)
    .addNode("requirements", requirementsNode)
    .addNode("ui_design", uiDesignNode)
    .addNode("contract", contractNode)
    .addNode("parallel_build", async (_state: OrchestratorState) => ({})) // pass-through 路由汇聚点
    .addNode("frontend", frontendNode)
    .addNode("backend", backendNode)
    .addNode("audit", auditNode)
    .addNode("rollback", rollbackNode)
    .addNode("commit", commitNodeFn)
    .addNode("summarize", summarizeNodeFn)

    // ─── 边定义 ──────────────────────────────────────────────────────────────
    // 入口：根据 mode 分流
    .addConditionalEdges(START, routeByMode, [
      "intent",
      "respond",
    ])

    // Intent 后路由（仅 task 模式才会到 intent）
    .addConditionalEdges("intent", routeAfterIntent, [
      "requirements",
      "ui_design",
      "contract",
      "parallel_build",
    ])

    // 纯对话直接结束
    .addEdge("respond", END)

    // 规划链：requirements → ui_design → contract → parallel_build
    .addEdge("requirements", "ui_design")
    .addEdge("ui_design", "contract")
    .addEdge("contract", "parallel_build")

    // parallel_build 出边：Send API 并行分发到 frontend + backend
    .addConditionalEdges("parallel_build", routeToParallelBuild, [
      "frontend",
      "backend",
    ])

    // 并行构建完成后汇聚到审计
    .addEdge("frontend", "audit")
    .addEdge("backend", "audit")

    // 审计后路由
    .addConditionalEdges("audit", routeAfterAudit, [
      "commit",
      "rollback",
    ])

    // 回退后路由到目标节点
    .addConditionalEdges("rollback", routeAfterRollback, [
      "requirements",
      "ui_design",
      "contract",
      "parallel_build",
    ])

    // Commit → Summarize → END
    .addEdge("commit", "summarize")
    .addEdge("summarize", END);

  return graph.compile();
}
