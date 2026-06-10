# Agent · 机制级决策

> 某个机制怎么工作——XiangDi 智能体 + 知识服务的关键运行机制。

---

## 决策依赖图

```
┌───────────────────────────┐
│  M1 记忆系统               │
└────────────┬──────────────┘
             │ enables
     ┌───────┼───────┐
     │               │
┌────▼──────────┐  ┌─▼─────────────────────┐
│  M2 Multi-    │  │  M4 冲突检测与消歧     │
│  Agent 记忆   │  └───────────────────────┘
│  命名空间     │
└───────────────┘

┌───────────────────────────┐         ┌───────────────────────────┐
│  M6 审计与回退仲裁         │────────▶│  M5 intent 节点流程续接    │
└───────────────────────────┘ drives  └───────────────┬───────────┘
                                                      │
                                        ┌─────────────▼───────────┐
                                        │  M3 Checkpoint 断点持久化│
                                        └─────────────────────────┘
                                              complements M5

┌───────────────────────────┐
│  M7 ONNX + LanceDB +      │
│     BM25 混合检索          │
└────────────┬──────────────┘
             │ enables
┌────────────▼──────────────┐
│  M8 知识种子写入与          │
│     CI/CD 集成             │
└───────────────────────────┘

┌───────────────────────────┐       ┌───────────────────────────┐
│  M9 ToolRegistry 瞬时      │◀─────▶│  M10 LLMRouter 健康检测   │
│     错误自动重试            │ 互补   │      与信号系统           │
└───────────────────────────┘       └───────────────────────────┘

┌───────────────────────────┐       ┌───────────────────────────┐
│  M11 Worker SubGraph       │       │  M12 patchProjection      │
│      think↔tools 循环      │       │      增量写入             │
└───────────────────────────┘       └───────────────────────────┘
      ↑ 细化 A1 管线                        ↑ 细化 C6 工具集
```

关系说明：

- M1→M2：记忆系统建立后，多 Agent 场景需要按命名空间隔离不同 SubAgent 的记忆
- M3⇄M5：Checkpoint 持久化为 intent 续接提供状态快照基础，两者互补
- M6→M5：审计失败触发回退后，intent 节点判断从哪个位置续接
- M4⇄M1：冲突检测的消歧结果写回记忆系统，两者互补
- M7→M8：混合检索引擎建立后，知识种子写入与 CI/CD 确保检索内容持续新鲜
- M9⇄M10：ToolRegistry 瞬时重试处理工具层故障，LLMRouter 处理 LLM 层故障，两者各司其职互补
- M11 是 A1 管线中执行型 SubAgent 的内部实现机制
- M12 是 C6 工具集协议中 write_page 工具的核心写入机制

---

## 记忆与状态

### M1. 记忆系统

**✅ 已实施**

AgentMemory 统一层管理中期经验和长期偏好，通过 OrchestratorState.agentMemory 字段注入 SubAgent 上下文。

**决策链：** Agent 需要跨轮对话积累对用户偏好和项目事实的记忆。最初设计为三维度（Preferences + Anchor + Raw Messages），演进中 Anchor 被废除（锚点内容可从当前应用状态动态生成，无需静态存储），Preferences 从独立层级合并入 AgentMemory 统一管理。记忆层最终定位为中期经验（近期操作摘要）和长期事实（用户偏好和项目约束）。消费方式通过 OrchestratorState 在图节点间传递，SubAgent 从 SubAgentInput.agentMemory 字段读取。

**实现：** OrchestratorState 中的 `agentMemory: Annotation<string>` 字段承载序列化后的记忆文本；xiangdi-server 在 `/ai/run` 请求处理时从外部记忆存储加载并注入 state。记忆的持久化存储实现由 xiangdi-server 层管理（非 xiangdi-agent 包职责）。

**约束：**

