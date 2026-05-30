# ADR-033：Multi-Agent 记忆命名空间架构

**状态**：已采纳  
**决策日期**：2026-05-27  
**决策者**：陈班  
**依赖**：ADR-022（记忆管理系统）、ADR-026（上下文组装架构）、ADR-032（规划阶段 Multi-Agent 分层）

---

## 背景

ADR-032 将规划阶段拆分为四个 Subagent（PMAgent / ArchAgent / VisualAgent / TaskPlannerAgent）。
这带来了记忆系统的三个新问题：

**问题一：记忆污染**。现有的 `Episode` 和 `Fact` 是全局扁平结构，没有 owner 概念。
PMAgent 的产品迭代历史、ArchAgent 的 API 使用经验、VisualAgent 的视觉偏好，
全部混在同一个 `episodes.json` / `facts.json` 里。
每个 Subagent 检索时都会拿到大量无关记忆，既浪费 token 又引入噪音。

**问题二：上下文结构不统一**。现有五层上下文模型（L1-L5）对所有 Agent 是同一套模板。
但 ArchAgent 的输入是结构化的 FeatureList，不是自然语言对话，
强行注入 L4（recentMessages）是噪音而非信号。
不同 Subagent 需要不同的上下文层结构。

**问题三：写入权限无边界**。任何 Agent 都可以向任意位置写入记忆，
没有机制防止某个 Subagent 污染其他 Subagent 的记忆分区，
也没有机制保证跨 Agent 共享知识的质量。

不需要向后兼容——可以彻底重新设计存储结构和接口。

---

## 决策

### 一、记忆命名空间（MemoryNamespace）

引入 `MemoryNamespace` 作为记忆的第一维度，取代原来的扁平结构：

```typescript
type MemoryNamespace =
  | 'pm'      // PMAgent 私有：产品迭代历史、功能依赖图、用户意图模式
  | 'arch'    // ArchAgent 私有：API 使用经验、ADR 摘要、技术债记录
  | 'visual'  // VisualAgent 私有：视觉偏好、组件使用模式、设计规范
  | 'task'    // TaskPlannerAgent 私有：工具调用模式、操作序列经验
  | 'shared'; // Orchestrator 写入：跨 Agent 共享的全局约束和项目事实
```

**核心规则**：
- 每个 Subagent 只能读写自己的命名空间（`pm` / `arch` / `visual` / `task`）
- `shared` 命名空间只有 PlanningOrchestrator 可以写入，所有 Agent 可以读取
- 没有 `MemoryVisibility` 维度——命名空间本身就是边界，不需要额外的可见性控制

### 二、数据结构调整

#### Episode（中期记忆）

```typescript
// 旧结构
interface Episode {
  id: string;
  changeSpecId?: string;
  title: string;
  content: string;
  outcome: EpisodeOutcome;
  lessons?: string[];
  involvedEntities?: string[];
  tags?: string[];
  createdAt: number;
  lastAccessedAt: number;
  importance: number;
}

// 新结构：新增 namespace 字段
interface Episode {
  id: string;
  namespace: MemoryNamespace;  // ← 新增，必填
  changeSpecId?: string;
  title: string;
  content: string;
  outcome: EpisodeOutcome;
  lessons?: string[];
  involvedEntities?: string[];
  tags?: string[];
  createdAt: number;
  lastAccessedAt: number;
  importance: number;
}
```

#### Fact（长期记忆）

```typescript
// 旧结构
interface Fact {
  id: string;
  category: FactCategory;
  content: string;
  confidence: number;
  referenceCount: number;
  derivedFrom?: string[];
  createdAt: number;
  updatedAt: number;
}

// 新结构：新增 namespace 字段
interface Fact {
  id: string;
  namespace: MemoryNamespace;  // ← 新增，必填
  category: FactCategory;
  content: string;
  confidence: number;
  referenceCount: number;
  derivedFrom?: string[];
  createdAt: number;
  updatedAt: number;
}
```

#### FactCategory 扩展

原有的 `FactCategory` 是全局的，现在按命名空间语义扩展：

