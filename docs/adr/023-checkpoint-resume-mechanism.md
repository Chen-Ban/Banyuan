# ADR-023: XiangDi Checkpoint/Resume 机制

## 状态

提议（Proposed） · 2025-07-18

## 背景

当前 XiangDi 服务（:3002）是完全无状态的——pages 随请求传入、随 done 事件返回，MasterGraph 通过 `graph.invoke()` 一次性执行完毕。这带来两个问题：

1. **连接中断不可恢复**：banyan(:3001) → xiangdi(:3002) 的 SSE 长连接一旦断开（网络抖动、超时、进程重启），整个 MasterGraph 执行丢失，用户只能从头重来。一次完整执行（plan → execute → audit → summarize）可能耗时 30-120 秒，重跑的用户体验极差。

2. **Human-in-the-Loop 无法实现**：`humanGate` 节点设计了人工审批流程，但因为无法持久化执行状态，当前只能 `autoRun=true` 跳过。要真正实现"用户审批 ChangeSpec 后再执行"，需要图执行能暂停-持久化-恢复。

MasterGraph 已基于 `@langchain/langgraph` 构建（ADR-014 的迁移已完成），LangGraph 提供了原生的 Checkpointer + `interrupt()` + `Command({ resume })` 机制，可以直接复用。

## 决策

**在 xiangdi-server 中引入 LangGraph Checkpointer，实现 MasterGraph 的断点持久化与恢复能力。**

核心原则：
- xiangdi-server 仍不访问 MongoDB（业务数据持久化仍由 banyan 负责）
- Checkpoint 存储的是**执行状态**（MasterGraph 节点进度、消息历史、中间结果），不是业务数据
- 对 banyan 后端的接口变化最小化，向后兼容

## 架构设计

### 1. 整体拓扑

```
banyan(:3001)                         xiangdi(:3002)
     │                                      │
     │  POST /ai/run                        │
     │  { threadId, appId, ... }            │
     ├─────────────────────────────────────→│
     │                                      │  graph.stream(input, { thread_id })
     │  SSE: text_delta / tool_call / ...   │  ← 每个节点完成自动 checkpoint
     │←─────────────────────────────────────┤
     │                                      │
     │  [连接断开]                           │  checkpoint 已持久化到 SQLite
     │                                      │
     │  POST /ai/resume                     │
     │  { threadId }                        │
     ├─────────────────────────────────────→│
     │                                      │  graph.stream(null, { thread_id })
     │  SSE: resume_from + 后续事件          │  ← 从最后 checkpoint 恢复
     │←─────────────────────────────────────┤
     │                                      │
     │  SSE: done { pages }                 │
     │←─────────────────────────────────────┤
```

### 2. Checkpointer 选型

| 选项 | 适用场景 | 选择理由 |
|------|----------|----------|
| `MemorySaver` | 开发调试 | 进程重启丢失，不适合生产 |
| `SqliteSaver` | 单实例部署 | xiangdi-server 当前单实例，零外部依赖，适合当前阶段 |
| `PostgresSaver` | 多实例水平扩展 | 未来扩展方案，需额外基础设施 |

**决策：MVP 阶段使用 `SqliteSaver`（文件持久化），预留 PostgresSaver 升级路径。**

```typescript
// apps/xiangdi-server/src/checkpoint/index.ts
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";

const checkpointer = SqliteSaver.fromConnString("./data/checkpoints.db");

// 图编译时注入
const compiledGraph = masterGraph.compile({ checkpointer });
```

### 3. Thread 标识设计与持久化

#### 3.1 threadId 格式

```typescript
// 格式：`${appId}:${userMessageId}`
// 示例："6830a1f2e4b0a1c2d3e4f5a6:668f1a2b3c4d5e6f7a8b9c0d"
const threadId = `${appId}:${userMessage._id.toString()}`;
```

- `appId`：标识哪个应用，隔离不同应用的 checkpoint，方便按应用维度清理
- `userMessageId`：标识哪条用户消息触发的执行，是 MongoDB subdocument 的 `_id`（ObjectId）