- 记忆写入幂等——相同语义的偏好不重复存储
- 记忆按 owner 隔离（Multi-Agent 场景下每个 SubAgent 有独立命名空间，共享应用级记忆需显式声明）
- 记忆容量有限，定期衰减过时经验
- xiangdi-agent 包只定义记忆消费接口（OrchestratorState.agentMemory），不包含存储实现

**反例：**

- 三维度分离记忆（Preferences + Anchor + Raw Messages）——Anchor 维度被废除：锚点试图静态存储"当前应用关键状态"，但应用状态随时变化，静态锚点会过时。改为从当前 appJSON 动态生成上下文摘要

---

### M2. Multi-Agent 记忆命名空间

**📋 已规划** · 细化 M1

按 owner（SubAgent 角色）隔离记忆存储，避免不同 SubAgent 的记忆互相污染。

**决策链：** 统一管线下多个 SubAgent 并行运行，若共享同一记忆空间，前端 Worker 写入的 UI 偏好可能被后端 Worker 误读为自己的约束。解决方案：每个 SubAgent 有独立命名空间写入记忆，应用级公共记忆（用户全局偏好）存入共享空间，读取时按声明的依赖合并。

**约束：**

- 写入隔离：SubAgent 只能写自己命名空间
- 读取合并：SubAgent 可读取共享空间 + 自己命名空间
- 应用级偏好（如"我喜欢蓝色主题"）写入共享空间
- 领域级偏好（如"数据表字段用 camelCase"）写入对应 SubAgent 命名空间

---

### M3. Checkpoint 断点持久化

**✅ 已实施** · 补充 M5

利用 LangGraph Checkpointer 实现流程断点持久化，支持审计回退后从中间状态精确恢复，以及 awaiting_confirm 暂停等待用户操作后恢复执行。

**实现：** `apps/xiangdi-server/src/checkpoint/`（SqliteCheckpointStore / MemoryCheckpointStore / 工厂入口）

- SQLite 后端（默认）：单文件 `./data/checkpoints.db`，含 TTL 清理定时任务
- Memory 后端（开发用）：纯内存，服务重启丢失
- 后端选择通过 `CHECKPOINT_BACKEND` 环境变量
- 全局单例，服务启动时初始化，Graceful Shutdown 时清理

**决策链：** 扁平管线中审计失败需要精确回退到某个节点重跑，且需保留已完成节点的工件。LangGraph Checkpointer 天然支持每个节点执行后自动持久化状态快照，回退时只需从目标节点的 checkpoint 恢复。同时支持 awaiting_confirm 场景（暂停等待用户操作后恢复执行）。

**约束：**

- 每个节点执行后 LangGraph 自动 checkpoint
- 回退时通过 rollbackResult.target 确定目标节点，清空目标及下游工件后从该节点重新执行
- awaiting_confirm 状态下 checkpoint 持久化，用户确认/拒绝后恢复
- Checkpoint 是技术基础设施——可随时清除而不影响业务数据正确性

**反例：**

- 中断恢复意图分类 + 失效传播策略（ResumeClassifier + 失效传播决定重跑阶段）——被"打断即新对话"模型取代：用户打断不恢复旧对话，而是开启新 Dialogue，intent 节点判断从哪个节点续接。彻底消除了复杂的中断恢复状态机

---

### M4. 冲突检测与消歧

**📋 已规划** · 补充 M1

ConflictDetector 检测用户意图与已有决策的冲突，只有 user_confirmed 来源的决策才触发 DisambiguationHandler 消歧流程。

**决策链：** 用户在多轮对话中可能发出与前序决策矛盾的指令（如"用蓝色主题"后又说"换成绿色"）。需要区分"覆盖旧决策"和"矛盾需确认"两种情况。解决方案：对每个决策标记来源（AI_inferred / user_confirmed / system_default），只有用户明确确认过的决策被新指令矛盾时才触发消歧确认，AI 推断的决策可以直接被覆盖。

**约束：**

