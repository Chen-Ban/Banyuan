# Agent · 机制级决策

> 某个机制怎么工作——XiangDi 智能体 + 知识服务的关键运行机制。

---

## 决策依赖图

```
┌───────────────────────────┐
│  M1 记忆系统               │
└────────────┬──────────────┘
             │ enables
┌────────────▼──────────────┐
│  M2 Multi-Agent            │
│     记忆命名空间            │
└───────────────────────────┘

┌───────────────────────────┐       ┌───────────────────────────┐
│  M3 Checkpoint 断点持久化  │       │  M4 冲突检测与消歧         │
└───────────────────────────┘       └───────────────────────────┘
             complements                      complements
┌───────────────────────────┐       ┌───────────────────────────┐
│  M5 intent 节点流程续接    │◀──────│  M6 审计与回退仲裁         │
└───────────────────────────┘       └───────────────────────────┘
                                              drives

┌───────────────────────────┐
│  M7 ONNX + LanceDB +      │
│     BM25 混合检索          │
└────────────┬──────────────┘
             │ enables
┌────────────▼──────────────┐
│  M8 知识保活与 CI/CD 集成  │
└───────────────────────────┘
```

关系说明：

- M1→M2：记忆系统建立后，多 Agent 场景需要按命名空间隔离不同 SubAgent 的记忆
- M3⇄M5：Checkpoint 持久化为 intent 续接提供状态快照基础，两者互补
- M6→M5：审计失败触发回退后，intent 节点判断从哪个位置续接
- M4⇄M1：冲突检测的消歧结果写回记忆系统，两者互补
- M7→M8：混合检索引擎建立后，知识保活 CI/CD 确保检索内容持续新鲜

---

## 记忆与状态

### M1. 记忆系统

**✅ 已实施**

AgentMemory 统一层管理中期经验（Episodic）和长期偏好（Preferences），通过 extractPreferences 节点在 graph 末端自动提取写入。

**决策链：** Agent 需要跨轮对话积累对用户偏好和项目事实的记忆。最初设计为三维度（Preferences + Anchor + Raw Messages），演进中 Anchor 被废除（锚点内容可从当前应用状态动态生成，无需静态存储），Preferences 从独立层级合并入 AgentMemory 统一管理。记忆层最终定位为 LocalEpisodicMemory（中期经验，近期操作摘要）和 LocalSemanticMemory（长期事实，用户偏好和项目约束）。消费方式走 ContextProvider 按需注入，不全量灌入 system prompt。

**约束：**

- extractPreferences 节点位于 graph 末端（END 前），只提取不执行
- 记忆写入幂等——相同语义的偏好不重复存储
- 记忆按 owner 隔离（Multi-Agent 场景下每个 SubAgent 有独立命名空间，共享应用级记忆需显式声明）
- 记忆容量有限，定期衰减过时经验

**反例：**

- 三维度分离记忆（Preferences + Anchor + Raw Messages）——Anchor 维度被废除：锚点试图静态存储"当前应用关键状态"，但应用状态随时变化，静态锚点会过时。改为从当前 appJSON 动态生成上下文摘要

---

### M2. Multi-Agent 记忆命名空间

**未实施** · 细化 M1

按 owner（SubAgent 角色）隔离记忆存储，避免不同 SubAgent 的记忆互相污染。

**决策链：** 统一管线下多个 SubAgent 并行运行，若共享同一记忆空间，前端 Worker 写入的 UI 偏好可能被后端 Worker 误读为自己的约束。解决方案：每个 SubAgent 有独立命名空间写入记忆，应用级公共记忆（用户全局偏好）存入共享空间，读取时按声明的依赖合并。

**约束：**

- 写入隔离：SubAgent 只能写自己命名空间
- 读取合并：SubAgent 可读取共享空间 + 自己命名空间
- 应用级偏好（如"我喜欢蓝色主题"）写入共享空间
- 领域级偏好（如"数据表字段用 camelCase"）写入对应 SubAgent 命名空间

---

### M3. Checkpoint 断点持久化

**未实施** · 补充 M5

利用 LangGraph Checkpointer 实现流程断点持久化，支持审计回退后从中间状态精确恢复。

**决策链：** 扁平管线中审计失败需要精确回退到某个节点重跑，且需保留已完成节点的工件。LangGraph Checkpointer 天然支持每个节点执行后自动持久化状态快照，回退时只需从目标节点的 checkpoint 恢复。同时支持 Human-in-the-Loop 场景（awaiting_confirm 暂停等待用户操作后恢复执行）。

**约束：**

- 每个 SubAgent 子图的入口和出口都有 checkpoint
- 回退时通过 artifactsReducer 的 clearFrom 操作清空目标节点及下游工件，再从目标节点 checkpoint 恢复执行
- awaiting_confirm 状态下 checkpoint 持久化，用户确认/拒绝后恢复

