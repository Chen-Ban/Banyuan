# ADR-034：中断续接策略 —— ResumeClassifier + 产物失效传播

**状态**：已采纳  
**决策日期**：2026-05-30  
**决策者**：陈班

---

## 背景

### 问题场景

用户发送需求后，MasterGraph 开始执行规划管线（PMAgent → ArchAgent → VisualAgent → TaskPlannerAgent → Execute）。执行到中途时，用户从前端"打断"（stop），然后发送新消息。

当前实现的处理方式是：将用户新消息追加到消息列表末尾，继续执行。

这导致三个问题：

**问题一：语义歧义**。用户打断后说"继续"和"把按钮改成红色"和"不要了，帮我做登录页"是三种完全不同的意图，但当前实现一律当做"继续执行"处理。

**问题二：资源浪费**。用户只想修改颜色（Visual 层面），但当前实现会从断点继续走完整条管线，包括已经不需要重跑的 PMAgent 和 ArchAgent。

**问题三：状态污染**。用户的修正意见被追加到消息末尾，但 Plan 阶段已经完成了。LLM 在 Execute 阶段看到这条修正消息，会产生困惑——这是给谁的指令？

### 中断发生的时机

中断可能发生在管线的任何位置：

```
PMAgent 执行中      → 最少产物可复用
ArchAgent 执行中    → PMAgent 产物可复用
VisualAgent 执行中  → PM + Arch 产物可复用
TaskPlanner 执行中  → PM + Arch + Visual 产物可复用
Execute 执行中      → 全部规划产物可复用（只有执行需要重来或调整）
```

---

## 业界方案调研

### LangGraph Time-Travel / Fork

LangGraph 原生支持 Checkpoint + Fork 机制：
- 每个节点执行完后保存 checkpoint（状态快照）
- 中断后，可以从任意 checkpoint **Replay**（断点重跑）或 **Fork**（修改状态后分支执行）
- `update_state(checkpoint_config, values, as_node="nodeA")` 可以在某个节点处注入新状态，图从该节点的后继开始执行

**适用性**：解决了"从哪里恢复"的机械问题（基础设施），但不解决"应该从哪里恢复"的语义判定问题。

### DAG 失效传播（open-multi-agent / Temporal / React Query 风格）

将管线看作有向无环图（DAG），每个节点有产物（artifact）和输入依赖。当某个节点的输入发生变化时，该节点及所有下游节点的产物标记为"失效"（stale），需要重跑。

```
PMAgent → ArchAgent → VisualAgent → TaskPlanner → Execute
   │          │            │              │           │
   ▼          ▼            ▼              ▼           ▼
FeatureList  TechPlan  VisualSpec    ChangeSpec    Pages变更
```

失效传播规则：某节点输入变了 → 该节点 + 所有下游节点产物失效。

**适用性**：解决了"需要重跑哪些节点"的问题，但需要先判断"用户的修改影响了哪个节点的输入"。

### Microsoft Conductor 的 Interrupt & Resume

微软的 Conductor 项目（AI 编排框架）将中断分为两类：
- **Soft interrupt**：暂停当前执行，保留状态快照，可随时恢复
- **Hard interrupt**：中止当前执行，清理部分状态

恢复时通过 `workflow-resume` 机制，从上次的状态快照继续。但 Conductor 的场景是预定义 workflow（step 是确定性的），不涉及 LLM 重新规划。

### Claude Code / Cursor 的处理

这类 AI Coding Agent 的做法比较简单粗暴：
- 用户打断 = 当前 turn 作废，从新消息开始新 turn
- 不做断点恢复（因为 coding agent 的上下文是 workspace 状态，workspace 本身就是"checkpoint"）

**不适用于 XiangDi**：我们的规划产物（FeatureList/TechPlan/VisualSpec）不存在于 workspace 中，作废重来的成本太高。

---

## 决策

### 引入 ResumeClassifier：中断后的意图分类层

在用户打断后发送新消息时，不直接继续执行，而是先经过一个轻量 LLM 分类器（ResumeClassifier），判定用户意图属于以下哪种类型，然后分发到对应的恢复策略。

### 四种中断续接意图

```typescript
type ResumeIntent =
  | 'continue'       // "继续" / "go on" — 纯断点恢复
  | 'refine'         // "把颜色改成蓝色" — 局部修正，部分重跑
  | 'restart'        // "不要了，帮我做登录页" — 完全新需求，全部作废
  | 'clarify';       // "我说的表格是指数据表格" — 补充信息，回退到需要该信息的节点
```