- 只有 user_confirmed 来源的决策触发消歧
- 消歧结果写回记忆系统，更新决策来源为新的 user_confirmed
- 消歧不阻塞主流程——在新架构中，冲突检测可在 intent/requirements 节点内部完成，不作为独立中断点

---

## 流程控制

### M5. intent 节点流程续接

**✅ 已实施**

intent 节点在 task 路径上判断用户消息应从流水线哪个位置开始执行，实现流程续接/回退/跳转。

**实现：** `packages/xiangdi-agent/src/orchestration/nodes/intentNode.ts`

输出结构（IntentResult）：startFrom（目标 SubAgent）+ reasoning（判断理由）+ correctionHint?（修正要点）+ contextStrategy（fresh/inherit）

路由映射（routeAfterIntent）：requirements→"requirements" / uiDesign→"ui_design" / contract→"contract" / frontend|backend→"parallel_build"

**决策链：** chat/task 分类由前端 type 字段决定（routeByMode），intent 不再判断消息类型。其职责重新定位为"流程续接判断"：根据当前流程状态（哪些节点已完成、各阶段产出摘要）和用户新消息，决定目标起始节点和上下文策略（fresh/inherit）。无历史状态时程序化直接返回 requirements，有历史时 LLM 判断。

**约束：**

- 使用轻量模型（DeepSeek-V3），路由判断不需要深度推理
- Structured output（Zod schema 约束），token 预算 <= 1K input + <= 200 output
- 无历史状态时可跳过 LLM 调用，程序化直出
- 直接路由到 Worker 的前提：历史工件完整 + 用户诉求不涉及需求/契约变更

---

### M6. 审计与回退仲裁

**✅ 已实施** · 驱动 M5

审计节点执行程序化校验（零 token）+ LLM 语义校验，失败时 rollback 节点用 LLM 仲裁退回目标节点。

**实现：** `packages/xiangdi-agent/src/orchestration/nodes/auditNode.ts`（审计）+ `rollbackNode.ts`（回退仲裁）

审计结果类型（AuditResult）：passed + failReasons?（category:reference_integrity|schema_validation|requirement_coverage|worker_failure|semantic_inconsistency + description + involvedArtifacts）+ suggestedTarget?

回退结果类型（RollbackResult）：target + reasoning + feedbackForTarget

路由逻辑：auditResult.passed → "commit"，否则 → "rollback"；rollbackResult.target 映射到具体图节点

**决策链：** 前后端并行执行后需要一个质量关卡验证产出一致性。审计内容包括：引用完整性（callFlow → 函数 ID 存在性）、Schema 合法性（fromAIProjection 验证 + FlowSchema 完整性）、需求覆盖度。程序化校验能覆盖的不消耗 token，语义层面走 LLM。失败后 rollback 节点根据结构化失败原因 + 工件摘要 + 历史回退记录，LLM 仲裁最小回退目标，注入修正指令后从目标节点重跑。

**约束：**

- 最小回退原则：退到能修复问题的最近节点
- 避免循环：检查 rollbackCount，同类问题再次出现则退到更上游
- 两个 Worker 都失败时优先退到 contract
- feedbackForTarget 必须具体可操作（不写"请修复问题"，要写具体缺失内容）
- rollbackCount 硬上限 3，超过直接终止

---

## 知识检索

### M7. ONNX + LanceDB + BM25 混合检索

**✅ 已实施**

知识检索采用混合策略：ONNX 本地 Embedding 生成向量 → LanceDB 向量检索 + BM25 稀疏检索 → RRF 分数融合 → Cross-Encoder 精排 → 返回 Top-K 结果。

**实现：** `apps/knowledge-server/src/services/`（KnowledgeService + EmbeddingService + RerankerService）

技术选型：

