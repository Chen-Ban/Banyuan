# ADR-032：规划阶段 Multi-Agent 分层架构

**状态**：已采纳  
**决策日期**：2026-05-27  
**决策者**：陈班

---

## 背景

当前 MasterGraph 的规划阶段（`spec` 节点）将以下四个语义完全不同的子步骤压缩在单次 LLM 调用中：

1. **解析用户意图** → 理解模糊的自然语言诉求
2. **产出功能需求** → 将意图翻译为结构化的 Feature List
3. **产出技术方案** → 根据 Feature List 设计 BanvasGL 实现路径
4. **生成任务列表** → 将方案拆解为可执行的 ChangeSpec 原子操作

这四个步骤的思维模式、关注维度、输出格式完全不同，混在一起有三个明显问题：

**问题一：Prompt 指令互相干扰**。LLM 很难在同一个 context 里同时保持"用户视角的功能完整性"和"工程视角的实现可行性"。产品经理的思维（用户故事、功能边界）和架构师的思维（API 约束、数据结构）是正交的，混合 prompt 会导致两者都做得不够好。

**问题二：输出窗口压力**。需求越复杂，单次 LLM 调用的输出越容易截断。一个涉及多页面、多数据模型的需求，完整的 ChangeSpec 可能超过 8000 token，而 LLM 在长输出时质量会显著下降。

**问题三：记忆污染**。产品经理不需要知道 Canvas 渲染管线的细节，架构师不需要知道用户的历史偏好风格。但现在所有记忆都混在同一个 context 里，既浪费 token，又引入噪音。

**类比**：传统软件开发中，业务方提要求 → 产品经理分析产出需求 → 研发设计方案 → 开发执行。每个角色的知识域、关注点、输出物都不同。XiangDi 的规划阶段本质上是在整合这套流程，但当前实现把所有角色压缩成了一个人。

---

## 决策

### 将规划阶段拆分为四个串行 Subagent，每个 Subagent 对应一个专业角色

```
用户输入
    ↓
┌─────────────────────────────────────────────────────────────────┐
│                    PlanningOrchestrator                          │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │ PMAgent      │───▶│ ArchAgent    │───▶│ VisualAgent  │       │
│  │ 产品经理      │    │ 架构师        │    │ 视觉设计师    │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│          │                  │                   │                │
│          ▼                  ▼                   ▼                │
│     FeatureList        TechPlan           VisualSpec             │
│          └──────────────────┴───────────────────┘               │
│                             │                                    │
│                             ▼                                    │
│                   ┌──────────────────┐                          │
│                   │ TaskPlannerAgent │                           │
│                   │ 任务规划师        │                           │
│                   └──────────────────┘                          │
│                             │                                    │
│                             ▼                                    │
│                        ChangeSpec                                │
└─────────────────────────────────────────────────────────────────┘
    ↓
HarnessRunner 执行
```

### 四个 Subagent 的职责边界

#### PMAgent（产品经理）

**输入**：用户原始诉求（自然语言）+ 产品功能迭代历史  
**输出**：`FeatureList`（结构化功能需求列表）  
**关注维度**：
- 用户意图是什么（功能目标，不是实现方式）
- 与已有功能的承接关系（新功能是否依赖/扩展已有功能）
- 功能边界（这次要做什么，明确不做什么）
- 用户体验流程（用户如何使用这个功能）

**不关心**：BanvasGL API、数据结构、技术可行性

**记忆命名空间**：`memory:pm:*`
- 产品功能迭代历史（每次迭代做了什么）
- 用户的产品偏好（功能层面，如"喜欢简洁的交互"）
- 功能依赖图（哪些功能依赖哪些功能）

#### ArchAgent（架构师）

**输入**：`FeatureList` + BanvasGL 知识库 + 架构决策记录  
**输出**：`TechPlan`（技术方案）  
**关注维度**：
- 哪些 View 需要新增/修改
- 数据结构如何变化（新增哪些 Collection、字段）
- 涉及哪些 AISchema 字段
- 实现路径（用哪些 BanvasGL 能力组合实现）
- 技术约束（哪些做法被 ADR 禁止）

**不关心**：用户说了什么、视觉风格、具体像素值

**记忆命名空间**：`memory:arch:*`
- BanvasGL API 使用经验（哪些 API 组合有效/无效）
- 架构决策（ADR 摘要，避免重复踩坑）
- 技术债记录（已知的实现限制）

#### VisualAgent（视觉设计师）

**输入**：`FeatureList` + `TechPlan` + 用户视觉偏好记忆  
**输出**：`VisualSpec`（视觉规格）  
**关注维度**：
- 布局结构（页面如何组织）
- 视觉层级（主次关系、信息密度）
- 组件选型（用哪些 BanvasGL 内置物料）
- 设计规范（颜色、间距、圆角、字体）
- 与已有页面的风格一致性