设计优势：
- **语义明确**：一个 threadId 直接表达"哪个应用的哪条消息触发了这次 Agent 执行"
- **天然幂等**：同一条 message 不会产生两个 thread，防止网络重试导致重复执行
- **便于清理**：既可按时间（ObjectId 内嵌时间戳），也可按 message 在会话中的顺序
- **可追溯**：从 threadId 反查出对应的 user message，debug 时直达上下文

前提变更：`MessageSchema` 需开启 `_id: true`（mongoose subdocument 默认关闭），让每条消息获得独立的 ObjectId。

#### 3.2 持久化位置：IMessage.threadId

threadId 记在**发起这轮对话的 user message** 上。这是最自然的归属——一个 threadId 对应一轮 user→assistant 的完整交互，而 user message 是这轮交互的起点。

```typescript
// 模型变更：IMessage 新增可选 threadId 字段
export interface IMessage {
  role: 'user' | 'assistant'
  content: string | IMessageContent[]
  /** 关联的 XiangDi 执行线程 ID（仅 user 消息有值） */
  threadId?: string
  /**
   * 该轮 AI 执行的状态
   * - running: 正在执行
   * - completed: 已完成（收到 done 事件）
   * - interrupted: 被 interrupt 暂停（等待用户输入）
   * - failed: 执行失败
   */
  threadStatus?: 'running' | 'completed' | 'interrupted' | 'failed'
  createdAt: Date
}
```

写入时机：
- `appendUserMessage()` 时同时写入 `threadId` 和 `threadStatus: 'running'`
- 收到 `done` 事件时更新为 `threadStatus: 'completed'`
- 收到 `interrupt` 事件时更新为 `threadStatus: 'interrupted'`
- 出错时更新为 `threadStatus: 'failed'`

#### 3.3 恢复时如何找到 threadId

```typescript
// ConversationService 新增方法
async getLastPendingThread(appId: string): Promise<{ threadId: string; status: string } | null> {
  const conv = await Conversation.findOne(
    { appId, 'messages.threadStatus': { $in: ['running', 'interrupted'] } },
    { messages: { $slice: -20 } }  // 只看最近 20 条，性能安全
  );
  if (!conv) return null;
  
  // 从后往前找第一条有 pending threadId 的 user 消息
  for (let i = conv.messages.length - 1; i >= 0; i--) {
    const msg = conv.messages[i];
    if (msg.role === 'user' && msg.threadId && 
        (msg.threadStatus === 'running' || msg.threadStatus === 'interrupted')) {
      return { threadId: msg.threadId, status: msg.threadStatus };
    }
  }
  return null;
}
```

前端重连/刷新页面时的流程：
1. 前端调用 `GET /api/ai/status?appId=xxx`
2. banyan 后端查 `getLastPendingThread(appId)`
3. 若存在 pending thread → 返回 `{ threadId, status, canResume: true }`
4. 前端展示"上次操作未完成，是否继续？"
5. 用户确认 → 前端调用 `POST /api/ai/resume { appId, threadId }`
6. banyan 调用 xiangdi-server `/ai/resume` → SSE 流恢复

#### 3.4 为什么不放在 Conversation 顶层

曾考虑在 Conversation 上加一个 `currentThreadId` 字段，但有两个问题：
- 语义不对：Conversation 是整个应用的对话历史，而 threadId 是某一轮的执行标识
- 并发问题：如果用户快速连续发送两条消息（虽然 UI 应禁止），顶层字段会被覆盖

放在 message 上是最干净的：每轮有自己的 threadId，互不干扰，历史可追溯。

### 4. 新增/修改的 API 端点

#### 4.1 `POST /ai/run`（修改）

请求体新增 `threadId` 字段：

```typescript
interface AiRunRequest {
  threadId: string;        // 新增：线程标识
  appId: string;
  prompt: string;
  pages: string[];
  previousMessages?: Message[];
  memoryHint?: string;
  preferences?: UserPreferences;
  appSchema?: AppSchema;
}
```

行为变化：
- 检查该 `threadId` 是否已有未完成的 checkpoint
- 若有：返回 `409 Conflict`，提示客户端使用 `/ai/resume`
- 若无：正常创建新图执行

#### 4.2 `POST /ai/resume`（新增）

```typescript
interface AiResumeRequest {
  threadId: string;
  resumeValue?: unknown;   // 可选：用户对 interrupt 的响应
}
```