- Embedding 模型：`Xenova/multilingual-e5-small`（384 维），通过 `@huggingface/transformers` 加载 ONNX 推理
- E5 规范：query 前缀 `"query: "`，passage 前缀 `"passage: "`
- 向量存储：LanceDB（嵌入式列式存储），表名 `knowledge_v{banvasglVersion}`
- Cross-Encoder：`Xenova/ms-marco-MiniLM-L-6-v2`（22M 参数），逐对打分，sigmoid 归一化到 0~1

**决策链：** 纯向量检索对精确术语（如 "CombinedView"）召回不稳定 → BM25 擅长精确匹配补位 → 两路结果需要融合 → RRF 是简单有效的融合算法 → 精排进一步过滤语义不相关的结果 → 全链路本地执行，无外部依赖。

**约束：**

- ONNX Runtime 在服务启动时懒加载模型（首次调用时初始化 Pipeline），后续推理 < 50ms
- LanceDB 按 BanvasGL 版本创建独立表，版本隔离
- RRF 融合参数：k=60（标准值），vectorWeight=0.6 / ftsWeight=0.4（向量略优先于精确匹配）
- Cross-Encoder 默认启用（candidates > 1 即触发），粗排取 topK × rerankFactor（默认 4 倍）候选送精排
- Cross-Encoder 逐对打分（非批量，transformers.js 不保证批量稳定性），maxCandidates=20 防延迟飙升
- Cross-Encoder 失败时降级到粗排结果（try-catch 容错）
- 全链路在 knowledge-server 进程内完成，不依赖外部向量数据库服务
- FTS 索引在每次 upsert 后 `replace: true` 全量重建（小规模知识库可行）
- 新表创建时插入 `__init__` 占位记录再删除（绕过 LanceDB createTable 要求至少一条数据的 API 限制）

**反例：**

- 纯向量检索——对专有名词（ViewType 名、FlowNode kind 名）召回率不足
- 外部向量数据库（Pinecone/Milvus）——增加外部依赖和网络延迟，小规模知识库不值得
- 云端 Embedding API——每次检索都有网络延迟 + 成本，本地 ONNX 更适合
- 批量 Cross-Encoder 推理——transformers.js text-classification 不保证批量输入稳定性，选择逐对打分

---

### M8. 知识种子生成与 CI/CD 集成

**⚠️ 部分实施** · 依赖 M7 · 投影边界见 schema 域 M4

知识种子由基础库 CI/CD 流程生成（格式维度 = 序列化全量快照自动产出，语义维度 = LLM 生成草稿），经**人工审批**后发送到 knowledge 服务；知识服务将种子 JSON **落本地作为事实源**，再导入 LanceDB 向量库供检索。CI 守护 Freshness 未实施。

**完整数据流：**

```
基础库（BanvasGL）更新
  → 触发 CI/CD 流程
  → 自动生成格式维度（序列化模块全量快照）
  → LLM 生成语义维度（是什么 / 什么场景该选）
  → 合并成种子 JSON
  → 【人工 review / 审批】确认通过
  → 发送到 knowledge 服务
  → 知识服务落本地 JSON（事实源，可追溯 / 回滚）
  → 导入 LanceDB 向量库（按版本隔离 knowledge_v{version}，派生检索副本）
  → xiangdi 服务运行时通过 knowledge_search 按需消费（消费侧投影，见 M4）
```

**事实源的位置——本地 JSON 而非 Git：** 种子 JSON 持久化在 knowledge 服务本地（`apps/knowledge-server/seeds/`），作为可追溯、可回滚的事实源；向量库是从本地 JSON 导入的派生检索副本（脏数据/重建/版本回滚都从本地 JSON 还原）。种子不再以"入 Git 当唯一事实源"的形态存在——生成与落库都收敛进 CI/CD 流水线，质量门由生成阶段的人工审批承担。

**实现（已完成部分）：** `apps/knowledge-server/scripts/seed-knowledge.ts`

种子写入脚本能力：