**不关心**：技术实现细节、数据结构

**记忆命名空间**：`memory:visual:*`
- 用户视觉偏好（颜色、风格、密度偏好）
- 已有页面的设计规范（从历史生成中提取）
- 组件使用模式（哪些组件组合效果好）

#### TaskPlannerAgent（任务规划师）

**输入**：`FeatureList` + `TechPlan` + `VisualSpec` + 当前 pages 状态  
**输出**：`ChangeSpec`（可执行任务列表）  
**关注维度**：
- 将三份规格翻译为原子操作序列
- 操作之间的依赖关系（先创建容器再添加子元素）
- 操作的幂等性（避免重复创建）
- 任务粒度（每个任务对应一次工具调用）

**不关心**：为什么要做这个功能、视觉设计的理由

**记忆命名空间**：`memory:task:*`
- 工具调用模式（哪些操作序列是有效的）
- 常见错误模式（哪些操作顺序会失败）

### 接口契约（Subagent 间的数据格式）

所有 Subagent 的输入输出必须是 Zod Schema 固定的结构化格式，不能是自由文本。

```typescript
// PMAgent 输出
interface FeatureList {
  features: Feature[]
  outOfScope: string[]  // 明确不做的事
  dependencies: FeatureDependency[]
}

interface Feature {
  id: string
  title: string
  description: string
  userStory: string  // "作为...，我希望...，以便..."
  acceptanceCriteria: string[]
  priority: 'must' | 'should' | 'could'
  relatedExistingFeatures: string[]  // 与已有功能的关联
}

// ArchAgent 输出
interface TechPlan {
  viewChanges: ViewChange[]
  schemaChanges: SchemaChange[]
  constraints: string[]  // 技术约束说明
}

// VisualAgent 输出
interface VisualSpec {
  pages: PageVisualSpec[]
  designTokens: DesignTokens  // 颜色、间距、圆角等
  componentChoices: ComponentChoice[]
}

// TaskPlannerAgent 输出 = ChangeSpec（已有类型，复用）
```

### PlanningOrchestrator 的职责

Orchestrator 不做任何 LLM 调用，只负责：
1. 按顺序调度四个 Subagent
2. 将上游输出注入下游输入
3. 在每个 Subagent 完成后做 Guard 验证（输出格式合法性）
4. 处理 Subagent 失败（重试 or 降级）
5. 向前端推送规划进度 SSE 事件

---

## Subagent 子图架构

### 设计原则

每个 Subagent 是一个独立的 LangGraph `StateGraph`（子图），拥有：
- **独立的状态定义**（`SubAgentState`），不共享主图的 `MasterState`
- **专属的工具集**（通过各自的 `ToolRegistry` 实例，只注册该角色需要的工具）
- **独立的内部执行结构**（有些是单次 LLM 调用，有些是 `think↔tools` 循环）
- **独立的 LLM 配置**（model、temperature、max_tokens 可各自不同）

子图通过 `PlanningOrchestrator` 以函数调用方式组合（不是 LangGraph `addNode` 嵌套子图），
避免状态泄露和不必要的耦合。

### Subagent 通用状态

```typescript
// ─── Subagent 通用状态定义 ──────────────────────────────────────────────────

interface SubAgentState<TInput, TOutput> {
  // ─── 输入 ──────────────────────────────────────────────────────────────────
  /** 上游产物（由 Orchestrator 注入） */
  input: TInput;
  /** L1: 该 Agent 专属的 system prompt（从 AgentPrompt 解析） */
  systemPrompt: string;
  /** L2: 该 Agent 命名空间的记忆（从 NamespacedMemoryManager 加载） */
  agentMemory: string;
  /** L4: 对话上下文（仅 PMAgent 注入，其他 Agent 为空） */
  conversationContext: string;

  // ─── 执行状态 ──────────────────────────────────────────────────────────────
  /** think↔tools 的消息列表（带工具 Agent 使用） */
  messages: BaseMessage[];
  /** 当前迭代次数 */
  iteration: number;
  /** 最大迭代次数 */
  maxIterations: number;

  // ─── 输出 ──────────────────────────────────────────────────────────────────
  /** 结构化产出（Zod Schema 验证） */
  output: TOutput | null;
  /** 推理过程摘要（前端展示用） */
  reasoning: string;
}
```

### 四个 Subagent 的子图结构

#### PMAgent：纯 LLM 单次调用

```
START → generate → validate → END
         │                ↑
         └── 重试 ────────┘ （格式不合法时重试，最多 2 次）
```

PMAgent 不需要工具——它的输入是用户原始诉求 + 历史 FeatureList（跨轮次引用），
输出是纯推理产生的结构化 FeatureList。单次 LLM 调用 + Zod 验证即可。

**专属工具**：无

**状态**：`SubAgentState<PMAgentInput, FeatureList>`