### 架构概览

```
用户打断 → 前端发送 stop
              ↓
XiangDi 接到 abort 信号 → 保存当前执行快照（PlanningSnapshot）
              ↓
用户发送新消息
              ↓
┌─────────────────────────────────────────────────────────────┐
│                    ResumeClassifier                          │
│                                                              │
│  输入：                                                       │
│    - 用户新消息                                               │
│    - 中断时的 PlanningSnapshot（已完成节点 + 当前产物）        │
│    - 上一次的 planDescription（用户确认过的方案概述）          │
│                                                              │
│  输出：                                                       │
│    - intent: ResumeIntent                                    │
│    - affectedAgent?: AgentRole   （refine/clarify 时指明）    │
│    - reasoning: string                                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
              ↓
        根据 intent 分发
              ↓
┌────────────────────────────────────────────────────┐
│  continue → 从中断点恢复执行（LangGraph resume）    │
│  refine   → 失效传播 + 选择性重跑                   │
│  restart  → 丢弃所有产物，全新管线执行               │
│  clarify  → 注入补充信息，从受影响节点重跑           │
└────────────────────────────────────────────────────┘
```

### PlanningSnapshot：中断时的状态快照

```typescript
interface PlanningSnapshot {
  /** 中断发生时正在执行的节点 */
  interruptedAt: AgentRole | 'execute';
  /** 已完成节点及其产物 */
  completedArtifacts: {
    pm?: { output: FeatureList; checkpointId: string };
    arch?: { output: TechPlan; checkpointId: string };
    visual?: { output: VisualSpec; checkpointId: string };
    task?: { output: ChangeSpec; checkpointId: string };
  };
  /** 中断时正在执行的节点的部分状态（如 ArchAgent 已完成 2/5 轮 think） */
  partialState?: {
    agent: AgentRole;
    messages: BaseMessage[];
    iteration: number;
  };
  /** 中断时间 */
  interruptedAt_ts: Date;
  /** 关联的 PlanningArtifact ID */
  artifactId: string;
}
```

PlanningSnapshot 在中断时由 Orchestrator 保存到 PlanningArtifact 文档中（新增 `snapshot` 字段）。

### ResumeClassifier 的实现

```typescript
// graph/resume/ResumeClassifier.ts

const RESUME_CLASSIFIER_PROMPT = `你是一个意图分类器。用户之前发起了一个 AI 生成任务，任务执行到中途被打断。
现在用户发送了新消息，请判断用户的意图类型。

## 中断时的状态

已完成的规划步骤：{completedSteps}
中断发生在：{interruptedAt}
原始方案概述：{planDescription}

## 用户新消息

{userMessage}

## 判断规则

1. **continue** — 用户想继续执行被打断的任务，没有新的需求或修改
   - 典型表达："继续"、"go on"、"接着做"、"好的继续"
   - 特征：不包含新的需求描述或修改意见

2. **refine** — 用户想修改方案的某个方面，但核心需求不变
   - 典型表达："把颜色改成蓝色"、"按钮放到右边"、"用 Flex 布局"
   - 特征：包含具体修改点，且修改内容可以映射到某个 Agent 的职责范围
   - 需要指明 affectedAgent：修改影响的是哪个角色的产出

3. **restart** — 用户放弃之前的需求，提出全新需求
   - 典型表达："不要了"、"换一个"、"帮我做XX（完全不同的功能）"
   - 特征：新需求与原始方案没有明显关联

4. **clarify** — 用户补充信息或澄清歧义，帮助更好理解原始需求
   - 典型表达："我说的XX是指YY"、"补充一下，这里需要XXX"
   - 特征：不改变核心需求，只是提供更多信息

## affectedAgent 判断规则（仅 refine/clarify 时需要）

- 涉及功能范围/用户体验变更 → 'pm'
- 涉及技术实现/数据结构/API 选择 → 'arch'
- 涉及视觉风格/布局/颜色/间距 → 'visual'
- 涉及任务拆分/操作顺序/执行策略 → 'task'

## 输出格式（严格 JSON）

{
  "intent": "continue" | "refine" | "restart" | "clarify",
  "affectedAgent": "pm" | "arch" | "visual" | "task" | null,
  "reasoning": "一句话解释判断依据"
}`;
```

**关键设计**：ResumeClassifier 是一个**极轻量**的 LLM 调用——输入短（snapshot 摘要 + 用户消息）、输出短（一个 JSON），使用低 temperature（0.1），预估 100-200ms 完成。这个成本远小于错误地全跑一遍管线。