- 从 `apps/knowledge-server/seeds/` 递归读取 JSON 文件（按 category 子目录组织）
- 通过 HTTP API（`POST /knowledge/upsert`）写入 knowledge-server，导入 LanceDB
- 支持分层写入：`--layer primitive|composition|convention|all`
- 幂等执行：按 id 先删旧再写新（非原子，但嵌入式 DB 够用）
- category 与目录一致性校验

**未实施部分：** CI/CD 自动生成（格式快照生成器 + LLM 语义生成 + 人工审批门）、CI knowledge-guard（Freshness blocking + 影响分析 non-blocking）

**决策链：** 引擎代码演进时知识必须同步 → 依赖开发者记忆不可靠 → 收敛进基础库 CI/CD 自动生成 → 格式维度可全自动（序列化快照），语义维度 LLM 生成质量不可盲信 → 入库前必须经人工审批把质量门 → 种子 JSON 落知识服务本地作事实源，向量库为派生副本可随时重建。

**约束：**

- 格式维度由序列化模块全量快照自动生成，跟随基础库 CI/CD 运行；快照入库不投影，消费侧投影（M4）
- 语义维度 LLM 生成草稿后，必须经人工 review/审批才发送到知识服务（不直接入库）
- 种子 JSON 落 knowledge 服务本地作事实源，向量库为导入的派生副本（可从本地 JSON 重建）
- CD 部署阶段执行 seed-knowledge.ts 将种子幂等写入 knowledge-server
- 种子写入按版本隔离表，升级时创建新表并写入全量种子

**反例：**

- 语义维度 LLM 直接入库不经人工审批——程序化验证只能验格式，验不了"选型是否合理"，质量失控
- 只存向量库不留本地 JSON——脏数据无法溯源，版本回滚/重建丢失事实源
- 在知识服务里做投影后再存——违反 app 域 A2 隔离，且知识服务无投影工具（见 M4）
- 定时批量同步——与基础库版本变更无因果关系，可能延迟多天知识才同步

---

## 稳定性机制

### M9. ToolRegistry 瞬时错误自动重试

**✅ 已实施**

工具执行层内置指数退避重试机制：识别瞬时错误（网络超时/429/5xx）自动重试，逻辑错误不重试直接返回让 LLM 在下一轮 think 中自行修正。

**实现：** `packages/xiangdi-agent/src/core/ToolRegistry.ts`

重试策略：

- 瞬时错误识别（isTransientError）：ECONNRESET/ECONNREFUSED/ETIMEDOUT/socket hang up/timeout + HTTP 429 + HTTP 5xx + rate limit 关键字 + service unavailable
- 指数退避参数：maxRetries=3、initialDelayMs=500、backoffMultiplier=2、maxDelayMs=5000
- 非瞬时错误（参数不合法、资源不存在等逻辑错误）：立即返回 `{ result: errorMessage, is_error: true }`，不重试

**决策链：** 工具调用可能因网络抖动或下游服务暂时不可用而失败。如果每次瞬时错误都返回 LLM 让它重新决策，会浪费一轮 think 循环的 token 和延迟。在工具层自动重试瞬时故障，对 LLM 完全透明——LLM 只看到最终成功或"不可修复的错误"。逻辑错误不重试是因为 LLM 需要知道错误信息才能修正调用参数。

**约束：**

- 重试对 LLM 透明——LLM 不感知中间失败，只看到最终结果
- 所有重试均失败时返回 `is_error: true` + 错误描述，LLM 在下一轮 think 中修正
- RetryConfig 可通过 ToolRegistry 构造函数自定义
- 工具未注册时返回 `Tool "xxx" not found in registry.`，不重试

**反例：**

- 不重试直接返回 LLM——瞬时故障导致无意义的 think 循环浪费 token
- 无限重试——某些"瞬时"故障可能持续，maxRetries 兜底防止死循环
- 在 LLMRouter 层统一重试所有错误——LLM 调用的重试由 OpenAI SDK 内部负责，工具调用的重试由 ToolRegistry 负责，职责分离