```typescript
interface PMAgentInput {
  userMessage: string;                    // 用户原始诉求
  previousFeatureList?: FeatureList;      // 上一次规划的功能列表（增量更新）
  conversationContext: string;            // L4: 对话上下文
}
```

**图配置**：
```typescript
{
  model: 'deepseek-v4-pro',
  temperature: 0.3,         // 低温度，确保结构化输出稳定
  maxTokens: 4096,
  maxRetries: 2,            // validate 不通过时重试
}
```

#### ArchAgent：think↔tools 循环

```
START → think → route → tools → think → route → END
                  │                        │
                  └──── 无工具调用 ─────────┘
```

ArchAgent 需要查询知识库来了解 BanvasGL 的 API 约束和 ADR 决策，
因此是一个标准的 Agentic Loop（LLM 决定是否调用工具、调用哪个）。

**专属工具**：

| 工具名 | 用途 | 来源 |
|--------|------|------|
| `knowledge_search` | 查询 BanvasGL 文档、API Schema | knowledge-server |
| `get_adr_constraints` | 获取相关 ADR 约束条目 | 本地（从 ProjectSpec 提取） |
| `get_existing_schema` | 获取当前应用的 Schema 结构 | pages 状态 |

**不注册的工具**：`create_view`、`update_view`、`delete_view` 等所有写操作工具——
ArchAgent 只读取信息来设计方案，不执行任何变更。

**状态**：`SubAgentState<ArchAgentInput, TechPlan>`

```typescript
interface ArchAgentInput {
  featureList: FeatureList;               // 上游 PMAgent 产出
  previousTechPlan?: TechPlan;            // 上一次的技术方案（增量参考）
}
```

**图配置**：
```typescript
{
  model: 'deepseek-v4-pro',
  temperature: 0.4,
  maxTokens: 8192,          // TechPlan 可能较长
  maxIterations: 5,         // think↔tools 最多 5 轮
}
```

#### VisualAgent：think↔tools 循环（轻量）

```
START → think → route → tools → think → route → validate → END
                  │                        │         ↑
                  └──── 无工具调用 ─────────┘         │
                                                     └── 重试
```

VisualAgent 需要查看现有页面结构来保证风格一致性，但工具调用频率较低（通常 1-2 次）。

**专属工具**：

| 工具名 | 用途 | 来源 |
|--------|------|------|
| `get_page_tree` | 获取当前页面结构树（了解已有布局） | pages 状态 |
| `get_design_tokens` | 获取应用已有的设计 token（颜色/字体） | pages 状态 |

**不注册的工具**：knowledge_search（VisualAgent 不需要查 BanvasGL 底层文档），
所有写操作工具。

**状态**：`SubAgentState<VisualAgentInput, VisualSpec>`

```typescript
interface VisualAgentInput {
  featureList: FeatureList;               // PMAgent 产出
  techPlan: TechPlan;                     // ArchAgent 产出
  previousVisualSpec?: VisualSpec;        // 上一次的视觉规格（风格一致性参考）
}
```

**图配置**：
```typescript
{
  model: 'deepseek-v4-pro',
  temperature: 0.6,         // 略高温度，允许设计创意
  maxTokens: 6144,
  maxIterations: 3,         // 通常 1-2 次工具调用即可
}
```

#### TaskPlannerAgent：think↔tools 循环

```
START → think → route → tools → think → route → validate → END
                  │                        │         ↑
                  └──── 无工具调用 ─────────┘         │
                                                     └── 重试
```

TaskPlannerAgent 需要精确读取当前 pages 状态来生成幂等的原子操作序列。

**专属工具**：

| 工具名 | 用途 | 来源 |
|--------|------|------|
| `get_pages` | 获取完整 pages JSON（当前页面状态） | pages 状态 |
| `get_page_tree` | 获取页面结构树 | pages 状态 |
| `validate_change_spec` | 预检验 ChangeSpec 的合法性（字段/类型/引用） | 本地验证 |

**不注册的工具**：所有写操作工具、knowledge_search。

**状态**：`SubAgentState<TaskPlannerInput, ChangeSpec>`

```typescript
interface TaskPlannerInput {
  featureList: FeatureList;
  techPlan: TechPlan;
  visualSpec: VisualSpec;
}
```

**图配置**：
```typescript
{
  model: 'deepseek-v4-pro',
  temperature: 0.2,         // 最低温度，确保操作序列精确
  maxTokens: 12288,         // ChangeSpec 可能很长（多任务拆分）
  maxIterations: 5,
}
```

### 工具隔离机制

每个 Subagent 使用独立的 `ToolRegistry` 实例，由 Orchestrator 在调度时按角色注入：

