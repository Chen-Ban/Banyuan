# ADR-035：工程化优先原则 —— 精简 LLM 调用，最小化 Token 消耗

**状态**：已批准  
**决策日期**：2025-06-15  
**决策者**：陈班

---

## 背景

XiangDi 的多 Agent 管线（ADR-032）设计了 PM → Arch → Visual → Task 四个 SubAgent 串行执行规划。加上 MasterGraph 本身的 plan、audit、summarize、extractMemory、ResumeClassifier 等节点，一次复杂请求的 LLM 调用次数可达 8-10 次。每新增一个 SubAgent，token 消耗在原有基础上有明显增加（system prompt + 全量上下文传入 + 输出），一次复杂任务的规划阶段 token 消耗约 25,000-40,000 tokens。

---

## 核心原则

**多用工程化手段优化，不盲目增加 SubAgent。LLM 只花在真正需要"理解"和"创造"的环节，确定性逻辑交给代码。**

每个 LLM 调用必须满足以下至少一条才允许保留：

1. 输入是自由形式的自然语言，且输出需要语义理解或创造性推理
2. 分类/判断的维度无法穷举，或用户表达存在大量变体（错别字、隐喻、省略）
3. 输出质量对"审美"或"设计感"有要求（风格、一致性、用户意图匹配）

反之，以下场景应优先用工程手段：结构化输入→结构化输出的格式转换、硬性规则可穷举的校验（格式合法、数值范围、流程无错）、元数据推导（从已有 state 字段计算得出的值）。

---

## 决策

### 一、审计结论

| 调用点 | 评估 | 理由 |
|--------|------|------|
| planNode | **必要** | 自然语言→结构化方案，不可替代 |
| PMAgent | **必要** | 模糊诉求→FeatureList，需推断隐含需求 |
| ArchAgent | **必要** | 功能→抽象技术变更（TechPlan），需创造性映射 |
| VisualAgent | **必要，职责需聚焦** | 主题系统、风格检索、designTokens 决策，与 ArchAgent 正交 |
| TaskPlannerAgent | **必要** | 抽象方案→有序任务，需推理优先级和语义依赖 |
| auditNode | **必要，可工程化减负** | 硬性规则前置短路 + 风格校验每次必做 |
| summarizeNode | **必要，当前实现需增强** | 应总结整轮实际改动，当前输入太弱 |
| extractMemoryNode | **可优化** | Episode 元数据可代码推导，仅 lessons 需 LLM |
| ResumeClassifier | **必要** | 用户表达变体太多，关键词匹配大概率误判 |

---

### 二、auditNode 分层审计

将审计拆为两阶段：硬性规则前置 + 风格校验必做。

**阶段一：代码规则校验（零 token 成本）**

```typescript
function ruleBasedAudit(state: MasterState): RuleAuditResult {
  return {
    toolCallSuccess: state.toolResults.every(r => !r.is_error),
    layoutValid: state.viewSnapshots.every(v =>
      v.x >= 0 && v.y >= 0 && v.width > 0 && v.height > 0
    ),
    formatValid: state.viewSnapshots.every(v =>
      !v.backgroundColor || /^#[0-9a-fA-F]{6,8}$/.test(v.backgroundColor)
    ),
    allTasksDone: state.changeSpec.tasks.every(t => t.done),
  };
}
```

硬性规则失败 → 直接 fail 并返回明确错误，不调用 LLM。

**阶段二：风格与意图校验（LLM，每次必做）**

审计优先级三层：用户本轮明确的风格需求（最高）→ 记忆中的用户偏好事实（中）→ 系统默认设计规范（兜底）。

硬性规则通过后，LLM 只需关注软性维度（风格一致性、产物与意图匹配度、交互逻辑合理性），prompt 可精简掉硬性维度的描述。

---

### 三、summarizeNode 增强方案

#### 问题

当前 summarizeNode 的输入仅是 `planPhaseSummary`（代码拼接的"意图：xxx；任务数：3"）和 `executePhaseSummary`（"执行了 3 个任务；审计通过"），信息量极低。而 `roundSummary` 承担着双重角色：语义检索锚点（embedding 用于判断历史对话相关性）+ 压缩表示（L3 上下文内容）。输入质量低直接导致记忆层失效。

#### 方案：结构化提取 + LLM 归纳

**Phase 1：代码提取结构化改动信息（零 token）**

从 state 已有字段中提取，不增加 LLM 调用：