---

### M10. LLMRouter 健康检测与信号系统

**✅ 已实施**

LLMRouter 在 LLMClient 之上提供 Provider 健康状态追踪、异常分类、信号发射。MVP 阶段检测并记录问题但不自动切换 Provider。

**实现：** `packages/xiangdi-agent/src/llm/LLMRouter.ts`

核心能力：

- Provider 健康状态追踪（ProviderHealth）：status（healthy/degraded/unavailable）、consecutiveFailures、avgLatencyMs（滑动窗口）、lastSuccessAt/lastFailureAt
- 6 种信号类型（RoutingSignalType）：rate_limited / timeout / server_error / model_error / high_latency / consecutive_failures
- 4 种建议动作（SuggestedAction）：retry / switch_provider / wait_and_retry / alert_user
- 响应质量检查（checkResponseQuality）：空 content、无文本且无工具调用视为 model_error
- 手动切换接口（switchTo）：供 xiangdi-server 的 `POST /ai/models/switch` 路由调用
- 运行时注册（registerProvider）：可动态添加 fallback Provider

**决策链：** LLM 服务可能限流（429）、超时、返回异常。需要在业务代码之外集中处理这些问题。LLMRouter 实现 LLMClient 接口——对 Orchestrator 完全透明——在代理层统一做异常检测和健康记录。底层重试由 OpenAI SDK 的 maxRetries 参数负责（默认 2 次），LLMRouter 只在 SDK 抛出最终错误后记录状态并发射信号。MVP 阶段 `autoSwitch: false`，不做真正的 Provider 切换。

**约束：**

- 实现 LLMClient 接口（createMessage + createMessageStream），对上层完全透明
- 高延迟阈值：30000ms（超过触发 high_latency 信号）
- 连续失败阈值：3 次（超过触发 consecutive_failures 信号 + 状态变为 unavailable）
- 延迟滑动窗口：10 次请求
- 信号历史保留最近 100 条
- 监听器错误不影响主流程（try-catch 吞掉）
- 当前部署：DeepSeek（primary，priority 0）+ Kimi（fallback，priority 1）

**反例：**

- 在每个 SubAgent 内部各自处理 LLM 异常——逻辑重复，且无法聚合全局健康状态
- 自动故障转移（MVP 阶段）——不同 Provider 的能力差异可能导致生成质量波动，需人工判断切换时机
- 在 LLMRouter 层做重试循环——与 SDK 内置重试冲突，导致重试爆炸

---

## 执行机制

### M11. Worker SubGraph（think↔tools 循环）

**✅ 已实施**

执行型 SubAgent（frontend/backend）通过 LangGraph 子图实现独立的 Agentic Loop：LLM 输出 tool_call → 执行工具 → 结果追加 messages → 再次调用 LLM，循环直到 LLM 不再调用工具或达到 maxIterations。

**实现：** `packages/xiangdi-agent/src/orchestration/nodes/workerGraph.ts`

子图结构：

```
[entry] → think（LLM 调用）→ [shouldContinue]
                                 ├── 有 tool_call → tools（执行工具）→ think
                                 └── 无 tool_call → [exit]（返回主图）
```

关键设计：

- 独立 StateAnnotation（与主图 OrchestratorStateAnnotation 不同，Worker 子图有自己的 messages channel）
- LLM 调用时注入角色专属 system prompt + SubAgentInput（前序工件 + 记忆 + 上下文）
- 工具执行结果通过 ToolMessage 追加到 messages
- 每轮循环触发 SSE 事件（tool_activity）
- maxIterations 限制防止死循环（默认 15，可通过 OrchestratorGraphConfig.workerMaxIterations 覆盖）

**决策链：** 执行型 SubAgent 需要多轮工具调用来完成复杂任务（如前端 Worker 需要多次 write_page 构建多个页面）。将 think↔tools 循环封装为 LangGraph 子图，主图层面只看到"frontend 节点执行完成/失败"，不关心内部循环了多少轮。子图模式还提供了独立 checkpoint——子图执行中如果服务重启，可以从最后一次工具调用结果处恢复。