```typescript
// PlanningOrchestrator 内部

class PlanningOrchestrator {
  private toolRegistries: Record<AgentRole, ToolRegistry>;

  constructor(config: PlanningOrchestratorConfig) {
    // 从主 ToolRegistry 中按角色筛选并创建子集
    this.toolRegistries = {
      pm: new ToolRegistry(),                           // 空：PMAgent 不需要工具
      arch: this.createSubRegistry(['knowledge_search', 'get_adr_constraints', 'get_existing_schema']),
      visual: this.createSubRegistry(['get_page_tree', 'get_design_tokens']),
      task: this.createSubRegistry(['get_pages', 'get_page_tree', 'validate_change_spec']),
    };
  }

  private createSubRegistry(allowedTools: string[]): ToolRegistry {
    const sub = new ToolRegistry();
    for (const name of allowedTools) {
      const handler = this.masterToolRegistry.getHandler(name);
      const def = this.masterToolRegistry.getDefinition(name);
      if (handler && def) sub.register(def, handler);
    }
    return sub;
  }
}
```

**为什么不直接共享主 ToolRegistry？**
1. **安全性**：ArchAgent 和 VisualAgent 绝对不应该执行写操作（`create_view` 等），即使 LLM 在幻觉下尝试调用，也应该在 ToolRegistry 层直接拒绝
2. **Prompt 精准**：LLM 的 tool definitions 越少，选择越精准，幻觉调用率越低
3. **Token 节省**：每个工具定义大约 200-500 token，4 个 Subagent 不共享工具集可节省大量 context token

### Subagent 创建工厂

```typescript
// graph/planningAgents/factory.ts

interface SubAgentFactory<TInput, TOutput> {
  /** 创建子图实例 */
  create(config: SubAgentConfig): CompiledStateGraph;
}

interface SubAgentConfig {
  /** LLM 客户端 */
  llmClient: LLMClient;
  /** 该 Agent 专属的 ToolRegistry（可为空） */
  toolRegistry: ToolRegistry;
  /** model/temperature/maxTokens/maxIterations */
  llmConfig: SubAgentLLMConfig;
  /** SSE 回调（进度推送） */
  streamCallback?: StreamCallback;
  /** Zod Schema 验证器（验证输出格式） */
  outputValidator: ZodSchema<TOutput>;
  /** 验证不通过时的最大重试次数 */
  maxValidationRetries?: number;
}

interface SubAgentLLMConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  maxIterations: number;  // think↔tools 循环上限（纯 LLM Agent 设为 1）
}
```

两种子图模式由 `maxIterations` 隐式区分：
- `maxIterations = 1` + 空 ToolRegistry → 纯 LLM 单次调用（PMAgent）
- `maxIterations > 1` + 非空 ToolRegistry → think↔tools Agentic Loop（ArchAgent / VisualAgent / TaskPlannerAgent）

### 与 MasterGraph Execute 阶段的对比

| 维度 | Planning Subagent | Execute 阶段 |
|------|-------------------|-------------|
| 目标 | 产出结构化中间产物 | 执行实际变更操作 |
| 工具类型 | 只读查询工具 | 读写操作工具 |
| 输出验证 | Zod Schema 强验证 | Audit LLM 后验 |
| 状态隔离 | 每个 Subagent 独立状态 | 所有 task 共享 MasterState |
| 迭代上限 | 较低（1-5） | 较高（30） |
| LLM temperature | 较低（0.2-0.6） | 较高（0.7） |
| 失败处理 | Orchestrator 降级/跳过 | Audit 重试 |

---

## 与现有架构的关系

### 对 MasterGraph 的影响

当前 `spec` 节点被替换为 `planning` 节点，`planning` 节点内部是一个 PlanningOrchestrator 子图：

```
原来：START → spec → think → tools → extractMemory → END

现在：START → planning → think → tools → extractMemory → END
                ↑
         PlanningOrchestrator 子图
         (PMAgent → ArchAgent → VisualAgent → TaskPlannerAgent)
```

`think → tools` 循环不变，仍然是 HarnessRunner 执行 ChangeSpec 的阶段。

### 对 SpecPlanner 的影响

现有 `SpecPlanner` 类（`spec/SpecPlanner.ts`）承担了当前 `spec` 节点的职责，将被重构为 `PlanningOrchestrator`，内部调度四个 Subagent。

### 对记忆系统的影响

见 ADR-033（记忆命名空间分层架构）。

---

## 考虑过的方案

### 方案 A：保持单节点，优化 Prompt（被否决）

通过更精细的 prompt 工程，在单次 LLM 调用中完成所有规划步骤。

缺点：
- 本质上是让一个 LLM 同时扮演四个角色，prompt 指令互相干扰无法根本解决
- 输出窗口压力随需求复杂度线性增长，无法解决截断问题
- 记忆污染问题无法解决（所有记忆仍然混在一起）

### 方案 B：并行 Subagent（被否决）

让 ArchAgent 和 VisualAgent 并行执行，而非串行。

