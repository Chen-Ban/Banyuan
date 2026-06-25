# AI Agent 观测体系方案

> 本文档不修改代码，仅作为后续开发的技术规格。基于现有 Banyuan 架构（XiangDi Agent + AiService SSE 代理 + CreditService）设计。

## 1. 现状与差距

### 当前状态

```
用户 prompt ─→ AiService ─→ SSE ─→ XiangDi Agent ─→ LLM API
                                                        │
                  CreditUsage(表) ←── estimateTokens() ◄─┘
                  console.log()
```

- Token 统计：AiService 中用 `Math.ceil(text.length / 2)` 估算，偏差大
- LLM 调用日志：无，只有 `credit_usage` 的月度聚合表
- Agent 内部数据：无结构化日志，全靠 `console.log`
- 链路追踪：无 traceId，无法关联一次对话中的多次 LLM 调用
- 异常上报：无，`try/catch` 中只 `console.error`

### 目标状态

```
用户 prompt ─→ AiService ─→ SSE ─→ XiangDi Agent ─→ LLM API
                  │                  │                  │
                  ▼                  ▼                  ▼
             结构化日志 ──────→ 观测数据湖 ──────→ 精确 token 计数
                                   │
                          ┌────────┼────────┐
                          ▼        ▼        ▼
                       Grafana  Sentry   账单系统
```

---

## 2. 观测数据模型

### 2.1 LLM 调用记录 (LLMCallRecord)

每次 LLM API 调用生成一条记录。

```typescript
interface LLMCallRecord {
  /** 全局唯一 trace ID（对话级别） */
  traceId: string
  /** 单次 LLM 调用 ID */
  callId: string
  /** 父级 span ID（agent 工具调用层级） */
  parentSpanId?: string

  // ─── 调用上下文 ───
  /** 租户 ID */
  tenantId: string
  /** 应用 ID */
  appId: string
  /** 对话 ID（Dialogue._id） */
  dialogueId: string
  /** 调用模式：chat / task / edit */
  mode: 'chat' | 'task' | 'edit'
  /** 当前 agent 名称（Orchestrator SubAgent 或 respond/Router） */
  agentName: string
  /** 当前工具名称（纯文本对话时为 'direct_response'） */
  toolName: string
  /** Agent 执行阶段 */
  phase: string

  // ─── 模型信息 ───
  /** 使用的模型名称（如 deepseek-v4-pro） */
  model: string
  /** LLM provider（deepseek / kimi） */
  provider: string

  // ─── Token 用量（精确值） ───
  /** 输入 token 数（含 system prompt + 历史消息 + 当前 prompt） */
  inputTokens: number
  /** 缓存命中 token 数（DeepSeek 特有，可为 0） */
  cachedInputTokens: number
  /** 输出 token 数 */
  outputTokens: number
  /** 总 token 数 */
  totalTokens: number

  // ─── 性能指标 ───
  /** 请求发起时间 */
  startedAt: string  // ISO 8601
  /** 响应完成时间 */
  completedAt: string  // ISO 8601
  /** 耗时（毫秒） */
  durationMs: number
  /** 首 token 到达时间（流式） */
  ttftMs?: number  // time to first token

  // ─── 状态 ───
  /** 调用结果 */
  status: 'success' | 'error' | 'timeout'
  /** 错误信息（失败时） */
  error?: string
  /** 停止原因（end_turn / tool_use / max_tokens） */
  stopReason: string

  // ─── 输入输出摘要（脱敏/截断，用于调试） ───
  /** 系统 prompt 摘要（前 500 字符） */
  systemSummary?: string
  /** 用户消息摘要（前 500 字符） */
  inputSummary?: string
  /** 输出摘要（前 500 字符） */
  outputSummary?: string
}
```

### 2.2 Agent 执行跨度 (AgentSpan)

Agent 编排层（Workflow Graph）的执行记录。