**约束：**

- 每轮 LLM 可输出 0~N 个 tool_call（并行调用），执行后结果统一追加
- 终止条件：LLM 不输出 tool_call（表示任务完成）或达到 maxIterations
- Worker 模型可独立配置（workerModel），默认与 Orchestrator 主 LLM 相同
- 子图错误分级：output_validation/tool_execution(幂等) 在子图内部重试消化；硬超时/tool_execution(非幂等) 上报主图
- 子图输出通过 ArtifactStore 写入工件槽（FrontendArtifacts / BackendArtifacts）

**反例：**

- 手写 while 循环——无法利用 LangGraph 的 checkpoint、可观测性、并行执行能力
- 规划型也用子图——规划型只需 0~2 轮只读工具调用 + 一次结构化输出，子图模式过重

---

### M12. patchProjection 增量写入

**✅ 已实施**

前端 Worker 的 write_page 工具使用 Patch 语义写入：按 scene id 匹配更新/新增，保留未涉及的 scene 和 App-level 配置不变。

**实现：** `packages/xiangdi-agent/src/schema/patchProjection.ts`

写入语义：

- 输入：PatchProjectionInput（scenes?: AIProjectionScene[] + lifetimes?: AIAppLifetimes）
- 逻辑：遍历传入的 scenes，按 id 在 currentAppJSON 中匹配——id 已存在则替换该 scene（更新），id 不存在则追加到末尾（新增），未传入的 scene 完全保留不动
- lifetimes 传入时整体替换 App.lifetimes，未传入则保留原值
- 输出：PatchProjectionResult（updated[] + added[] + unchanged[] + lifetimesUpdated）

**设计动机：** 原始 `projectionToAppJSON(scenes, version)` 在还原 appJSON 时硬编码 `lifetimes: { onLaunch: null, onUnlaunch: null }`。如果应用已设置了 App 级生命周期（如"启动时初始化数据"），经过 AI 操作一轮 roundtrip 后 App 级 lifetimes 会被清空——数据丢失。根因是 `AIProjectionScene[]` 只建模了 Scene（页面）级别数据，没有建模 App 级元数据。当 `projectionToAppJSON` 从 scenes 数组重建 appJSON 时，缺少 App 级 lifetimes 的来源。patchProjection 的引入将写入语义从全量覆盖改为增量 patch——只更新涉及的 scene，保留其他所有内容（包括 App-level lifetimes）。

**与页面级执行的配合：** 前端 Worker 按页面逐一处理，每完成一个页面调用 patchProjection 写入。这与未来拆为多个 Page Worker 并行的写入方式完全一致——每个 Worker 独立 patch 自己负责的页面，数据结构无需变更。

**决策链：** 前端 Worker 通过 write_page 工具写入单页 AIProjection，早期 `projectionToAppJSON` 是全量覆盖语义（传入的 scenes 替换 appJSON 中所有 scenes）。问题：Worker 每次只写一页，全量覆盖会丢失其他页面和 App-level 配置（lifetimes）。patchProjection 将语义改为增量 patch——只更新涉及的 scene，保留其他所有内容。

**约束：**

- write_page 工具内部调用 patchProjection，对 Worker LLM 透明（LLM 只知道"写入一页"）
- scene 匹配逻辑以 id 为唯一键
- 写入操作在 AppRuntimeState（内存对象）上执行，不涉及网络 I/O
- fromAIProjection 验证在 patchProjection 内部调用，格式不合法时抛出明确错误供 Worker 修正

**反例：**

- projectionToAppJSON 全量覆盖——多页面应用中写入一页会丢失其他页面
- 细粒度 View-level patch——增加 Worker LLM 的认知负担（需要理解 diff 语义），整页替换对 LLM 更自然