```typescript
type FactCategory =
  // shared 命名空间
  | 'project_constraint'   // 全局约束（"目标平台是移动端"、"主色调是蓝色"）
  | 'project_knowledge'    // 项目事实（"首页导航栏用了 position:fixed"）
  // pm 命名空间
  | 'feature_history'      // 功能迭代历史（"v2 新增了购物车功能"）
  | 'user_intent_pattern'  // 用户意图模式（"用户倾向于一次提多个功能"）
  // arch 命名空间
  | 'api_usage'            // API 使用经验（"修改布局时先 getAppState"）
  | 'error_pattern'        // 错误模式（"不能给 Group 节点设置 fill"）
  | 'adr_summary'          // ADR 摘要（"禁止新增独立布局容器 ViewType"）
  // visual 命名空间
  | 'design_pattern'       // 设计模式（"该项目用 8px 网格"）
  | 'user_preference'      // 视觉偏好（"用户喜欢圆角按钮"）
  | 'component_pattern'    // 组件使用模式（"列表页固定用 ListView + Card"）
  // task 命名空间
  | 'tool_sequence'        // 工具调用序列（"创建容器后必须先 setSize 再 addNode"）
  | 'operation_pattern';   // 操作模式（"批量修改用 applyPatch 而非逐个 updateNode"）
```

### 三、存储结构重设计

彻底重新设计文件存储路径，按命名空间分区：

```
旧结构：
  .xiangdi/memory/
    episodes.json   ← 所有 Agent 的经验混在一起
    facts.json      ← 所有 Agent 的事实混在一起

新结构：
  .xiangdi/memory/
    pm/
      episodes.json
      facts.json
    arch/
      episodes.json
      facts.json
    visual/
      episodes.json
      facts.json
    task/
      episodes.json
      facts.json
    shared/
      episodes.json
      facts.json
```

`LocalEpisodicMemory` 和 `LocalSemanticMemory` 的构造函数接收 `namespace` 参数，
自动将存储路径定向到对应分区：

```typescript
// 旧
new LocalEpisodicMemory({ storagePath: '.xiangdi/memory' })
// → 读写 .xiangdi/memory/episodes.json

// 新
new LocalEpisodicMemory({ storagePath: '.xiangdi/memory', namespace: 'arch' })
// → 读写 .xiangdi/memory/arch/episodes.json
```

`record()` 和 `store()` 方法自动将 `namespace` 字段注入到写入的数据中，
调用方无需手动传入（由实例的 namespace 决定）。

### 四、接口调整

#### EpisodicMemory 接口

```typescript
interface EpisodicMemory {
  // record 不再需要传 namespace，由实例决定
  record(episode: Omit<Episode, 'id' | 'namespace' | 'createdAt' | 'lastAccessedAt'>): Promise<Episode>;

  // recall 新增 namespace 参数，默认只查自己的命名空间
  // 传入 ['shared'] 可额外读取共享记忆
  recall(query: string, options?: EpisodicRecallOptions): Promise<Episode[]>;

  consolidate(options?: ConsolidateOptions): Promise<void>;
  getRecent(count: number): Promise<Episode[]>;
  size(): Promise<number>;
}

interface EpisodicRecallOptions {
  topK?: number;
  outcomeFilter?: EpisodeOutcome[];
  since?: number;
  tags?: string[];
  // 新增：是否同时检索 shared 命名空间，默认 true
  includeShared?: boolean;
}
```

#### SemanticMemory 接口

```typescript
interface SemanticMemory {
  // store 不再需要传 namespace，由实例决定
  store(fact: Omit<Fact, 'id' | 'namespace' | 'createdAt' | 'updatedAt' | 'referenceCount'>): Promise<Fact>;

  // recall 默认检索自己命名空间 + shared
  recall(query: string, options?: SemanticRecallOptions): Promise<Fact[]>;

  reinforce(factId: string): Promise<void>;
  weaken(factId: string): Promise<void>;
  getByCategory(category: FactCategory): Promise<Fact[]>;
  size(): Promise<number>;
}

interface SemanticRecallOptions {
  topK?: number;
  minConfidence?: number;
  categories?: FactCategory[];
  // 新增：是否同时检索 shared 命名空间，默认 true
  includeShared?: boolean;
}
```

#### MemoryManager 接口

`DefaultMemoryManager` 升级为 `NamespacedMemoryManager`，
每个 Subagent 持有一个绑定到自己命名空间的实例：