```typescript
interface AgentSpan {
  /** 全局唯一 trace ID */
  traceId: string
  /** 本 span ID */
  spanId: string
  /** 父 span ID */
  parentSpanId?: string

  // ─── Span 类型 ───
  /** 跨度类型 */
  spanType: 'agent_node' | 'tool_call' | 'llm_call' | 'phase_transition'

  /** Agent / 节点名称 */
  nodeName: string
  /** 当前 phase */
  phase: string
  /** 节点状态 */
  status: 'running' | 'completed' | 'failed'

  // ─── 时间 ───
  startedAt: string
  completedAt: string
  durationMs: number

  // ─── 上下文 ───
  tenantId: string
  appId: string
  dialogueId: string

  // ─── 元数据 ───
  /** 节点输入摘要 */
  inputSummary?: string
  /** 节点输出摘要 */
  outputSummary?: string
  /** 错误信息 */
  error?: string
}
```

### 2.3 系统事件 (SystemEvent)

系统级别的操作审计日志。

```typescript
interface SystemEvent {
  /** 事件 ID */
  eventId: string
  /** 事件类型 */
  eventType:
    | 'user.login'
    | 'user.register'
    | 'tenant.created'
    | 'plan.changed'
    | 'app.created'
    | 'app.deleted'
    | 'deploy.started'
    | 'deploy.completed'
    | 'deploy.failed'
    | 'ai.dialogue.started'
    | 'ai.dialogue.completed'
    | 'ai.dialogue.failed'
    | 'credit.quota_exceeded'
    | 'ecs.provisioned'
    | 'ecs.terminated'

  /** 发生时间 */
  timestamp: string
  /** 操作用户 */
  userId?: string
  /** 关联租户 */
  tenantId?: string
  /** 关联应用 */
  appId?: string
  /** 事件详情（JSON 序列化） */
  detail: Record<string, unknown>
}
```

---

## 3. 实现路径

### P0 — 精确 Token 回传（约 2 天）

**目标**：LLMResponse 携带精确 token 数，替换 AiService 的估算逻辑。

**改动**：

1. **`LLMResponse` 接口**（`packages/xiangdi-agent/src/core/llmTypes.ts`）
   ```typescript
   export interface LLMResponse {
     stop_reason: string
     content: Array<...>
     /** LLM API 返回的精确 token 用量 */
     usage?: {
       inputTokens: number
       outputTokens: number
       model: string
     }
   }
   ```

2. **`DeepSeekClient.convertToLLMResponse()`**（`packages/xiangdi-agent/src/llm/DeepSeekClient.ts`）
   ```typescript
   function convertToLLMResponse(completion: ChatCompletion): LLMResponse {
     // 现有逻辑...
     const usage = completion.usage
     return {
       stop_reason,
       content,
       usage: usage ? {
         inputTokens: usage.prompt_tokens,
         outputTokens: usage.completion_tokens,
         model: completion.model,
       } : undefined,
     }
   }
   ```

3. **流式调用路径**——在 `createMessageStream` 中启用 `stream_options: { include_usage: true }`，最后一个 chunk 会有 `usage` 信息

4. **`AiService`**（`apps/banyan/backend/src/services/AiService.ts`）—— SSE done 事件携带 token 用量时直接使用精确值，无精确值时 fallback 到估算

### P1 — 结构化日志（约 2 天）

**目标**：用 pino（或 winston）替换所有 `console.log`，统一 JSON 格式。

**改动**：

1. 在 `apps/banyan/backend/src` 和 `packages/xiangdi-agent/src` 中引入 `pino`
2. 定义 logger 实例（开发环境 `pino-pretty`，生产环境 JSON）
3. 逐文件替换 `console.log` → `logger.info`，`console.error` → `logger.error`
4. 在 LLM 调用点输出 `LLMCallRecord` 格式的日志
5. 在 Agent 节点执行点输出 `AgentSpan` 格式的日志

### P2 — 链路追踪（约 3 天）