行为：
- 从 checkpointer 加载该 thread 的最新 checkpoint
- 若 checkpoint 不存在或已完成：返回 `404` 或 `410 Gone`
- 若存在 pending interrupt：用 `Command({ resume: resumeValue })` 恢复
- 若存在中断的正常执行（连接断开）：用 `graph.stream(null, config)` 从断点继续
- 以 SSE 流推送后续事件

#### 4.3 `GET /ai/thread/:threadId/status`（新增）

```typescript
interface ThreadStatus {
  threadId: string;
  status: "running" | "interrupted" | "completed" | "expired" | "not_found";
  currentNode?: string;       // 当前/下一个节点
  interrupt?: {               // 若状态为 interrupted
    id: string;
    value: unknown;           // interrupt 传出的数据（如 ChangeSpec）
  };
  createdAt: number;
  lastCheckpointAt: number;
}
```

banyan 后端可轮询此端点判断是否需要恢复。

#### 4.4 `DELETE /ai/thread/:threadId`（新增）

主动取消/清理一个 thread 的 checkpoint。用于：
- 用户取消操作
- 超时清理

### 5. SSE 事件协议扩展

新增事件类型：

| 事件名 | 数据结构 | 时机 |
|--------|----------|------|
| `checkpoint` | `{ node: string, step: number }` | 每个节点完成并持久化后 |
| `interrupt` | `{ id: string, type: string, payload: unknown }` | 触发 interrupt 时 |
| `resumed` | `{ fromNode: string, step: number }` | 从 checkpoint 恢复执行时（首个事件） |

`interrupt` 事件的 `payload` 根据 type 不同而异：
- `type: "human_gate"` → payload 为 `{ changeSpec: ChangeSpec, planSummary: string }`
- `type: "disambiguation"` → payload 为 `{ options: DisambiguationOption[] }`

### 6. HumanGate 真正实现

当前 `humanGate` 节点直接 `return { humanApproved: true }`，改为：

```typescript
async function humanGateNode(state: typeof MasterState.State) {
  if (state.autoRun) {
    return { humanApproved: true };
  }

  // 触发 interrupt，暂停图执行
  const decision = interrupt({
    type: "human_gate",
    changeSpec: state.planOutput?.changeSpec,
    planSummary: state.planOutput?.summary,
  });

  // 恢复后，decision 是用户的响应
  if (decision.approved) {
    return { 
      humanApproved: true,
      // 用户可能修改了 changeSpec
      planOutput: decision.modifiedSpec 
        ? { ...state.planOutput, changeSpec: decision.modifiedSpec }
        : state.planOutput,
    };
  } else {
    return { humanApproved: false };
  }
}
```

banyan 端收到 `interrupt` 事件后：
1. 将 ChangeSpec 展示给用户
2. 用户确认/修改后，调用 `POST /ai/resume` 传入 `{ threadId, resumeValue: { approved: true, modifiedSpec?: ... } }`
3. xiangdi-server 恢复图执行

### 7. 连接断开恢复流程

```
时间线：
  t0: banyan 发起 POST /ai/run { threadId: "abc" }
  t1: plan 节点完成 → checkpoint #1 持久化 → SSE: checkpoint { node: "plan", step: 1 }
  t2: humanGate 通过 → checkpoint #2
  t3: execute 节点执行中，3/5 工具调用完成 → checkpoint #3
  t4: ⚡ 网络断开，banyan 丢失 SSE 连接
  t5: xiangdi-server 检测到连接关闭，当前节点执行完成后停止（不再推进下一节点）
  t6: checkpoint #3 已持久化（execute 节点内的最后一个 super-step）
  
  [用户刷新页面 / banyan 重连]
  
  t7: banyan 调用 GET /ai/thread/abc/status → { status: "interrupted", currentNode: "assemble" }
  t8: banyan 调用 POST /ai/resume { threadId: "abc" }
  t9: xiangdi-server 从 checkpoint #3 恢复 → SSE: resumed { fromNode: "assemble", step: 3 }
  t10: assemble → audit → summarize → extractPreferences → done
```

**Checkpoint 粒度：节点级别**