```typescript
interface NamespacedMemoryManager {
  readonly namespace: MemoryNamespace;
  readonly episodic: EpisodicMemory;   // 绑定到 this.namespace
  readonly semantic: SemanticMemory;   // 绑定到 this.namespace

  // 加载记忆：检索 this.namespace + shared
  loadForTask(taskDescription: string): Promise<string | null>;

  // 保存经验：写入 this.namespace
  saveAfterTask(
    episode: Omit<Episode, 'id' | 'namespace' | 'createdAt' | 'lastAccessedAt'>,
    extractFacts?: boolean
  ): Promise<void>;

  maintain(): Promise<void>;
}

// 工厂函数，PlanningOrchestrator 用它为每个 Subagent 创建专属实例
function createMemoryManager(
  namespace: MemoryNamespace,
  storagePath: string
): NamespacedMemoryManager;
```

`shared` 命名空间没有对应的 `NamespacedMemoryManager` 实例，
只有 PlanningOrchestrator 通过专用的 `SharedMemoryWriter` 接口写入：

```typescript
interface SharedMemoryWriter {
  // 写入跨 Agent 共享的全局约束
  writeConstraint(content: string, confidence?: number): Promise<Fact>;
  // 写入跨 Agent 共享的项目事实
  writeProjectFact(content: string, confidence?: number): Promise<Fact>;
  // 写入跨 Agent 共享的经验（如某次规划的整体结果）
  writeEpisode(episode: Omit<Episode, 'id' | 'namespace' | 'createdAt' | 'lastAccessedAt'>): Promise<Episode>;
}
```

### 五、各 Subagent 的上下文组装策略

不同 Subagent 的五层上下文（L1-L5）内容不同，L4 层可以为空：

```
PMAgent 上下文：
  L1 SystemPrompt   = PM 角色定义 + 功能需求输出格式规范
  L2 AgentMemory    = memory:pm:* + memory:shared:* 的检索结果
  L3 contextSummary = 历史 PM 规划轮次的 roundSummary 拼接
  L4 recentMessages = 最近几次用户提需求的对话（保留，PM 需要理解用户语气）
  L5 CurrentPrompt  = 用户当前输入

ArchAgent 上下文：
  L1 SystemPrompt   = Arch 角色定义 + TechPlan 输出格式规范 + BanvasGL 核心约束
  L2 AgentMemory    = memory:arch:* + memory:shared:* 的检索结果
  L3 contextSummary = 历史 Arch 规划轮次的 roundSummary 拼接
  L4 recentMessages = 空（ArchAgent 不看对话历史，只看结构化输入）
  L5 CurrentPrompt  = FeatureList JSON（PMAgent 的输出）

VisualAgent 上下文：
  L1 SystemPrompt   = Visual 角色定义 + VisualSpec 输出格式规范 + 组件库说明
  L2 AgentMemory    = memory:visual:* + memory:shared:* 的检索结果
  L3 contextSummary = 历史 Visual 规划轮次的 roundSummary 拼接
  L4 recentMessages = 空（VisualAgent 不看对话历史）
  L5 CurrentPrompt  = FeatureList + TechPlan JSON（上游两个 Agent 的输出）

TaskPlannerAgent 上下文：
  L1 SystemPrompt   = TaskPlanner 角色定义 + ChangeSpec 输出格式规范 + 工具协议说明
  L2 AgentMemory    = memory:task:* + memory:shared:* 的检索结果
  L3 contextSummary = 历史 TaskPlanner 规划轮次的 roundSummary 拼接
  L4 recentMessages = 空（TaskPlannerAgent 不看对话历史）
  L5 CurrentPrompt  = FeatureList + TechPlan + VisualSpec + 当前 pages 状态
```

**关键设计**：ArchAgent / VisualAgent / TaskPlannerAgent 的 L4 为空，
它们的输入是结构化的上游产物，不是自然语言对话。
只有 PMAgent 保留 L4，因为它需要理解用户的自然语言意图。

### 六、上下文分发机制

PlanningOrchestrator 负责为每个 Subagent 组装上下文，流程如下：

