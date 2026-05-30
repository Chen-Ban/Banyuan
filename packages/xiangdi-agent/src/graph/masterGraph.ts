/**
 * 相地 · MasterGraph V2 —— 统一 Agent 管线
 *
 * 管线：
 *   START → plan ↔ humanGate → execute → assemble → audit → summarize → extractMemory → END
 *
 * 五层上下文模型：
 *   L1: SystemPrompt   — 系统能力描述（AISchema + 工具定义 + 通用规则）
 *   L2: AgentMemory    — Agent 经验 + 事实（从历史任务中积累的认知）
 *   L3: ContextSummary — 历史对话摘要（未选中 round 的 roundSummary 拼接，由 banyan 后端动态生成）
 *   L4: RecentMessages — 对话历史（最近几轮的完整消息交互）
 *   L5: CurrentPrompt  — 当前用户输入
 *
 * Plan 节点接收全部 5 层作为输入进行意图识别。
 * Execute 节点接收 L1 + L2 + task.description（精简但包含经验指导）。
 *
 * HumanGate 反馈机制：
 *   不是简单追加一句话，而是将「系统方案 + 用户澄清」结构化追加到 L5 后面，
 *   形成完整的 CoT 链条，让 Plan 精确理解修正意图。
 *
 * Summary 生成（L4 → L3 的增量融入）：
 *   - plan↔humanGate 结束 → planPhaseSummary
 *   - execute↔audit 结束 → executePhaseSummary
 *   - summarize 节点 → roundSummary（综合两阶段）→ SSE 推给 banyan 后端持久化
 *   - 后端 ContextBuilder 动态构建 L3（未选中 round 的摘要拼接）和 L4（命中 round 的原始消息）
 *
 * 记忆提取（extractMemory 节点）：
 *   - 在 summarize 之后执行
 *   - 分析本轮执行过程，提取经验（Episode）+ 事实（Fact）
 *   - 通过 SSE memory_update 事件推给 banyan 后端持久化到 AgentMemory 集合
 */
import { StateGraph, START, END, interrupt } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { MasterStateAnnotation, type MasterState, type PlanOutput, type PlanTask } from "./state.js";
import type { LLMClient } from "../core/llmTypes.js";
import type { ToolRegistry } from "../core/ToolRegistry.js";
import type { StreamCallback, Message, MessageContent } from "../core/types.js";
import type { AuditResult } from "../orchestration/types.js";
import { createExtractMemoryNode } from "./nodes/extractMemoryNode.js";
import { PlanningOrchestrator, type PlanningResult } from "./planningAgents/PlanningOrchestrator.js";
import { classifyResumeIntent } from "./resume/ResumeClassifier.js";
import { handleContinue, handleRefine, handleRestart } from "./resume/strategies.js";
import type { PlanningSnapshot } from "./resume/types.js";

// ─── Config ──────────────────────────────────────────────────────────────────

export interface MasterGraphConfig {
  llmClient: LLMClient;
  toolRegistry: ToolRegistry;
  /** Stream callback for SSE events */
  streamCallback?: StreamCallback;
  /** Enable memory extraction (default: true) */
  enableMemoryExtraction?: boolean;
  /** Memory extraction model override */
  memoryExtractionModel?: string;
  /** Tool call threshold for memory extraction (default: 2) */
  memoryMinToolCalls?: number;
  /** Max audit retries (default: 2) */
  maxAuditRetries?: number;
  /** Auto-approve humanGate (default: true, set false for human-in-the-loop) */
  autoRun?: boolean;
  /** Max plan iterations (plan↔humanGate loop limit, default: 3) */
  maxPlanIterations?: number;
  /** Optional checkpointer for graph state persistence */
  checkpointer?: BaseCheckpointSaver;
  /**
   * 启用多智能体规划管线（ADR-032）。
   * true: START → planning（PlanningOrchestrator 四 Agent）→ humanGate → execute → ...
   * false: START → plan（单次 LLM 规划）→ humanGate → execute → ...
   * 默认 false（渐进式迁移）
   */
  enableMultiAgentPlanning?: boolean;
  /** 记忆存储根路径（多 Agent 模式时需要） */
  memoryStoragePath?: string;
}

// ─── Prompts ─────────────────────────────────────────────────────────────────