LangGraph 在每个节点（super-step）完成后自动 checkpoint。当前 MasterGraph 有 7 个主要节点（plan → humanGate → execute → assemble → audit → summarize → extractPreferences），连接中断后最多回退到上一个完成的节点重新执行。对于当前场景这个粒度足够——即使 execute 节点内部有 think ↔ tools 循环，整体执行时间通常在 10-30 秒内，重跑一个节点的代价可接受。

### 8. Checkpoint TTL 与清理

```typescript
interface CheckpointCleanupConfig {
  /** 已完成 thread 的保留时间（默认 1 小时） */
  completedTTL: number;
  /** 中断/未完成 thread 的保留时间（默认 24 小时） */
  interruptedTTL: number;
  /** 清理间隔（默认 10 分钟） */
  cleanupInterval: number;
}
```

定时任务扫描 checkpointer 中的过期 thread：
- 已完成（next 为空）超过 1 小时 → 删除
- 中断/运行中超过 24 小时 → 标记为 expired → 删除

### 9. banyan 后端适配

AiService 的改动：

```typescript
class AiService {
  async runWithSSE(ctx: Context, params: AiRunParams) {
    const { appId, prompt } = params;
    
    // 追加 user message（开启 _id），用 appId + messageId 组合成 threadId
    const userMessage = await conversationService.appendUserMessage(appId, prompt);
    const threadId = `${appId}:${userMessage._id.toString()}`;
    await conversationService.updateThreadStatus(appId, threadId, 'running');
    
    // 调用 xiangdi-server（请求体新增 threadId）
    await this.proxySSE(`${XIANGDI_URL}/ai/run`, { ...body, threadId }, ctx, {
      onDone: async () => {
        // 标记该轮执行完成
        await conversationService.updateThreadStatus(appId, threadId, 'completed');
      },
      onError: async () => {
        await conversationService.updateThreadStatus(appId, threadId, 'failed');
      },
      onInterrupt: async () => {
        await conversationService.updateThreadStatus(appId, threadId, 'interrupted');
      },
    });
  }

  async resumeSSE(ctx: Context, params: { appId: string; threadId?: string }) {
    const { appId } = params;
    
    // 若前端没传 threadId，从最近消息中查找
    const threadId = params.threadId 
      ?? (await conversationService.getLastPendingThread(appId))?.threadId;
    if (!threadId) throw new NotFoundError("No pending thread to resume");
    
    // 更新状态为 running（恢复中）
    await conversationService.updateThreadStatus(appId, threadId, 'running');
    
    // 恢复执行
    await this.proxySSE(`${XIANGDI_URL}/ai/resume`, { threadId }, ctx, {
      onDone: async () => {
        await conversationService.updateThreadStatus(appId, threadId, 'completed');
      },
      onError: async () => {
        await conversationService.updateThreadStatus(appId, threadId, 'failed');
      },
    });
  }
}
```

ConversationService 新增/修改方法：

```typescript
class ConversationService {
  /** 追加 user 消息，返回含 _id 的消息对象（用于构建 threadId） */
  async appendUserMessage(appId: string, text: string): Promise<{ _id: Types.ObjectId }> {
    const message = { role: 'user', content: text, createdAt: new Date() };
    const result = await Conversation.findOneAndUpdate(
      { appId },
      { $push: { messages: message }, $inc: { messageCount: 1 } },
      { new: true, projection: { 'messages': { $slice: -1 } } }
    );
    return result!.messages[0];  // 返回刚插入的消息（含自动生成的 _id）
  }

  /** 更新指定 message 的 threadId 和执行状态（通过 message._id 定位） */
  async updateThreadStatus(appId: string, threadId: string, status: IMessage['threadStatus']) {
    // threadId 格式为 "appId:messageId"，解析出 messageId
    const messageId = threadId.split(':')[1];
    await Conversation.updateOne(
      { appId, 'messages._id': new Types.ObjectId(messageId) },
      { $set: { 'messages.$.threadId': threadId, 'messages.$.threadStatus': status } }
    );
  }

  /** 查找最近一个未完成的 thread */
  async getLastPendingThread(appId: string): Promise<{ threadId: string; status: string } | null> {
    // ... 见 3.3 节
  }
}
```

### 10. 文件变更清单