缺点：
- VisualAgent 需要 TechPlan 才能做出合理的组件选型（知道有哪些 View 可用）
- 并行会产生冲突（VisualAgent 选了某个布局，但 ArchAgent 的方案不支持）
- 串行的延迟增加是可接受的（每个 Subagent 的 prompt 更短，单次调用更快）

### 方案 C：只拆 PM 和 Arch，不拆 Visual（被否决）

将视觉设计职责保留在 ArchAgent 中。

缺点：
- 视觉设计的知识域（设计规范、组件库、视觉层级）和架构设计完全不同
- 视觉偏好记忆（颜色、风格）和架构知识记忆（API 使用经验）混在一起是典型的记忆污染
- VisualAgent 是未来接入设计稿解析（D2C）的自然扩展点，独立出来更易演进

---

## 后果

**正面**：
- 每个 Subagent 的 prompt 更短、更聚焦，LLM 输出质量更高
- 记忆按职责边界隔离，每个 Subagent 只加载自己命名空间的记忆，省 token 且减少噪音
- 输出窗口压力分散到四次调用，每次输出量可控
- 接口契约（Zod Schema）使 Subagent 间的信息传递可验证、可测试
- VisualAgent 是未来 D2C（设计稿转代码）的自然扩展点

**负面**：
- 规划阶段从 1 次 LLM 调用变为 4 次，延迟增加
- 四个 Subagent 的接口契约需要维护
- Orchestrator 需要处理 Subagent 失败的降级逻辑

**缓解**：
- 每个 Subagent 的 prompt 更短，单次调用更快，总延迟增加有限（预估 +2~4s）
- 接口契约用 Zod Schema 固定，维护成本低
- 降级策略：任一 Subagent 失败时，Orchestrator 可以用上游输出直接跳过该步骤（如 VisualAgent 失败时，TaskPlannerAgent 用 TechPlan 直接生成 ChangeSpec）

---

## 中间产物持久化

### 动机

规划阶段的四个 Subagent 产出 FeatureList / TechPlan / VisualSpec / ChangeSpec，
这些中间产物必须在 banyan 后端持久化，原因有三：

1. **断点恢复**：某个 Subagent 失败时，Orchestrator 从持久化的上游产物恢复重试，不必从头重跑整条管线
2. **跨轮次增量更新**：下一次用户追加需求时，PMAgent 需要读取上一次的 FeatureList 做增量（"在上次基础上加搜索功能"），ArchAgent 需要读取上一次的 TechPlan 判断影响范围
3. **前端展示**：前端分角色渲染每个阶段的产出，需要可读取的持久化数据

### 决策：独立 PlanningArtifact Collection + Dialogue 外键引用

中间产物不嵌入 Dialogue 文档内部，而是作为独立的 MongoDB collection 存储，
Dialogue 通过外键 `planningArtifactId` 引用。

**理由**：
- 中间产物可能很大（VisualSpec 含完整布局描述、ChangeSpec 含多个 Task），嵌入 Dialogue 会导致单文档膨胀，影响 `getDialogues()` 查询性能
- 独立 collection 便于单独索引（按 appId + createdAt 查询历史规划产物）
- 跨轮次引用时，PMAgent 直接查 PlanningArtifact collection 获取上一次产物，不必解析 Dialogue 结构

### 数据模型

```typescript
// ─── PlanningArtifact Collection ─────────────────────────────────────────────

interface IPlanningArtifact {
  _id: ObjectId;
  appId: string;                      // 所属应用
  dialogueId: string;                 // 关联的 Dialogue（触发本次规划的对话）

  // 四个 Subagent 的产出（按完成顺序逐步写入）
  featureList?: IArtifactEntry<FeatureList>;
  techPlan?: IArtifactEntry<TechPlan>;
  visualSpec?: IArtifactEntry<VisualSpec>;
  changeSpec?: IArtifactEntry<ChangeSpec>;

  // 规划过程元信息
  status: 'running' | 'completed' | 'partial' | 'failed';
  failedAt?: 'pm' | 'arch' | 'visual' | 'task';
  startedAt: Date;
  completedAt?: Date;
}

interface IArtifactEntry<T> {
  agent: 'pm' | 'arch' | 'visual' | 'task';
  output: T;                          // Zod Schema 验证过的结构化产出
  reasoning?: string;                 // Agent 推理过程摘要（前端展示用）
  tokenUsage: { input: number; output: number };
  durationMs: number;
  createdAt: Date;
}

// ─── Dialogue 引用 ────────────────────────────────────────────────────────────

interface IDialogue {
  // ... 现有字段不变
  type: 'chat' | 'task';
  threadId: string;
  threadStatus: 'running' | 'completed' | 'interrupted' | 'failed';
  messages: IMessage[];
  summary?: string;
  embedding?: number[];

  // 新增：引用规划产物（仅 type='task' 时存在）
  planningArtifactId?: ObjectId;
}
```