```
PlanningOrchestrator.run(userInput, appId):

  1. 从 banyan 后端拉取 shared 记忆（一次性，所有 Subagent 共用）

  2. runPMAgent(userInput):
     a. 拉取 memory:pm:* 记忆
     b. 组装 PMAgent 上下文（L1-L5，L4 = 最近对话）
     c. 调用 PMAgent LLM
     d. Zod 验证输出为 FeatureList
     e. 将本轮 Episode 写入 memory:pm:*
     f. 若检测到全局约束信号 → 通过 SharedMemoryWriter 写入 memory:shared:*

  3. runArchAgent(featureList):
     a. 拉取 memory:arch:* 记忆
     b. 组装 ArchAgent 上下文（L1-L5，L4 = 空，L5 = featureList）
     c. 调用 ArchAgent LLM（可使用 KnowledgeSearch 工具查询 BanvasGL 知识库）
     d. Zod 验证输出为 TechPlan
     e. 将本轮 Episode 写入 memory:arch:*

  4. runVisualAgent(featureList, techPlan):
     a. 拉取 memory:visual:* 记忆
     b. 组装 VisualAgent 上下文（L1-L5，L4 = 空，L5 = featureList + techPlan）
     c. 调用 VisualAgent LLM
     d. Zod 验证输出为 VisualSpec
     e. 将本轮 Episode 写入 memory:visual:*

  5. runTaskPlannerAgent(featureList, techPlan, visualSpec, pages):
     a. 拉取 memory:task:* 记忆
     b. 组装 TaskPlannerAgent 上下文（L1-L5，L4 = 空，L5 = 三份规格 + pages）
     c. 调用 TaskPlannerAgent LLM
     d. Zod 验证输出为 ChangeSpec
     e. 将本轮 Episode 写入 memory:task:*

  6. 将 ChangeSpec 写入 SharedMemoryWriter（整体规划结果）
  7. 返回 ChangeSpec 给 MasterGraph 的 think → tools 阶段
```

**共享记忆的写入时机**：
- PMAgent 完成后：若 FeatureList 中包含全局约束（目标平台、核心用户群等），Orchestrator 提取并写入 `shared`
- 整个规划完成后：Orchestrator 将本次规划的整体 Episode（做了什么、结果如何）写入 `shared`
- Subagent 自身不直接写 `shared`，只有 Orchestrator 有写入权限

### 七、extractMemory 节点的命名空间感知

现有的 `extractMemoryNode` 在 MasterGraph 末端运行，负责从本轮执行中提炼记忆。
Multi-Agent 架构下，它需要知道当前是哪个 Subagent 在运行，才能写入正确的命名空间。

解决方案：`extractMemoryNode` 接收 `namespace` 参数，
在 PlanningOrchestrator 调度每个 Subagent 时注入：

```typescript
// 每个 Subagent 的 LangGraph 子图末端都有一个绑定了 namespace 的 extractMemory 节点
const pmExtractMemory = createExtractMemoryNode({
  namespace: 'pm',
  memoryManager: pmMemoryManager,
  // ...
});
```

### 八、ContextBuilder 对 PlanningArtifact 的读取策略

中间产物持久化在独立的 `PlanningArtifact` collection 中（见 ADR-032 "中间产物持久化"章节）。
ContextBuilder 需要新增对 PlanningArtifact 的读取逻辑，为不同 Subagent 提供跨轮次上下文。

#### 读取时机

PlanningOrchestrator 在调度每个 Subagent 之前，向 banyan 后端请求上一轮已完成的 PlanningArtifact：

```typescript
// PlanningOrchestrator 初始化阶段（在任何 Subagent 执行前）
const previousArtifact = await banyanClient.getLatestArtifact(appId);
// → 查 PlanningArtifact collection: { appId, status: 'completed' }, sort by completedAt desc
```

#### 各 Subagent 的注入策略

```
PMAgent:
  L3 contextSummary 新增内容：
    - previousArtifact.featureList.output 序列化为 "上次规划的功能列表: ..."
    - 用途：增量更新时 PM 知道"上次做了什么功能"

ArchAgent:
  L3 contextSummary 新增内容：
    - previousArtifact.techPlan.output 序列化为 "上次的技术方案: ..."
    - 用途：增量需求时 Arch 知道"上次的 View 结构和 Schema"
  L5 CurrentPrompt 额外附带：
    - 当前 appSchema 最新状态（从 banyan 后端读取）

VisualAgent:
  L3 contextSummary 新增内容：
    - previousArtifact.visualSpec.output 序列化为 "上次的视觉规格: ..."
    - 用途：确保新页面与已有页面风格一致

TaskPlannerAgent:
  不需要 previousArtifact（每次都基于当轮 TechPlan + VisualSpec 全量生成 ChangeSpec）
```