### 四种恢复策略的详细实现

#### 策略 A：continue（断点恢复）

```typescript
async function handleContinue(snapshot: PlanningSnapshot): Promise<void> {
  // 场景：用户只是说"继续"
  // 实现：直接从中断点恢复执行
  
  if (snapshot.partialState) {
    // 中断发生在某个 Agent 执行中途（如 ArchAgent 第 3 轮 think）
    // → 从该 Agent 的 partialState 恢复继续执行
    await orchestrator.resumeAgent(snapshot.partialState);
  } else {
    // 中断发生在 Agent 之间（如 ArchAgent 完成、VisualAgent 未开始）
    // → 从下一个未完成的 Agent 开始执行
    const nextAgent = getNextAgent(snapshot.interruptedAt);
    await orchestrator.runFrom(nextAgent, snapshot.completedArtifacts);
  }
}
```

#### 策略 B：refine（选择性重跑 — 核心创新点）

```typescript
async function handleRefine(
  snapshot: PlanningSnapshot,
  affectedAgent: AgentRole,
  userMessage: string
): Promise<void> {
  // 场景：用户想修改某个方面（如"颜色改成蓝色" → affectedAgent = 'visual'）
  
  // Step 1: 失效传播 — 计算需要重跑的节点
  const invalidatedAgents = getDownstream(affectedAgent);
  // 例如 affectedAgent='visual' → invalidated=['visual', 'task']
  // 例如 affectedAgent='pm' → invalidated=['pm', 'arch', 'visual', 'task']
  
  // Step 2: 保留有效产物
  const validArtifacts: Partial<CompletedArtifacts> = {};
  for (const [agent, artifact] of Object.entries(snapshot.completedArtifacts)) {
    if (!invalidatedAgents.includes(agent as AgentRole)) {
      validArtifacts[agent] = artifact;
    }
  }
  
  // Step 3: 构造修正上下文注入受影响 Agent
  // 将用户修正消息作为额外指令注入到 affectedAgent 的输入中
  const refinementContext = {
    previousOutput: snapshot.completedArtifacts[affectedAgent]?.output,
    userRefinement: userMessage,
    instruction: `用户对上一次的产出不满意，请根据用户反馈修正：\n${userMessage}\n\n上一次的产出供参考（需要修正）：\n${JSON.stringify(previousOutput)}`
  };
  
  // Step 4: 从受影响节点开始重跑
  await orchestrator.runFrom(affectedAgent, validArtifacts, refinementContext);
}
```

**失效传播规则**（DAG 拓扑序）：

```
pm → arch → visual → task → execute

getDownstream('pm')     = ['pm', 'arch', 'visual', 'task']
getDownstream('arch')   = ['arch', 'visual', 'task']
getDownstream('visual') = ['visual', 'task']
getDownstream('task')   = ['task']
```

**特殊情况**：如果 `affectedAgent` 对应的产物还没产出（中断发生在该节点之前），直接等同于 `continue`——因为该节点本来就还没跑。

#### 策略 C：restart（全部作废）

```typescript
async function handleRestart(userMessage: string): Promise<void> {
  // 场景：用户放弃当前需求，开新管线
  
  // Step 1: 将当前 PlanningArtifact 标记为 abandoned
  await PlanningArtifact.updateOne(
    { _id: snapshot.artifactId },
    { status: 'abandoned', abandonedAt: new Date() }
  );
  
  // Step 2: 创建新的 PlanningArtifact + 新的 Dialogue
  // 完全从头开始执行 PMAgent → ArchAgent → VisualAgent → TaskPlanner
  await orchestrator.runFresh(userMessage);
}
```

#### 策略 D：clarify（补充信息回退）

```typescript
async function handleClarify(
  snapshot: PlanningSnapshot,
  affectedAgent: AgentRole,
  userMessage: string
): Promise<void> {
  // 场景：用户补充信息（"我说的表格是指数据表格，不是布局表格"）
  // 与 refine 的区别：clarify 不是修正产出，而是补充输入信息
  
  // 判断补充信息对已有产物是否有实质影响
  // 如果受影响 Agent 的产物已经产出 → 需要重跑该 Agent
  // 如果受影响 Agent 还没执行 → 将信息注入到该 Agent 的 input context 中
  
  if (snapshot.completedArtifacts[affectedAgent]) {
    // 已有产物可能基于错误理解 → 需要重跑
    // 实现上等同于 refine，但 instruction 用"补充信息"而非"修正要求"
    await handleRefine(snapshot, affectedAgent, userMessage);
  } else {
    // 产物还没产出 → 将信息追加到输入上下文
    await orchestrator.injectContext(affectedAgent, {
      type: 'clarification',
      content: userMessage,
    });
    // 然后继续执行
    await handleContinue(snapshot);
  }
}
```