### 写入时序

```
用户发送 task 请求
    ↓
banyan 后端 AiService:
  1. createDialogue(appId, 'task', userContent)
  2. createPlanningArtifact(appId, dialogueId) → 写入空壳文档，status='running'
  3. dialogue.planningArtifactId = artifact._id
    ↓
XiangDi PlanningOrchestrator 执行（通过 SSE 事件逐步通知）:
  4. PMAgent 完成 → SSE: planning_progress { agent:'pm', status:'completed', output }
     → banyan 后端回调: updateArtifact(artifactId, { featureList: entry })
  5. ArchAgent 完成 → SSE + 同上
  6. VisualAgent 完成 → SSE + 同上
  7. TaskPlannerAgent 完成 → SSE + 同上
     → banyan 后端回调: updateArtifact(artifactId, { changeSpec: entry, status:'completed' })
    ↓
后续 think → tools 执行阶段（不变）
```

### 跨轮次引用

PMAgent 在 L3（contextSummary）中注入上一次规划产物的摘要：

```
PlanningOrchestrator.run():
  0. previousArtifact = await PlanningArtifact.findOne(
       { appId, status: 'completed' },
       { sort: { completedAt: -1 } }
     )
  // 将 previousArtifact.featureList.output 序列化后作为 PMAgent 的 L3 内容
  // ArchAgent 拿到 previousArtifact.techPlan.output 作为参考
```

---

## 前端规划进度展示

### SSE 事件协议

```typescript
// 新增 AssistantContent 类型
interface IPlanningProgressContent {
  type: 'planning_progress';
  agent: 'pm' | 'arch' | 'visual' | 'task';
  status: 'started' | 'completed' | 'failed';
  // status='completed' 时携带产物摘要（前端展示用，非完整 JSON）
  summary?: string;
  // 可选：前端用此字段渲染结构化预览
  artifactPreview?: {
    featureCount?: number;       // PM: 产出了几个功能
    viewChanges?: number;        // Arch: 涉及几个 View 变更
    schemaChanges?: number;      // Arch: 涉及几个 Schema 变更
    pageCount?: number;          // Visual: 涉及几个页面
    taskCount?: number;          // Task: 拆出几个任务
  };
}
```

### 前端 UI：分角色规划进度卡片

ConversationPanel 在收到 `planning_progress` 事件后，渲染一个步骤列表卡片：

```
┌─────────────────────────────────────────────────────┐
│ 🧭 规划中...                                         │
│                                                      │
│  ✓ 产品分析    3 个功能需求                           │
│  ✓ 技术方案    新增 2 个 View，修改 Schema 1 处       │
│  ● 视觉设计    生成中...                              │
│  ○ 任务拆解    等待中                                 │
│                                                      │
│  [ 查看详情 ▾ ]                                      │
└─────────────────────────────────────────────────────┘
```

**交互行为**：
- 每个步骤实时更新状态（○ 等待 → ● 进行中 → ✓ 完成 / ✗ 失败）
- "查看详情"展开后，按 Tab 切换四个角色的产出：
  - PM Tab：FeatureList 渲染为功能卡片列表（标题 + 用户故事 + 优先级标签）
  - Arch Tab：TechPlan 渲染为 View 变更表格 + Schema Diff
  - Visual Tab：VisualSpec 渲染为布局描述 + 设计 Token 色块
  - Task Tab：ChangeSpec 渲染为任务清单（复用现有 ChangeSpec 展示组件）
- 规划全部完成后，卡片自动收起（可手动再展开），后续执行阶段的 tool_call/tool_result 继续用现有气泡混排方式

### 前端数据获取

对话初始化时，`useXiangDi` hook 通过新 API 获取 PlanningArtifact：

```typescript
// 新增 API
GET /applications/:appId/conversation/dialogues/:dialogueId/planning-artifact
// → 返回 IPlanningArtifact（含四个 Agent 的完整产出）
```

历史 Dialogue 加载时，若 `dialogue.planningArtifactId` 存在，额外请求该 API 获取产物数据，渲染为折叠的规划卡片。

### 前端组件结构

```
AiBar/
  ConversationPanel/
    index.tsx                   // 现有，新增 PlanningCard 渲染逻辑
    PlanningCard/               // 新增
      index.tsx                 // 规划进度卡片容器
      StepIndicator.tsx         // 步骤状态指示器（○ ● ✓ ✗）
      ArtifactTabs.tsx          // 详情 Tab 切换
      FeatureListView.tsx       // FeatureList 卡片列表渲染
      TechPlanView.tsx          // TechPlan 表格渲染
      VisualSpecView.tsx        // VisualSpec 预览渲染
      ChangeSpecView.tsx        // ChangeSpec 任务清单渲染
```

---