```
apps/xiangdi-server/
├── package.json                          # 新增依赖 @langchain/langgraph-checkpoint-sqlite
├── src/
│   ├── checkpoint/
│   │   ├── index.ts                      # 新增：Checkpointer 初始化 + 配置
│   │   └── cleanup.ts                    # 新增：TTL 清理定时任务
│   ├── routes/
│   │   └── ai.ts                         # 修改：/ai/run 接收 threadId；新增 /ai/resume、/ai/thread/:id/status、DELETE /ai/thread/:id
│   └── app.ts                            # 修改：初始化 checkpointer + 注册清理任务

packages/xiangdi-agent/
├── src/graph/
│   ├── masterGraph.ts                    # 修改：compile() 接受 checkpointer 参数
│   └── nodes/humanGate.ts                # 修改：使用 interrupt() 替代直接 return

apps/banyan/backend/
├── src/models/
│   └── Conversation.ts                   # 修改：IMessage 新增 threadId + threadStatus 字段
├── src/services/
│   ├── AiService.ts                      # 修改：生成 threadId、实现 resumeSSE()、SSE 事件回调更新 threadStatus
│   └── ConversationService.ts            # 修改：appendUserMessage 支持 thread 参数；新增 updateThreadStatus()、getLastPendingThread()
├── src/routes/
│   └── ai.ts                             # 修改：新增 POST /api/ai/resume、GET /api/ai/status 路由
```

## 实施分期

### Phase 1：基础 Checkpoint 能力（连接断开可恢复）

- 引入 `@langchain/langgraph-checkpoint-sqlite`
- `/ai/run` 接收 threadId，`graph.compile({ checkpointer })`
- 新增 `/ai/resume` 端点，实现从断点恢复
- 新增 `/ai/thread/:id/status` 端点
- SSE 新增 `checkpoint` 和 `resumed` 事件
- TTL 清理机制
- banyan 端生成 threadId + 基本恢复逻辑

预期工作量：3-4 天

### Phase 2：Human-in-the-Loop 真正实现

- `humanGate` 节点使用 `interrupt()`
- `/ai/resume` 支持 `resumeValue`（用户审批结果）
- SSE 新增 `interrupt` 事件
- banyan 前端展示 ChangeSpec + 审批 UI
- `autoRun` 配置化（默认 false）

预期工作量：2-3 天

### Phase 3：生产化加固（可选）

- SqliteSaver → PostgresSaver（多实例部署）
- Checkpoint 存储加密（敏感数据保护）
- 监控指标（checkpoint 写入延迟、恢复成功率）
- execute 内部子图化（think ↔ tools 粒度 checkpoint）

## 风险与缓解

| 风险 | 概率 | 缓解措施 |
|------|------|----------|
| SQLite 写入成为性能瓶颈 | 低 | 每次 AI 请求产生 5-10 个 checkpoint，单次写入 <10ms，SQLite 可承受 |
| Checkpoint 数据膨胀 | 中 | TTL 清理 + MasterState 中的 messages 只保留摘要而非完整历史 |
| 恢复后上下文过时（pages 已被其他操作修改） | 中 | 恢复时 banyan 重新传入最新 pages，与 checkpoint 中的版本做冲突检测 |
| LangGraph SDK 升级导致 checkpoint 格式不兼容 | 低 | 锁定 `@langchain/langgraph` 版本；升级时清空旧 checkpoint |
| 进程重启后 SQLite 文件损坏 | 极低 | SQLite WAL 模式 + 定期备份；最坏情况：丢失 checkpoint，用户重试 |

## 约束

- xiangdi-server **不访问 MongoDB**（此原则不变）
- Checkpoint 存储（SQLite/PostgreSQL）是框架层基础设施，不是业务数据库
- banyan 后端仍负责 pages 的最终持久化（done 事件 → MongoDB）
- Checkpoint 中**不存储** API Key 或用户凭证

## 与现有 ADR 的关系

- **ADR-008**（XiangDi 独立服务）：checkpoint 存储在 xiangdi-server 本地，不违反无状态原则——这是"执行状态"非"业务状态"
- **ADR-014**（LangGraph 迁移）：本 ADR 是 014 的延续实施，利用 LangGraph 的原生 checkpointer 能力
- **ADR-022**（记忆管理系统）：Memory 是长期状态（跨会话），Checkpoint 是短期状态（单次执行），二者正交