### PlanningOrchestrator 的恢复接口

```typescript
class PlanningOrchestrator {
  /**
   * 从指定 Agent 开始执行管线（跳过之前已完成的节点）
   *
   * @param fromAgent  从哪个 Agent 开始
   * @param validArtifacts  已完成且仍然有效的上游产物
   * @param refinementContext  修正上下文（refine/clarify 时注入）
   */
  async runFrom(
    fromAgent: AgentRole,
    validArtifacts: Partial<CompletedArtifacts>,
    refinementContext?: RefinementContext
  ): Promise<void> {
    const pipeline: AgentRole[] = ['pm', 'arch', 'visual', 'task'];
    const startIndex = pipeline.indexOf(fromAgent);
    
    // 只跑 startIndex 及之后的 Agent
    for (let i = startIndex; i < pipeline.length; i++) {
      const agent = pipeline[i];
      const input = this.buildAgentInput(agent, validArtifacts, refinementContext);
      const result = await this.runAgent(agent, input);
      validArtifacts[agent] = result;
      
      // 实时更新 PlanningArtifact + SSE 通知前端
      await this.updateArtifact(agent, result);
      this.emitProgress(agent, 'completed', result);
    }
  }
  
  /**
   * 恢复被中断的 Agent（从 partialState 继续执行）
   */
  async resumeAgent(partialState: PartialAgentState): Promise<void> {
    // 利用 LangGraph checkpoint 机制从断点恢复
    const checkpointConfig = { configurable: { checkpoint_id: partialState.checkpointId } };
    await this.subGraphs[partialState.agent].invoke(null, checkpointConfig);
  }
}
```

### 与 LangGraph Checkpoint 的关系

LangGraph 的 Checkpoint 机制是底层基础设施，我们在其之上构建语义层：

```
┌────────────────────────────────────────────────────────────────┐
│ 语义层：ResumeClassifier + 失效传播 + 恢复策略                   │
│                                                                  │
│   "用户想干嘛？" → "影响哪些节点？" → "从哪里重跑？"             │
└────────────────────────────────────────────────────────────────┘
              ↓ 调用
┌────────────────────────────────────────────────────────────────┐
│ 基础设施层：LangGraph Checkpoint + Fork + update_state           │
│                                                                  │
│   保存状态快照、从指定 checkpoint 恢复、注入新状态后分支执行      │
└────────────────────────────────────────────────────────────────┘
```

- **continue** → LangGraph `invoke(None, checkpoint_config)`（原地恢复）
- **refine** → LangGraph `update_state(checkpoint, new_values, as_node)` + `invoke(None, fork_config)`（Fork 后从中间节点恢复）
- **restart** → 丢弃 thread，创建新 thread 执行
- **clarify** → 等同于 refine（已有产物时）或 continue + context injection（未产出时）

### 每个 Subagent 的 Checkpoint 粒度

为了支持精确的断点恢复（resume 到 Agent 内部的 think↔tools 循环中间），
每个 Subagent 子图需要配置独立的 checkpointer（`checkpointer=True`），
使得父图可以 time-travel 到 Subagent 内部的任意步骤。

```typescript
// 子图编译时配置独立 checkpointer
const archSubGraph = archGraph.compile({ checkpointer: true });

// PlanningOrchestrator 作为父图时
const orchestratorGraph = new StateGraph(OrchestratorState)
  .addNode("pm", pmSubGraph)       // 子图，有自己的 checkpoint
  .addNode("arch", archSubGraph)   // 子图，有自己的 checkpoint
  .addNode("visual", visualSubGraph)
  .addNode("task", taskSubGraph)
  .compile({ checkpointer: parentCheckpointer });
```

---

## 前端交互设计

### 中断后的 UI 状态

用户点击"停止"后，前端展示中断状态：

```
┌─────────────────────────────────────────────────────┐
│ 🧭 规划已暂停                                         │
│                                                      │
│  ✓ 产品分析    3 个功能需求                           │
│  ✓ 技术方案    新增 2 个 View，修改 Schema 1 处       │
│  ⏸ 视觉设计    已中断                                 │
│  ○ 任务拆解    未开始                                 │
│                                                      │
│  [ 继续执行 ]  [ 查看已完成产物 ▾ ]                   │
└─────────────────────────────────────────────────────┘
```