**目标**：XiangDi Agent + AiService SSE 链路注入 traceId。

**改动**：

1. AiService 收到前端 SSE 请求时生成 `traceId`（UUID）
2. 通过 SSE 请求体传递给 XiangDi 服务（`requestBody.traceId`）
3. XiangDi Orchestrator 将 `traceId` 注入所有 SubAgent 节点、WorkerGraph、LLMClient 调用
4. 所有日志输出携带 `traceId`，实现跨服务关联

### P3 — 日志聚合 + 可视大盘（约 5 天）

**目标**：搭建日志采集管道 + Grafana 看板。

**推荐栈**：
- 日志代理：`Filebeat` / `Vector`（轻量，无依赖）
- 聚合存储：`Loki`（Grafana 生态，查询快）或 `Elasticsearch`（功能丰富）
- 可视化：`Grafana`

**关键看板**：
- 租户级：按 tenantId 的 token 消耗趋势、credit 剩余
- 模型级：按 model 的 token 分布、latency P50/P95、错误率
- Agent 级：按 agent/tool 的调用频率、耗时、成功率
- 系统级：ECU/deploy 事件、异常频率

### P4 — 异常上报（约 1 天）

**目标**：接入 Sentry 自动捕获未处理异常。

**改动**：

1. 在 `apps/banyan/backend/src/app.ts` 初始化 `Sentry.init()`
2. 在 Koa 错误中间件中添加 `Sentry.captureException()`
3. 在 XiangDi Agent 的 WorkerGraph 中添加 try/catch 包裹，捕获后 `Sentry.captureException()`

---

## 4. 数据 pipeline 架构图

```
                         ┌─────────────────────────────────┐
                         │          Grafana                 │
                         │  (租户/模型/Agent 大盘)           │
                         └──────────────┬──────────────────┘
                                        │ 查询 (LogQL / PromQL)
                         ┌──────────────▼──────────────────┐
                         │       Loki / Elasticsearch       │
                         │   (日志索引 + 聚合 + 检索)        │
                         └──────────────┬──────────────────┘
                                        │ 推送 (JSON over HTTP)
                         ┌──────────────▼──────────────────┐
                         │         Filebeat / Vector         │
                         │   (日志采集 → 结构化 → 发送)       │
                         └──────────────┬──────────────────┘
                                        │ 读取日志文件
     ┌───────────────────────────────────┼───────────────────────────┐
     │                                   │                           │
┌────▼─────┐                    ┌───────▼───────┐          ┌───────▼───────┐
│ Banyan   │                    │ XiangDi Agent │          │ deploy-agent │
│ Backend  │                    │ (LLM 调用日志) │          │ (ECS 日志)    │
│ (SSE +   │                    │               │          │               │
│  credit) │                    │ LLMCallRecord │          │ SystemEvent   │
│          │                    │ AgentSpan     │          │               │
│SystemEvent│                   └───────────────┘          └───────────────┘
└──────────┘
```

---

## 5. 与现有 Credit 体系的关系

```
LLM API 返回精确 token
        │
        ▼
 LLMCallRecord (结构化日志)
        │
   ┌────┴────┐
   ▼         ▼
XiangDi    Banyan Backend
Agent 内   AiService 收到
部使用     done 事件中的 token
   │         │
   │    ┌────▼────┐
   │    │ credit  │
   │    │ service │
   │    │.record  │
   │    │ Usage() │
   │    └────┬────┘
   │         ▼
   │    CreditUsage 表
   │    (按月聚合,tenant 粒度)
   │         │
   │    ┌────▼────┐
   │    │ 月度账单 │
   │    │ 生成    │
   │    └─────────┘
```

两条路径并行：
- **精确路径**：LLMCallRecord → credit_service.recordUsage() → CreditUsage 表（用于计费）
- **观测路径**：LLMCallRecord → pino → Filebeat → Loki → Grafana（用于运营分析）