const PLAN_SYSTEM_PROMPT = `你是相地（XiangDi）的规划模块，负责理解用户意图并生成执行方案。

## 你的职责

1. **意图识别**：准确理解用户想要做什么（新建页面？修改元素？调整样式？数据操作？）
2. **方案生成**：将用户需求翻译为具体的、可执行的方案描述
3. **任务拆分**：将方案拆解为有序的任务列表，标注依赖关系

## 输入上下文

你会收到五层上下文：
- L2(Agent记忆): 从历史任务中积累的经验和事实，包含可复用的教训
- L3(记忆锚点): 更早对话的压缩摘要，帮助理解长期上下文
- L4(对话历史): 最近几轮的完整消息交互
- L5(当前请求): 用户本次输入

如果 L5 中包含「方案确认」结构（系统方案 + 用户反馈），说明用户对上一次方案不满意，
你需要根据用户的具体反馈修正方案。

如果 L2 中有相关经验教训，请在规划时参考，避免重蹈覆辙。

## 任务拆分规则

1. 简单请求（如"把按钮变红"）→ 1 个 task
2. 复杂请求（如"生成完整登录页面"）→ 多个 task
3. 有依赖的任务：dependsOn 列出前置 task ID
4. 无依赖的任务：dependsOn 为空（可并行）
5. category: create/modify/delete/query/style/layout/data/flow

## 输出格式（严格 JSON）

{
  "intentSummary": "一句话描述用户意图",
  "planDescription": "详细方案描述（Markdown 格式，用于展示给用户确认）",
  "impactScope": "影响范围",
  "tasks": [
    {
      "taskId": "task_0",
      "description": "具体任务描述（作为执行阶段的 prompt）",
      "dependsOn": [],
      "priority": 0,
      "category": "create",
      "scope": { "pageId": "...", "nodeIds": ["..."] },
      "context": {}
    }
  ]
}`;

const AUDIT_SYSTEM_PROMPT = `你是一个 UI 页面审计专家。给定生成的页面内容和用户的原始需求，验证结果是否满足要求。

验证维度：
1. 需求覆盖：用户要求的所有元素是否都已生成
2. 布局合理性：元素位置和尺寸是否合理
3. 数据一致性：节点属性是否有效（如颜色格式、尺寸为正数等）

输出格式（严格 JSON）：
{
  "passed": true/false,
  "issues": [
    {
      "severity": "error|warning|info",
      "category": "layout|overflow|visibility|data_binding|event_wiring|style",
      "message": "问题描述",
      "suggestion": "修复建议"
    }
  ]
}`;

const SUMMARIZE_SYSTEM_PROMPT = `你是一个对话总结助手。根据给定的阶段性小结，生成一个简洁的整轮对话摘要。

要求：
1. 摘要应包含：用户意图、执行方案要点、最终结果
2. 控制在 200 字以内
3. 用第三人称描述（"用户要求..."、"系统执行了..."）
4. 如果方案经过修改，提及关键修改点
5. 只返回纯文本摘要`;

// ─── MasterGraph Factory ─────────────────────────────────────────────────────

/**
 * 创建 MasterGraph V2。XiangDi 的唯一入口图。
 */