### 续接时的处理流程

用户在输入框发送新消息时：

1. 前端检测到存在 `status='interrupted'` 的 PlanningArtifact
2. 将新消息连同 `artifactId` + `snapshot` 一起发送到后端
3. 后端调用 ResumeClassifier 做意图分类
4. 根据分类结果执行恢复策略
5. 前端通过 SSE 实时更新规划卡片状态

---

## 边界情况处理

### 超时自动中断

如果用户关闭页面（非主动打断），系统设置执行超时（如 5 分钟无 SSE 心跳），
自动将 PlanningArtifact 标记为 `interrupted` 并保存 snapshot。
用户下次打开时，前端展示中断状态，用户可以选择继续或重新开始。

### 中断发生在 Agent 之间

如果中断恰好发生在两个 Agent 之间（如 ArchAgent 刚完成、VisualAgent 还没开始），
snapshot 中没有 `partialState`，恢复时直接从下一个 Agent 开始即可。

### 中断发生在 Execute 阶段

如果中断发生在 Execute 阶段（规划已全部完成，正在执行 ChangeSpec），
恢复策略更简单：

- **continue** → 从未完成的 task 继续执行
- **refine** → 判断影响范围，可能需要回退到规划阶段重跑部分 Agent
- **restart** → 需要 rollback 已执行的变更（通过 TransactionManager 撤销）

### ResumeClassifier 置信度低

如果 ResumeClassifier 的判断置信度低（比如用户说了一句模棱两可的话），
不自动执行，而是通过 SSE 推送 `resume_clarification` 事件，
让前端展示选项让用户确认：

```
┌─────────────────────────────────────────────────────┐
│ 💬 请确认您的意图：                                    │
│                                                      │
│  ○ 继续之前的任务，不做修改                           │
│  ○ 修改视觉设计（保留产品分析和技术方案）             │
│  ○ 放弃当前任务，开始新任务                           │
│                                                      │
│  [ 确认 ]                                            │
└─────────────────────────────────────────────────────┘
```

---

## 与 ADR-032 / ADR-033 的关系

- **ADR-032**（Multi-Agent Pipeline）：定义了管线结构，本 ADR 定义管线的中断恢复策略
- **ADR-033**（Memory Namespace）：记忆按命名空间隔离，中断恢复时各 Agent 的记忆上下文独立加载
- **PlanningArtifact**（ADR-032 中定义）：新增 `snapshot` 字段和 `interrupted` / `abandoned` 状态

### PlanningArtifact 状态机扩展

```
running → completed     （正常完成）
running → interrupted   （用户打断）
running → failed        （Agent 执行失败）
interrupted → running   （continue / refine 恢复执行）
interrupted → abandoned （restart 放弃）
```

---

## TODO：实施计划

### XiangDi Agent 层

- [ ] 实现 `ResumeClassifier`（`graph/resume/ResumeClassifier.ts`）
- [ ] 定义 `ResumeIntent` / `PlanningSnapshot` 类型（`graph/resume/types.ts`）
- [ ] 实现 `getDownstream(agent)` 失效传播函数（`graph/resume/invalidation.ts`）
- [ ] PlanningOrchestrator 新增 `runFrom()` / `resumeAgent()` / `injectContext()` 方法
- [ ] PlanningOrchestrator 在收到 abort 信号时保存 PlanningSnapshot
- [ ] 每个 Subagent 子图配置独立 checkpointer（支持内部 time-travel）
- [ ] 新增 `resume_clarification` SSE 事件（置信度低时请求用户确认）

### Banyan 后端

- [ ] `PlanningArtifact` 新增 `snapshot` 字段和 `interrupted` / `abandoned` 状态
- [ ] `AiService` 处理 abort 请求时通知 XiangDi 保存 snapshot
- [ ] `AiService` 处理 resume 请求时先调用 ResumeClassifier，再分发
- [ ] 新增 API：`POST /applications/:appId/conversation/resume`（附带 userMessage + artifactId）

### Banyan 前端

- [ ] 规划卡片支持 `interrupted` 状态展示
- [ ] 输入框发送时检测是否存在中断态的 Artifact，若有则走 resume 路径
- [ ] 处理 `resume_clarification` SSE 事件，展示用户确认 UI
- [ ] "继续执行"快捷按钮（不输入文字直接触发 continue）