```typescript
function extractChangeSummaryInput(state: MasterState): string {
  const sections: string[] = [];

  // 1. 用户意图
  if (state.planOutput) {
    sections.push(`## 用户需求\n${state.planOutput.intentSummary}`);
  }

  // 2. 方案要点（截断 300 字）
  if (state.planOutput?.planDescription) {
    sections.push(`## 技术方案\n${state.planOutput.planDescription.slice(0, 300)}`);
  }

  // 3. 实际改动（从 messages 中提取工具调用，翻译为语义动作）
  const toolActions = extractToolActions(state.messages);
  if (toolActions.length > 0) {
    const actionList = toolActions
      .map(a => `- ${a.action}: ${a.target}${a.detail ? ` (${a.detail})` : ''}`)
      .join('\n');
    sections.push(`## 实际改动\n${actionList}`);
  }

  // 4. 审计结论
  if (state.auditResult) {
    const status = state.auditResult.passed ? '通过' : '未完全通过';
    const issues = state.auditResult.issues
      .filter(i => i.severity !== 'info')
      .map(i => `${i.severity}: ${i.message}`)
      .join('; ');
    sections.push(`## 审计结果\n${status}${issues ? '。问题: ' + issues : ''}`);
  }

  // 5. 过程信息
  const meta: string[] = [];
  if (state.planIterations > 1) meta.push(`规划调整 ${state.planIterations - 1} 次`);
  if (state.auditRetries > 0) meta.push(`审计重试 ${state.auditRetries} 次`);
  if (meta.length > 0) sections.push(`## 过程\n${meta.join('；')}`);

  return sections.join('\n\n');
}
```

工具调用翻译为语义动作，映射表与 BanvasToolProtocol 同步维护：

```typescript
function parseToolAction(toolName: string, result: any): ToolAction | null {
  const actionMap: Record<string, (r: any) => ToolAction> = {
    'create_view': r => ({ action: '创建', target: `${r.viewType} "${r.name || r.id}"`, detail: r.parentId ? `在 ${r.parentId} 下` : undefined }),
    'modify_view': r => ({ action: '修改', target: `"${r.viewId}"`, detail: summarizeChanges(r.changes) }),
    'delete_view': r => ({ action: '删除', target: `"${r.viewId}"` }),
    'create_scene': r => ({ action: '新建页面', target: `"${r.name}"` }),
    'set_flow_schema': r => ({ action: '绑定流程', target: `${r.viewId}.${r.event}` }),
  };
  const mapper = actionMap[toolName];
  return mapper ? mapper(result) : { action: toolName, target: JSON.stringify(result).slice(0, 80) };
}
```

**Phase 2：LLM 归纳为自然语言摘要**

```typescript
const SUMMARIZE_SYSTEM_PROMPT = `你是一个对话改动总结助手。根据给定的结构化改动信息，生成一段改动摘要。

要求：
1. 重点描述"做了什么改动"，而非过程细节
2. 包含：用户意图（一句话）、关键改动列表（创建/修改/删除了什么）、最终状态
3. 控制在 150-250 字
4. 摘要应作为语义检索的良好锚点——包含关键实体名称（页面名、组件类型、功能名）
5. 用第三人称描述
6. 如果有审计问题未解决，在末尾注明`;
```

#### 效果对比

当前输出：`"用户要求添加商品列表页。系统创建了相关组件，执行了3个任务，审计通过。"`

增强后输出：`"用户要求添加商品列表页（支持搜索和分页）。系统在首页新建了「商品列表」页面，创建了 FlexView 容器布局，包含搜索栏(InputView)、商品列表(ListView)、分页器(PaginationView)。搜索栏绑定了 onChange 筛选流程，分页器绑定了翻页流程。审计通过。"`

后者作为 embedding 锚点，用户说"上次那个商品列表页的搜索功能改一下"时命中率显著提升。

#### 实现约束

- 不改 state 类型，不改其他节点输出接口
- 输出仍为 `{ roundSummary: string }`，下游完全兼容
- `parseToolAction` 映射表随 BanvasToolProtocol 工具变更同步维护
- 工作量约 100-150 行代码

---

### 四、其他优化项

**extractMemoryNode 混合提取**：Episode 元数据（title, outcome, tags, importance）从 state 字段代码推导，仅 `lessons`（经验教训归纳）保留 LLM 调用，精简 prompt。

**VisualAgent 职责聚焦**：去掉与 ArchAgent 重叠的 componentChoices 中的 viewType 决策，聚焦 designTokens 决策、布局层次建议、风格参考检索。精简 system prompt。

**前缀缓存最大化（P2）**：调整各 Agent 的 prompt 结构，将稳定不变的部分（system prompt + ProjectSpec + 知识注入）集中在前缀。DeepSeek 缓存命中时实际计费仅为未命中时的 10%。

---

## 优化后管线

```
plan → [PMAgent → ArchAgent → VisualAgent(聚焦) → TaskPlannerAgent] → humanGate
     → execute(Agentic Loop) → audit(规则前置+LLM风格校验) → summarize(增强输入) → extractMemory(混合)
```

LLM 调用次数不变（8-10 次），但每次调用的 prompt 更精准：硬性规则已由代码处理，LLM 只关注需要语义理解的维度。预估 token 消耗从 ~25,000-40,000 降至 ~20,000-32,000（降低 15%-25%），叠加前缀缓存后实际计费可再降 50-70%。

---

## 新增 SubAgent 准入标准

未来如需新增 SubAgent，必须通过以下检验：

1. **不可替代性论证**：说明为何代码/规则/模板无法解决
2. **Token 预算**：预估新增的 token 消耗，并说明收益是否超过成本
3. **职责正交性**：证明与现有 Agent 无职责重叠
4. **降级方案**：提供 LLM 不可用时的 fallback 路径

---

## 后果

### 正面

- 硬性校验零幻觉风险，且失败时不浪费 LLM 调用
- summarizeNode 增强后记忆层语义检索质量显著提升
- 明确的准入标准防止管线膨胀
- 前缀缓存策略可独立推进，与架构改动解耦

### 负面

- summarizeNode 增强需要维护 `parseToolAction` 映射表（与 BanvasToolProtocol 同步）
- audit 三层优先级需要与记忆层联动读取用户偏好
- 整体优化幅度不如"砍节点"激进，但保证了每个环节的输出质量

### 缓解

- `parseToolAction` 映射表不全时自动 fallback 为 `toolName + JSON.stringify(result).slice(0,80)`
- audit 记忆联动通过 FlowContext 注入偏好摘要，不直接耦合记忆层实现
- 每项优化通过配置项控制（如 `auditMode: 'rule-first' | 'llm-only'`），可灰度验证

---

## 相关决策

- [ADR-032](./032-multi-agent-planning-pipeline.md) — 多 Agent 规划管线（本 ADR 是对其的精简优化）
- [ADR-026](./026-context-assembly-architecture.md) — 上下文分层组装（summarizeNode 产出供 L3 使用）
- [ADR-034](./034-interrupt-resume-strategy.md) — 中断续接（ResumeClassifier 保留理由）