## Prompt 持久化与用户可配置

### 动机

当前各 Agent 的 system prompt 硬编码在代码中（`buildSystemPrompt()` + 各 Subagent 角色定义），
用户完全不可见、不可改。但不同应用需要不同的 Agent 行为风格——
教育应用的 VisualAgent 应强调"色彩鲜艳、卡通风格"，
企业后台的 VisualAgent 应强调"信息密集、专业克制"。

将 prompt 存到数据表中，系统提供初始默认值，用户可在设置中查看和修改。

### 决策：AgentPrompt Collection + 应用级覆写

```typescript
// ─── AgentPrompt Collection ──────────────────────────────────────────────────

interface IAgentPrompt {
  _id: ObjectId;
  appId: string;                      // 所属应用（应用级个性化）
  agent: AgentRole;                   // 哪个 Agent 的 prompt
  promptText: string;                 // 用户自定义的 prompt 内容
  isCustomized: boolean;              // 是否被用户修改过（区分"系统默认"和"用户自定义"）
  systemVersion: number;              // 对应的系统默认 prompt 版本号
  createdAt: Date;
  updatedAt: Date;
}

type AgentRole =
  | 'master'    // MasterGraph 主 Agent（think → tools 循环）
  | 'pm'        // PMAgent
  | 'arch'      // ArchAgent
  | 'visual'    // VisualAgent
  | 'task';     // TaskPlannerAgent
```

### 解析优先级

```
加载某个 Agent 的 system prompt 时：
  1. 查 AgentPrompt collection: { appId, agent }
  2. 若存在且 isCustomized=true → 使用用户自定义版本
  3. 若不存在或 isCustomized=false → 使用代码中的系统默认版本
```

系统升级时（默认 prompt 有优化），检测 `systemVersion` 字段：
- 若用户未自定义（`isCustomized=false`）：静默升级到新版本
- 若用户已自定义（`isCustomized=true`）：不覆盖用户内容，
  但在设置页面提示"系统 prompt 有新版本可用，是否查看差异并合并"

### 系统默认 Prompt 的存储

系统默认 prompt 仍然保留在代码仓库中（`packages/xiangdi-agent/src/prompts/`），
作为 fallback 和版本基线。每次发版时通过 `systemVersion` 自增标记更新。

代码中的默认 prompt 结构：

```typescript
// packages/xiangdi-agent/src/prompts/agentPrompts.ts

export const DEFAULT_AGENT_PROMPTS: Record<AgentRole, { text: string; version: number }> = {
  master: {
    text: `你是 XiangDi，一个专业的 UI 设计生成 Agent...`,
    version: 1,
  },
  pm: {
    text: `你是产品经理角色。你的职责是将用户的模糊诉求翻译为结构化的功能需求列表...\n\n输出格式：FeatureList JSON...`,
    version: 1,
  },
  arch: {
    text: `你是架构师角色。你基于 BanvasGL 引擎的能力设计技术实现方案...\n\n约束：遵循 ADR 决策...\n\n输出格式：TechPlan JSON...`,
    version: 1,
  },
  visual: {
    text: `你是视觉设计师角色。你负责产出布局结构、设计规范和组件选型...\n\n关注：视觉层级、风格一致性、信息密度...\n\n输出格式：VisualSpec JSON...`,
    version: 1,
  },
  task: {
    text: `你是任务规划师角色。你将产品需求、技术方案和视觉规格翻译为可执行的原子操作序列...\n\n输出格式：ChangeSpec JSON...`,
    version: 1,
  },
};
```

### 前端设置页面

在应用设置中新增"AI 角色配置"面板：

```
┌─────────────────────────────────────────────────────────────┐
│ AI 角色配置                                                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  [ 主 Agent ] [ 产品经理 ] [ 架构师 ] [ 视觉设计 ] [ 任务规划 ] │
│  ─────────────────────────────────────────────────────────   │
│                                                              │
│  当前角色：视觉设计师                                         │
│  状态：✎ 已自定义（系统版本 v1）                              │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 你是视觉设计师角色。你负责产出布局结构...               │ │
│  │                                                        │ │
│  │ 本应用的特殊要求：                                      │ │
│  │ - 使用 Material Design 3 风格                          │ │
│  │ - 主色调 #1976D2，圆角 16px                            │ │
│  │ - 信息密度中等，适合平板设备                            │ │
│  │                                                        │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  [ 恢复默认 ]                              [ 保存 ]          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### API 设计

```typescript
// 获取某应用所有 Agent 的 prompt 配置
GET /applications/:appId/agent-prompts
// → AgentPrompt[]（若未自定义，返回系统默认值 + isCustomized=false）

// 更新某个 Agent 的 prompt
PUT /applications/:appId/agent-prompts/:agent
// body: { promptText: string }
// → 创建/更新 AgentPrompt 文档，标记 isCustomized=true