**反例：**

- 中断恢复意图分类 + 失效传播策略（ResumeClassifier + 失效传播决定重跑阶段）——被"打断即新对话"模型取代：用户打断不恢复旧对话，而是开启新 Dialogue，intent 节点判断从哪个节点续接。彻底消除了复杂的中断恢复状态机

---

### M4. 冲突检测与消歧

**未实施** · 补充 M1

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

**决策链：** chat/task 分类由前端 type 字段决定，intent 不再判断消息类型。其职责重新定位为"流程续接判断"：根据当前流程状态（哪些节点已完成、各阶段产出摘要）和用户新消息，决定目标起始节点和上下文策略（fresh/inherit）。无历史状态时程序化直接返回 requirements，有历史时 LLM 判断。

**约束：**

- 使用轻量模型（DeepSeek-V3），路由判断不需要深度推理
- Structured output（Zod schema 约束），token 预算 <= 1K input + <= 200 output
- 无历史状态时可跳过 LLM 调用，程序化直出
- 直接路由到 Worker 的前提：历史工件完整 + 用户诉求不涉及需求/契约变更

---

### M6. 审计与回退仲裁

**✅ 已实施** · 驱动 M5

审计节点执行程序化校验（零 token）+ LLM 语义校验，失败时 Orchestrator 用 LLM 仲裁退回目标节点。

**决策链：** 前后端并行执行后需要一个质量关卡验证产出一致性。审计内容包括：引用完整性（callFlow -> 函数 ID 存在性）、Schema 合法性（fromAIProjection 验证 + FlowSchema 完整性）、需求覆盖度。程序化校验能覆盖的不消耗 token，语义层面走 LLM。失败后 Orchestrator 根据结构化失败原因 + 工件摘要 + 历史回退记录，LLM 仲裁最小回退目标，注入修正指令后从目标节点重跑。

**约束：**

- 最小回退原则：退到能修复问题的最近节点
- 避免循环：检查 previousRollbacks，同类问题再次出现则退到更上游
- 两个 Worker 都失败时优先退到 contract
- feedbackForTarget 必须具体可操作（不写"请修复问题"，要写具体缺失内容）

---

## 知识检索

### M7. ONNX + LanceDB + BM25 混合检索

**✅ 已实施**

知识检索采用混合策略：ONNX 本地 Embedding 生成向量 -> LanceDB 向量检索 + BM25 稀疏检索 -> RRF 分数融合 -> Cross-Encoder 精排 -> 返回 Top-K 结果。

**决策链：** 纯向量检索对精确术语（如 "CombinedView"）召回不稳定 -> BM25 擅长精确匹配补位 -> 两路结果需要融合 -> RRF 是简单有效的融合算法 -> 精排进一步过滤语义不相关的结果 -> 全链路本地执行，无外部依赖。

**约束：**

- ONNX Runtime 在服务启动时加载模型（冷启动约 2-3s），后续推理 < 50ms
- LanceDB 按 BanvasGL 版本创建独立表（knowledge_v{major}.{minor}），版本隔离
- Cross-Encoder 精排是可选步骤，候选集 > 10 条时启用
- 全链路在 knowledge-server 进程内完成，不依赖外部向量数据库服务

**反例：**

- 纯向量检索——对专有名词（ViewType 名、FlowNode kind 名）召回率不足
- 外部向量数据库（Pinecone/Milvus）——增加外部依赖和网络延迟，小规模知识库不值得
- 云端 Embedding API——每次检索都有网络延迟 + 成本，本地 ONNX 更适合

---

### M8. 知识保活与 CI/CD 集成

**未实施** · 依赖 M7

知识种子 JSON 文件入 Git 仓库，CI 守护 Freshness：Primitive Seeds 由生成器脚本自动生成（100% 自动化），Composition Seeds 半自动（CI 报告影响范围，人工决定是否更新），Convention Seeds 纯人工。

**决策链：** 引擎代码演进时知识必须同步 -> 依赖开发者记忆不可靠 -> CI 自动检测并 block 过期的 PR -> 种子入 Git 可以 Code Review、git blame、做影响分析。

**约束：**

- Primitive Seeds 过期会 block PR（CI knowledge-guard job 检测 content hash 不匹配）
- Composition Seeds 通过 metadata.dependencies 声明依赖的 Primitive ID，CI 分析影响范围并报告
- CD 部署阶段执行 seed-knowledge.ts 将种子幂等写入 knowledge-server
- 种子写入按版本隔离表，升级时创建新表并写入全量种子

**反例：**

- 种子不入 Git（纯 CI 产物）——无法 Code Review 知识变更，无法追溯历史
- postbuild 直连 knowledge-server——本地可能没启动服务，CI 环境更没有，变成尽力而为
- 定时批量同步——与代码变更无因果关系，可能延迟多天知识才同步