export function createMasterGraph(config: MasterGraphConfig) {
  const {
    llmClient,
    toolRegistry,
    streamCallback,
    enableMemoryExtraction = true,
    memoryExtractionModel,
    memoryMinToolCalls,
    maxAuditRetries = 2,
    autoRun = true,
    maxPlanIterations = 3,
    enableMultiAgentPlanning = false,
    memoryStoragePath = '.xiangdi/memory',
  } = config;

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── Plan Node ─────────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════
  /**
   * 核心意图识别 + 方案规划 + 任务拆分节点。
   *
   * 接收五层上下文（L1~L5），输出 PlanOutput。
   * 如果 messages 末尾有结构化的方案确认反馈（来自 humanGate），
   * Plan 会读到完整的 CoT 链条（原始请求 → 系统方案 → 用户纠正）来修正方案。
   */
  async function planNode(state: MasterState): Promise<Partial<MasterState>> {
    streamCallback?.({ type: "text_delta", data: { text: "" } }); // 触发 SSE 连接

    // 构建 Plan 的输入 prompt，注入五层上下文
    const contextSections: string[] = [];

    // L2: Agent 记忆（经验 + 事实）
    if (state.agentMemory) {
      contextSections.push(`## L2: Agent 记忆\n${state.agentMemory}`);
    }

    // L3: 历史对话摘要
    if (state.contextSummary) {
      contextSections.push(`## L3: 历史对话摘要\n${state.contextSummary}`);
    }

    // L4 + L5: 从 messages 中提取对话历史和当前请求
    const conversationContext = formatMessagesForPlan(state.messages);
    if (conversationContext) {
      contextSections.push(`## L4+L5: 对话历史与当前请求\n${conversationContext}`);
    }

    const userContent = contextSections.join("\n\n---\n\n");
    const planMessages: Message[] = [{ role: "user", content: userContent }];

    const response = await llmClient.createMessage({
      model: "deepseek-v4-pro",
      max_tokens: 4096,
      system: PLAN_SYSTEM_PROMPT,
      messages: planMessages,
      temperature: 0.3,
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const planOutput = textBlock && textBlock.type === "text"
      ? parsePlanOutput(textBlock.text)
      : fallbackPlanOutput(state.messages);

    // 通过 SSE 发送方案给前端展示
    streamCallback?.({
      type: "text_delta",
      data: { text: `\n📋 **执行方案**\n${planOutput.planDescription}\n` },
    });

    return {
      planOutput,
      planIterations: state.planIterations + 1,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── Planning Node（Multi-Agent，ADR-032）─────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════
  /**
   * 多智能体规划节点。
   *
   * 内部调度 PlanningOrchestrator（PM → Arch → Visual → Task）。
   * 支持中断恢复：若存在 planningSnapshot，先分类意图再按策略恢复。
   * 输出转换为 PlanOutput 格式，保持下游 humanGate/execute 兼容。
   */
  async function planningNode(state: MasterState): Promise<Partial<MasterState>> {
    streamCallback?.({ type: "text_delta", data: { text: "" } });

    const orchestrator = new PlanningOrchestrator({
      llmClient,
      toolRegistry,
      memoryStoragePath,
      streamCallback,
      defaultModel: "deepseek-chat",
      enableDegradation: true,
    });

    // 提取用户消息
    const lastUserMsg = [...state.messages].reverse().find((m) => m._getType() === "human");
    const userMessage = lastUserMsg
      ? (typeof lastUserMsg.content === "string" ? lastUserMsg.content : JSON.stringify(lastUserMsg.content))
      : "";

    const conversationContext = formatMessagesForPlan(state.messages);

    let result: PlanningResult;

    // 中断恢复场景
    if (state.planningSnapshot) {
      const snapshot: PlanningSnapshot = state.planningSnapshot;

      // 分类用户意图
      const classification = await classifyResumeIntent(
        { llmClient, streamCallback },
        { userMessage, snapshot },
      );

      if (classification.intent === 'clarify') {
        // 置信度低，返回 clarify 状态等待确认（不执行规划）
        return {
          resumeIntent: classification,
          planOutput: state.planOutput,
          planIterations: state.planIterations + 1,
        };
      }

      // 按策略恢复
      switch (classification.intent) {
        case 'continue':
          result = await handleContinue(orchestrator, snapshot, { signal: undefined, conversationContext });
          break;
        case 'refine':
          result = await handleRefine(
            orchestrator,
            snapshot,
            classification.affectedAgent ?? 'pm',
            userMessage,
            { signal: undefined, conversationContext },
          );
          break;
        case 'restart':
          result = await handleRestart(orchestrator, userMessage, { signal: undefined, conversationContext });
          break;
        default:
          result = await orchestrator.run(userMessage, { conversationContext });
      }
    } else {
      // 正常规划：从头执行四 Agent 管线
      result = await orchestrator.run(userMessage, { conversationContext });
    }

    // 将 PlanningResult 转换为 PlanOutput（保持下游兼容）
    const planOutput = planningResultToPlanOutput(result);

    // 保存快照（供后续中断恢复）
    const snapshot = orchestrator.createSnapshot(
      'execute',
      result.artifacts,
      `planning-${Date.now()}`,
      planOutput.planDescription,
    );

    // SSE 推送方案
    streamCallback?.({
      type: "text_delta",
      data: { text: `\n📋 **执行方案**\n${planOutput.planDescription}\n` },
    });

    return {
      planOutput,
      planIterations: state.planIterations + 1,
      planningSnapshot: snapshot,
      resumeIntent: null,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── HumanGate Node ────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════
  /**
   * Human-in-the-Loop 审批节点。
   *
   * - autoRun=true：直接通过，生成 planPhaseSummary
   * - autoRun=false：通过 interrupt() 等待外部 resume
   *
   * 不通过时的反馈机制：
   *   外部（前端/banyan 后端）将用户反馈结构化追加到 messages 末尾：
   *
   *   ```
   *   [HumanMessage]
   *   ---
   *   [方案确认]
   *   系统方案: "{planOutput.planDescription}"
   *   用户反馈: "{用户输入的修改意见}"
   *   ```
   *
   *   然后设置 humanApproved=false，图会路由回 plan。
   *   Plan 从 messages 末尾读到这个结构化的 CoT 链条，精确理解修正意图。
   */
  async function humanGateNode(state: MasterState): Promise<Partial<MasterState>> {
    if (autoRun) {
      const planPhaseSummary = generatePlanPhaseSummary(state);
      return { humanApproved: true, planPhaseSummary };
    }

    // Human-in-the-loop 模式：通过 LangGraph interrupt() 暂停图执行
    // 等待外部（banyan 后端）通过 POST /ai/resume 传入 resumeValue
    const resumeValue = interrupt({
      type: "humanGate",
      planDescription: state.planOutput?.planDescription ?? "",
      intentSummary: state.planOutput?.intentSummary ?? "",
      tasks: state.planOutput?.tasks?.map(t => ({ taskId: t.taskId, description: t.description })) ?? [],
    });

    // resumeValue 结构：{ approved: boolean, feedback?: string }
    const response = resumeValue as { approved?: boolean; feedback?: string } | undefined;
    const approved = response?.approved ?? true;

    if (approved) {
      const planPhaseSummary = generatePlanPhaseSummary(state);
      return { humanApproved: true, planPhaseSummary };
    }

    // 用户拒绝：将反馈结构化追加到 messages，让 Plan 节点理解修正意图
    const feedback = response?.feedback ?? "请修改方案";
    const feedbackMessage = new HumanMessage(
      `---\n[方案确认]\n系统方案: "${state.planOutput?.planDescription ?? ""}"\n用户反馈: "${feedback}"\n---`
    );

    return {
      humanApproved: false,
      messages: [feedbackMessage],
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── Execute Node（按拓扑序并发 Agentic Loop）──────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════
  /**
   * 核心执行节点。
   *
   * 根据 PlanOutput.tasks 的依赖关系，按拓扑序执行：
   * - 无依赖的 task → Promise.all 并行（多 LLM 实例）
   * - 有依赖的 task → 等前置完成后再执行
   *
   * 每个 task 只注入 L1 + L2（Agent 记忆）+ task.description（精简上下文，目标明确）。
   */
  async function executeNode(state: MasterState): Promise<Partial<MasterState>> {
    const tasks = state.planOutput?.tasks ?? [];
    if (tasks.length === 0) {
      return { finalText: "无任务需要执行。" };
    }

    const layers = topologicalSort(tasks);
    let finalText = "";
    let allMessages: BaseMessage[] = [];

    for (const layer of layers) {
      // 同一层内并行执行
      const layerResults = await Promise.all(
        layer.map((task) => executeTask(task, state))
      );

      for (const result of layerResults) {
        finalText = result.finalText || finalText;
        allMessages = [...allMessages, ...result.messages];
      }
    }

    return {
      messages: allMessages,
      finalText,
      auditErrorSummary: "",
    };
  }

  /**
   * 执行单个 task 的 Agentic Loop（think↔tools）
   */
  async function executeTask(
    task: PlanTask,
    state: MasterState
  ): Promise<{ finalText: string; messages: BaseMessage[] }> {
    const maxIter = state.maxIterations;
    let iteration = 0;
    let finalText = "";

    // 构建 task prompt
    let taskPrompt = `请执行以下任务：\n\n${task.description}`;
    if (task.scope) {
      taskPrompt += `\n\n操作范围：${JSON.stringify(task.scope)}`;
    }
    if (state.auditErrorSummary) {
      taskPrompt += `\n\n⚠️ 上一次执行未通过审计，需要修复的问题：\n${state.auditErrorSummary}`;
    }

    // Execute 的 system prompt = L1 + L2
    let execSystemPrompt = state.systemPrompt || "";
    if (state.agentMemory) {
      execSystemPrompt += `\n\n---\n## Agent 记忆（历史经验参考）\n${state.agentMemory}`;
    }

    const currentMessages: BaseMessage[] = [new HumanMessage(taskPrompt)];

    while (iteration < maxIter) {
      iteration++;

      // Think: Call LLM（流式，逐 token 推送 text_delta）
      const xiangdiMessages = langchainToXiangdi(currentMessages);
      let streamedText = "";
      const response = await llmClient.createMessageStream(
        {
          model: "deepseek-v4-pro",
          max_tokens: 8192,
          system: execSystemPrompt,
          messages: xiangdiMessages,
          tools: toolRegistry.isEmpty ? undefined : toolRegistry.getDefinitions(),
          temperature: 0.7,
        },
        (token) => {
          streamedText += token;
          streamCallback?.({ type: "text_delta", data: { text: token } });
        }
      );

      const toolCalls: Array<{ id: string; name: string; args: Record<string, unknown>; type: "tool_call" }> = [];
      const textParts: string[] = [];

      // 工具调用路径（降级为非流式）从 response.content 解析
      // 纯文本路径 streamedText 已由 onToken 拼完，直接用
      for (const block of response.content) {
        if (block.type === "text" && block.text) {
          // 有工具调用时（降级非流式），text 可能未经 onToken 推送，补推一次
          if (!streamedText && block.text) {
            textParts.push(block.text);
            finalText = block.text;
            streamCallback?.({ type: "text_delta", data: { text: block.text } });
          } else {
            textParts.push(streamedText || block.text);
            finalText = streamedText || block.text;
          }
        } else if (block.type === "tool_use") {
          toolCalls.push({ id: block.id, name: block.name, args: block.input, type: "tool_call" });
        }
      }

      // 纯文本流式路径：response.content 只有空 text 块，用 streamedText
      if (textParts.length === 0 && streamedText) {
        textParts.push(streamedText);
        finalText = streamedText;
      }

      const aiMessage = new AIMessage({
        content: textParts.join("\n"),
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      });
      currentMessages.push(aiMessage);

      // 路由：结束 or 继续工具调用
      if (response.stop_reason !== "tool_use" || toolCalls.length === 0) {
        break;
      }

      // Act: Execute tools
      for (const tc of toolCalls) {
        streamCallback?.({ type: "tool_call", data: { id: tc.id, name: tc.name, input: tc.args } });

        const { result, is_error } = await toolRegistry.execute(tc.name, tc.args);
        const resultStr = typeof result === "string" ? result : JSON.stringify(result);

        streamCallback?.({ type: "tool_result", data: { tool_use_id: tc.id, name: tc.name, result, is_error } });

        currentMessages.push(new ToolMessage({ content: resultStr, tool_call_id: tc.id, name: tc.name }));
      }
    }

    return { finalText, messages: currentMessages.slice(1) };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── Assemble Node ─────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════
  async function assembleNode(_state: MasterState): Promise<Partial<MasterState>> {
    return {};
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── Audit Node ────────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════
  /**
   * 审计节点。不通过时携带错误信息回到 execute。
   * 通过（或达到重试上限）时生成 executePhaseSummary。
   */
  async function auditNode(state: MasterState): Promise<Partial<MasterState>> {
    if (!state.finalText) {
      const executePhaseSummary = generateExecutePhaseSummary(state, { passed: true, issues: [] });
      return { auditResult: { passed: true, issues: [] }, auditRetries: state.auditRetries + 1, executePhaseSummary };
    }

    const intentSummary = state.planOutput?.intentSummary ?? "";
    const auditPrompt = [
      `## 用户原始需求\n${intentSummary}`,
      `## 执行方案\n${state.planOutput?.planDescription ?? "N/A"}`,
      `## 执行结果摘要\n${state.finalText.slice(0, 3000)}`,
      `\n请验证执行结果是否满足用户需求。`,
    ].join("\n\n");

    try {
      const response = await llmClient.createMessage({
        model: "deepseek-v4-pro",
        max_tokens: 1024,
        system: AUDIT_SYSTEM_PROMPT,
        messages: [{ role: "user", content: auditPrompt }],
        temperature: 0.1,
      });

      const textBlock = response.content.find((b) => b.type === "text");
      const auditResult = textBlock && textBlock.type === "text"
        ? parseAuditResponse(textBlock.text)
        : { passed: true, issues: [] };

      // 构建错误摘要
      let auditErrorSummary = "";
      if (!auditResult.passed) {
        const errorIssues = auditResult.issues.filter((i) => i.severity === "error");
        const warningIssues = auditResult.issues.filter((i) => i.severity === "warning");
        const parts: string[] = [];
        if (errorIssues.length > 0) {
          parts.push("错误：\n" + errorIssues.map((i) => `- [${i.category}] ${i.message}${i.suggestion ? `（建议：${i.suggestion}）` : ""}`).join("\n"));
        }
        if (warningIssues.length > 0) {
          parts.push("警告：\n" + warningIssues.map((i) => `- [${i.category}] ${i.message}${i.suggestion ? `（建议：${i.suggestion}）` : ""}`).join("\n"));
        }
        auditErrorSummary = parts.join("\n\n");
      }

      const shouldSummarize = auditResult.passed || state.auditRetries + 1 >= maxAuditRetries;
      const executePhaseSummary = shouldSummarize
        ? generateExecutePhaseSummary(state, auditResult)
        : state.executePhaseSummary;

      return { auditResult, auditRetries: state.auditRetries + 1, auditErrorSummary, executePhaseSummary };
    } catch {
      const executePhaseSummary = generateExecutePhaseSummary(state, { passed: true, issues: [] });
      return { auditResult: { passed: true, issues: [] }, auditRetries: state.auditRetries + 1, executePhaseSummary };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── Summarize Node ────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════
  /**
   * 整轮总结节点。
   * 综合 planPhaseSummary + executePhaseSummary → roundSummary。
   * 通过 SSE round_summary 推给 banyan 后端持久化。
   * 后端负责将其增量融入 L4 或保留在 L5。
   */
  async function summarizeNode(state: MasterState): Promise<Partial<MasterState>> {
    const { planPhaseSummary, executePhaseSummary } = state;

    if (!planPhaseSummary && !executePhaseSummary) {
      return { roundSummary: "" };
    }

    const summaryInput = [
      planPhaseSummary ? `Plan 阶段：${planPhaseSummary}` : "",
      executePhaseSummary ? `Execute 阶段：${executePhaseSummary}` : "",
    ].filter(Boolean).join("\n\n");

    try {
      const response = await llmClient.createMessage({
        model: "deepseek-v4-pro",
        max_tokens: 512,
        system: SUMMARIZE_SYSTEM_PROMPT,
        messages: [{ role: "user", content: summaryInput }],
        temperature: 0.2,
      });

      const textBlock = response.content.find((b) => b.type === "text");
      const roundSummary = textBlock && textBlock.type === "text"
        ? textBlock.text.trim()
        : `${state.planOutput?.intentSummary ?? "用户请求"}。执行完成。`;

      // SSE 推送 roundSummary 给 banyan 后端持久化
      streamCallback?.({
        type: "round_summary",
        data: { summary: roundSummary },
      });

      return { roundSummary };
    } catch {
      const fallbackSummary = `${state.planOutput?.intentSummary ?? "用户请求"}。${state.auditResult?.passed ? "执行成功" : "执行完成"}。`;
      streamCallback?.({
        type: "round_summary",
        data: { summary: fallbackSummary },
      });
      return { roundSummary: fallbackSummary };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── ExtractMemory Node ──────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════
  const extractMemoryNodeFn = createExtractMemoryNode({
    llmClient,
    streamCallback,
    enabled: enableMemoryExtraction,
    model: memoryExtractionModel,
    minToolCalls: memoryMinToolCalls,
  });

  async function extractMemoryWrapper(state: MasterState): Promise<Partial<MasterState>> {
    await extractMemoryNodeFn({
      messages: state.messages,
      roundSummary: state.roundSummary,
      auditResult: state.auditResult,
      auditRetries: state.auditRetries,
      planOutput: state.planOutput,
    });
    return {};
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── Routing Functions ─────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  function routeAfterHumanGate(state: MasterState): "execute" | "plan" | "__end__" {
    if (state.humanApproved) {
      return "execute";
    }
    if (state.planIterations < maxPlanIterations) {
      return "plan";
    }
    return "__end__";
  }

  function routeAfterAudit(state: MasterState): "execute" | "summarize" {
    if (!state.auditResult?.passed && state.auditRetries < maxAuditRetries) {
      return "execute";
    }
    return "summarize";
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── Build the Graph ───────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  // 根据配置选择规划节点
  const planNodeName = "plan";
  const planNodeFn = enableMultiAgentPlanning ? planningNode : planNode;

  const graph = new StateGraph(MasterStateAnnotation)
    .addNode(planNodeName, planNodeFn)
    .addNode("humanGate", humanGateNode)
    .addNode("execute", executeNode)
    .addNode("assemble", assembleNode)
    .addNode("audit", auditNode)
    .addNode("summarize", summarizeNode)
    .addNode("extractMemory", extractMemoryWrapper)
    // Edges
    .addEdge(START, planNodeName)
    .addEdge(planNodeName, "humanGate")
    .addConditionalEdges("humanGate", routeAfterHumanGate, {
      execute: "execute",
      plan: planNodeName,
      __end__: END,
    })
    .addEdge("execute", "assemble")
    .addEdge("assemble", "audit")
    .addConditionalEdges("audit", routeAfterAudit, {
      execute: "execute",
      summarize: "summarize",
    })
    .addEdge("summarize", "extractMemory")
    .addEdge("extractMemory", END);

  return graph.compile(config.checkpointer ? { checkpointer: config.checkpointer } : undefined);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Utility Functions ───────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 将 messages 格式化为 Plan 可理解的对话上下文。
 *
 * 保持消息的原始顺序和结构，特别是结构化的 humanGate 反馈。
 * Plan 直接看到完整的 CoT 链条。
 */
function formatMessagesForPlan(messages: BaseMessage[]): string {
  const parts: string[] = [];

  for (const msg of messages) {
    const type = msg._getType();
    const content = typeof msg.content === "string" ? msg.content : "";
    if (!content) continue;

    if (type === "human") {
      parts.push(`用户: ${content}`);
    } else if (type === "ai") {
      // AI 回复保留摘要（避免 Plan prompt 过长）
      parts.push(`助手: ${content.slice(0, 300)}${content.length > 300 ? "..." : ""}`);
    }
  }

  return parts.join("\n\n");
}

/**
 * 生成 Plan 阶段小结
 */
function generatePlanPhaseSummary(state: MasterState): string {
  const { planOutput, planIterations } = state;
  if (!planOutput) return "";

  const parts = [
    `意图：${planOutput.intentSummary}`,
    `方案：${planOutput.planDescription.slice(0, 100)}${planOutput.planDescription.length > 100 ? "..." : ""}`,
    `任务数：${planOutput.tasks.length}`,
  ];
  if (planIterations > 1) {
    parts.push(`经过 ${planIterations} 次规划调整`);
  }
  return parts.join("；");
}

/**
 * 生成 Execute 阶段小结
 */
function generateExecutePhaseSummary(state: MasterState, auditResult: AuditResult): string {
  const tasks = state.planOutput?.tasks ?? [];
  const parts = [`执行了 ${tasks.length} 个任务`];
  if (state.auditRetries > 1) {
    parts.push(`审计重试 ${state.auditRetries - 1} 次`);
  }
  if (auditResult.passed) {
    parts.push("审计通过");
  } else {
    const errorCount = auditResult.issues.filter((i) => i.severity === "error").length;
    parts.push(`审计未完全通过（${errorCount} 个错误）`);
  }
  if (state.finalText) {
    parts.push(`结果摘要：${state.finalText.slice(0, 100)}${state.finalText.length > 100 ? "..." : ""}`);
  }
  return parts.join("；");
}

/**
 * 拓扑排序：将 tasks 按依赖关系分层。
 * 返回 layers[]，每层内的 tasks 可并行执行。
 */
function topologicalSort(tasks: PlanTask[]): PlanTask[][] {
  if (tasks.length === 0) return [];
  if (tasks.length === 1) return [tasks];

  const taskMap = new Map(tasks.map((t) => [t.taskId, t]));
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const task of tasks) {
    inDegree.set(task.taskId, 0);
    adjacency.set(task.taskId, []);
  }

  for (const task of tasks) {
    for (const dep of task.dependsOn) {
      if (taskMap.has(dep)) {
        adjacency.get(dep)!.push(task.taskId);
        inDegree.set(task.taskId, (inDegree.get(task.taskId) ?? 0) + 1);
      }
    }
  }

  const layers: PlanTask[][] = [];
  let queue = tasks.filter((t) => (inDegree.get(t.taskId) ?? 0) === 0);

  while (queue.length > 0) {
    queue.sort((a, b) => a.priority - b.priority);
    layers.push([...queue]);

    const nextQueue: PlanTask[] = [];
    for (const task of queue) {
      for (const neighbor of adjacency.get(task.taskId) ?? []) {
        const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          const neighborTask = taskMap.get(neighbor);
          if (neighborTask) nextQueue.push(neighborTask);
        }
      }
    }
    queue = nextQueue;
  }

  // 处理可能的循环依赖
  const processedIds = new Set(layers.flat().map((t) => t.taskId));
  const remaining = tasks.filter((t) => !processedIds.has(t.taskId));
  if (remaining.length > 0) {
    layers.push(remaining);
  }

  return layers;
}

/**
 * Convert LangChain BaseMessage[] to XiangDi Message[] (Anthropic-style)
 */
function langchainToXiangdi(messages: BaseMessage[]): Message[] {
  const result: Message[] = [];

  for (const msg of messages) {
    const type = msg._getType();

    if (type === "human") {
      result.push({
        role: "user",
        content: typeof msg.content === "string" ? msg.content : msg.content as unknown as MessageContent,
      });
    } else if (type === "ai") {
      const aiMsg = msg as AIMessage;
      const content: Array<{ type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }> = [];

      if (typeof aiMsg.content === "string" && aiMsg.content) {
        content.push({ type: "text", text: aiMsg.content });
      }

      if (aiMsg.tool_calls && aiMsg.tool_calls.length > 0) {
        for (const tc of aiMsg.tool_calls) {
          content.push({
            type: "tool_use",
            id: tc.id ?? "",
            name: tc.name,
            input: tc.args as Record<string, unknown>,
          });
        }
      }

      if (content.length > 0) {
        result.push({ role: "assistant", content: content as unknown as MessageContent });
      }
    } else if (type === "tool") {
      const toolMsg = msg as ToolMessage;
      result.push({
        role: "user",
        content: [{
          type: "tool_result",
          tool_use_id: toolMsg.tool_call_id,
          content: typeof toolMsg.content === "string" ? toolMsg.content : "",
        }] as unknown as MessageContent,
      });
    }
  }

  return result;
}

/**
 * Parse plan LLM response to PlanOutput
 */
function parsePlanOutput(text: string): PlanOutput {
  const jsonMatch =
    text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/);

  if (!jsonMatch) {
    return { intentSummary: "无法解析", planDescription: text, tasks: [{ taskId: "task_0", description: text, dependsOn: [], priority: 0, category: "modify" }] };
  }

  try {
    const raw = JSON.parse(jsonMatch[1]) as Partial<PlanOutput>;
    return {
      intentSummary: raw.intentSummary ?? "用户请求",
      planDescription: raw.planDescription ?? "",
      impactScope: raw.impactScope,
      tasks: (raw.tasks ?? []).map((task, index) => ({
        taskId: task.taskId || `task_${index}`,
        description: task.description || "",
        dependsOn: task.dependsOn ?? [],
        priority: task.priority ?? index,
        category: task.category ?? "modify",
        scope: task.scope,
        context: task.context,
      })),
    };
  } catch {
    return { intentSummary: "解析失败", planDescription: text, tasks: [{ taskId: "task_0", description: text, dependsOn: [], priority: 0, category: "modify" }] };
  }
}

/**
 * Fallback: extract user prompt and create single task
 */
function fallbackPlanOutput(messages: BaseMessage[]): PlanOutput {
  const lastUserMsg = [...messages].reverse().find((m) => m._getType() === "human");
  const description = lastUserMsg
    ? (typeof lastUserMsg.content === "string" ? lastUserMsg.content : JSON.stringify(lastUserMsg.content))
    : "执行用户请求";

  return {
    intentSummary: description.slice(0, 100),
    planDescription: description,
    tasks: [{
      taskId: "task_0",
      description,
      dependsOn: [],
      priority: 0,
      category: "modify",
    }],
  };
}

/**
 * Parse audit LLM response
 */
function parseAuditResponse(text: string): AuditResult {
  const jsonMatch =
    text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/);

  if (!jsonMatch) {
    return { passed: true, issues: [] };
  }

  try {
    const raw = JSON.parse(jsonMatch[1]) as { passed?: boolean; issues?: AuditResult["issues"] };
    const issues = raw.issues ?? [];
    const hasErrors = issues.some((i) => i.severity === "error");
    return { passed: raw.passed ?? !hasErrors, issues };
  } catch {
    return { passed: true, issues: [] };
  }
}

/**
 * 将 PlanningOrchestrator 的 PlanningResult 转换为 PlanOutput（保持下游兼容）
 */
function planningResultToPlanOutput(result: PlanningResult): PlanOutput {
  const { featureList, techPlan, visualSpec, changeSpec } = result;

  // 生成方案描述
  const planDescription = [
    `## 功能需求（${featureList.features.length} 项）`,
    ...featureList.features.map((f, i) => `${i + 1}. **${f.title}**：${f.description}`),
    '',
    `## 技术方案`,
    `视图变更 ${techPlan.viewChanges.length} 项，Schema 变更 ${techPlan.schemaChanges.length} 项`,
    ...techPlan.viewChanges.map(v => `- [${v.action}] ${v.viewType}: ${v.description}`),
    '',
    `## 视觉规格`,
    `${visualSpec.pages.length} 个页面布局`,
    '',
    `## 执行任务（${changeSpec.tasks.length} 项）`,
    ...changeSpec.tasks.map((t, i) => `${i + 1}. ${t.description}`),
  ].join('\n');

  // 将 ChangeSpec.tasks 转为 PlanTask[]
  const tasks: PlanTask[] = changeSpec.tasks.map((task, index) => ({
    taskId: task.id,
    description: task.description,
    dependsOn: task.dependsOn ?? [],
    priority: index,
    category: 'modify' as const,
  }));

  return {
    intentSummary: featureList.features.map(f => f.title).join('、'),
    planDescription,
    impactScope: `${techPlan.viewChanges.length} 个视图变更，${techPlan.schemaChanges.length} 个 Schema 变更，${visualSpec.pages.length} 个页面`,
    tasks,
  };
}