// 恢复默认
DELETE /applications/:appId/agent-prompts/:agent
// → 删除用户自定义（或标记 isCustomized=false），回退到系统默认
```

### 与 ProjectSpec 的关系

现有的 `ProjectSpec` 是"项目级全局约束"（AISchema + 工具定义 + ADR 约束），
属于 L1 SystemPrompt 中不可变的部分。

`AgentPrompt` 是"角色行为定义"（你是什么角色、关注什么、输出什么格式），
是 L1 SystemPrompt 中用户可定制的部分。

最终 L1 的组装逻辑：

```
L1 SystemPrompt = ProjectSpec（不可变，系统生成）
               + AgentPrompt（可定制，用户可覆写）
               + AISchema 文档（不可变，从 banvasgl 生成）
```

用户只能修改 AgentPrompt 部分，ProjectSpec 和 AISchema 由系统控制。

---

## TODO：实施计划

### XiangDi Agent 层

- [ ] 定义 `FeatureList`、`TechPlan`、`VisualSpec` 的 Zod Schema（`spec/planningTypes.ts`）
- [ ] 定义 `SubAgentState<TInput, TOutput>` 通用状态类型（`graph/planningAgents/state.ts`）
- [ ] 实现 `SubAgentFactory`（`graph/planningAgents/factory.ts`），支持纯 LLM / think↔tools 两种子图模式
- [ ] 实现 `PMAgent` 子图（`graph/planningAgents/PMAgent.ts`）：纯 LLM + Zod 验证 + 重试
- [ ] 实现 `ArchAgent` 子图（`graph/planningAgents/ArchAgent.ts`）：think↔tools 循环 + knowledge_search 等只读工具
- [ ] 实现 `VisualAgent` 子图（`graph/planningAgents/VisualAgent.ts`）：think↔tools 循环 + get_page_tree / get_design_tokens
- [ ] 实现 `TaskPlannerAgent` 子图（`graph/planningAgents/TaskPlannerAgent.ts`）：think↔tools 循环 + get_pages / validate_change_spec
- [ ] 实现 `PlanningOrchestrator`（`graph/planningAgents/PlanningOrchestrator.ts`）：调度 + 工具隔离 + 降级
- [ ] 实现工具隔离机制：Orchestrator 按角色创建独立 `ToolRegistry` 子集
- [ ] 新增只读工具：`get_adr_constraints`、`get_existing_schema`、`get_design_tokens`、`validate_change_spec`
- [ ] 重构 `MasterGraph`：将 `spec` 节点替换为 `planning` 节点
- [ ] 设计记忆命名空间分层（见 ADR-033）
- [ ] 编写系统默认 prompt（`prompts/agentPrompts.ts`），导出 `DEFAULT_AGENT_PROMPTS`
- [ ] 添加 `planning_progress` SSE 事件协议
- [ ] `ToolRegistry` 新增 `getDefinition(name)` 方法（支持按名称获取单个工具定义，用于子集创建）

### Banyan 后端持久化层

- [ ] 新增 `PlanningArtifact` Model（独立 collection，按 appId 索引）
- [ ] 新增 `AgentPrompt` Model（独立 collection，按 appId + agent 联合唯一索引）
- [ ] 新增 `AgentPromptService`：`getPrompt(appId, agent)` / `updatePrompt()` / `resetPrompt()`
- [ ] `IDialogue` 新增 `planningArtifactId` 外键字段
- [ ] `ConversationService` 新增 `createPlanningArtifact()` / `updateArtifact()` 方法
- [ ] `AiService` 加载 prompt 时优先查 AgentPrompt collection，fallback 到代码默认
- [ ] `AiService` 在 SSE 回调中处理 `planning_progress` 事件，逐步写入 Artifact
- [ ] 新增 API：`GET /applications/:appId/conversation/dialogues/:dialogueId/planning-artifact`
- [ ] 新增 API：`GET /applications/:appId/agent-prompts`
- [ ] 新增 API：`PUT /applications/:appId/agent-prompts/:agent`
- [ ] 新增 API：`DELETE /applications/:appId/agent-prompts/:agent`

### Banyan 前端展示层

- [ ] 新增 `PlanningCard` 组件（步骤进度 + Tab 详情）
- [ ] `useXiangDi` hook 新增 `planning_progress` 事件处理
- [ ] `ConversationPanel` 在 task 类型 Dialogue 中渲染 PlanningCard
- [ ] 历史加载时，按需获取 PlanningArtifact 数据
- [ ] 实现 FeatureListView / TechPlanView / VisualSpecView / ChangeSpecView 四个详情组件
- [ ] 应用设置页新增"AI 角色配置"面板（Tab 切换 5 个角色，编辑器 + 保存/恢复默认）
- [ ] 系统版本升级时，设置页提示"有新版本可用"并支持差异对比