#### 与 AgentMemory(L2) 的区别

- L2 AgentMemory：高度压缩的经验和事实（"上次用 Flex 布局效果好"），来自 `memory:*:*`
- L3 PlanningArtifact 注入：上一轮规划的结构化产物原文（FeatureList / TechPlan / VisualSpec），来自 MongoDB

两者是互补关系：L2 是跨多轮的"智慧积累"，L3 的 Artifact 注入是"最近一次的完整方案"，
为增量更新提供精确的 baseline。

#### Token 预算控制

上一轮 Artifact 可能很大，注入时需要裁剪：

```typescript
// SubAgentContextBuilder
buildContextSummary(namespace, previousArtifact):
  - PMAgent: 仅注入 featureList.output（features 列表的 title + priority），≤ 800 token
  - ArchAgent: 仅注入 techPlan.output（viewChanges + schemaChanges 摘要），≤ 1200 token
  - VisualAgent: 仅注入 visualSpec.output（designTokens + 页面布局骨架），≤ 1000 token
  - TaskPlannerAgent: 不注入 previousArtifact
```

裁剪策略是确定性的（不靠 LLM 压缩），直接用 Zod schema 的字段选择实现。

---

## 实施计划

### Phase 1：数据结构和存储层（不涉及 LLM 调用）

- [ ] `types.ts`：新增 `MemoryNamespace` 类型，`Episode` / `Fact` 新增 `namespace` 字段，扩展 `FactCategory`
- [ ] `LocalEpisodicMemory.ts`：构造函数新增 `namespace` 参数，`record()` 自动注入 namespace，`recall()` 新增 `includeShared` 选项，存储路径改为 `{storagePath}/{namespace}/episodes.json`
- [ ] `LocalSemanticMemory.ts`：同上，存储路径改为 `{storagePath}/{namespace}/facts.json`
- [ ] 新增 `SharedMemoryWriter.ts`：实现 `SharedMemoryWriter` 接口
- [ ] 新增 `NamespacedMemoryManager.ts`：替换 `DefaultMemoryManager`，新增 `createMemoryManager()` 工厂函数
- [ ] 删除 `DefaultMemoryManager.ts`

### Phase 2：上下文组装层

- [ ] 新增 `SubAgentContextBuilder.ts`：为每个 Subagent 实现专属的上下文组装逻辑（L1-L5，L4 可为空）
- [ ] `SubAgentContextBuilder` 新增 `buildContextSummary(namespace, previousArtifact)` 方法，按 namespace 裁剪注入上一轮 PlanningArtifact
- [ ] 修改 `createExtractMemoryNode`：接收 `namespace` 参数

### Phase 3：PlanningOrchestrator + 后端持久化对接

- [ ] 实现 `PlanningOrchestrator.ts`：调度四个 Subagent，管理共享记忆写入权限
- [ ] Orchestrator 初始化时通过 BanyanClient 拉取 `previousArtifact`（上一轮完成的 PlanningArtifact）
- [ ] Orchestrator 每个 Subagent 完成后通过 SSE `planning_progress` 事件通知 banyan 后端写入 Artifact
- [ ] 修改 `MasterGraph`：将 `spec` 节点替换为 `planning` 节点

---

## 后果

**正面**：
- 每个 Subagent 的记忆检索精度大幅提升（只看自己命名空间 + shared，无关噪音消失）
- 每次 `loadForTask()` 的 token 消耗降低（不再加载全量记忆）
- 共享记忆写入权限集中在 Orchestrator，质量可控
- 存储结构清晰，调试时可以直接查看各命名空间的文件

**负面**：
- 存储文件从 2 个变为 10 个（5 个命名空间 × 2 种记忆类型）
- `LocalEpisodicMemory` / `LocalSemanticMemory` 的接口有 breaking change

**缓解**：
- 10 个文件仍然是 JSON，调试成本低
- 不需要向后兼容，breaking change 可以直接做
