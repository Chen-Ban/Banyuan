# ADR-022: 记忆管理系统（Memory Management System）

## 状态

已采纳 (Accepted)

## 背景

XiangDi Agent 是无状态的：每次请求收到 banyan 后端传来的上下文，执行完毕即遗忘。
banyan 后端负责所有持久化——对话、应用状态、偏好。
核心问题是：**如何从线性增长的单一会话中，生成高质量的上下文？**

一个好的记忆管理系统 = **维度分治** + **渐进更新** + **动态检索注入**。

业界参考：Cursor（显式 Rules）、Windsurf（自动 Memories + Rules）、Devin（Knowledge Suggestions）、
Claude Code（六层 CLAUDE.md）、Amazon Bedrock AgentCore（UserPreferenceMemoryStrategy）。

## 决策

### 记忆系统总体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                    XiangDi Memory Management System                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─── 维度分治（What to remember）───────────────────────────────┐   │
│  │                                                                 │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │   │
│  │  │ Preferences │  │   Anchor    │  │   Raw Messages      │   │   │
│  │  │  (偏好层)    │  │  (摘要层)   │  │   (对话层)           │   │   │
│  │  │             │  │             │  │                     │   │   │
│  │  │ 稳定/低频更新│  │ 渐进/增量更新│  │ 实时/只追加         │   │   │
│  │  │ 影响所有轮次 │  │ 覆盖已丢弃轮│  │ 最近 N 轮原始保留    │   │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌─── 渐进更新（When to update）────────────────────────────────┐   │
│  │                                                                 │   │
│  │  Preferences: 信号驱动（Agent 检测到偏好信号时提取）            │   │
│  │  Anchor:      阈值驱动（token 超 70% 预算时压缩）              │   │
│  │  Messages:    实时追加（每轮 user + assistant 写入）            │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌─── 动态检索注入（How to inject）──────────────────────────────┐   │
│  │                                                                 │   │
│  │  上下文 = 5 层分层组装，每层有独立的 token 预算和注入位置：      │   │
│  │                                                                 │   │
│  │  L1  System Prompt      不变层    XiangDi 构建，含 AISchema    │   │
│  │  L2  Preferences        稳定层    注入 system prompt 尾部      │   │
│  │  L3  Anchor Summary     压缩层    注入 system prompt 尾部      │   │
│  │  L4  Recent Messages    对话层    注入 LangGraph messages      │   │
│  │  L5  Current Prompt     即时层    最后一条 HumanMessage        │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### 三个记忆维度的详细设计

#### 维度 1: Preferences（偏好层）

**本质**：用户"是什么样的人"，项目"是什么样的项目"——跨轮次稳定的约束信息。

**数据结构**：
```typescript
interface ProjectPreferences {
  // 设计风格
  designStyle: {
    colorScheme?: string    // "蓝色主题"、"暗色系"
    layout?: string         // "Flex 为主"、"紧凑排列"
    borderRadius?: string   // "圆角 8px"
    typography?: string     // "14px 正文，20px 标题"
  }
  // 内容风格
  contentStyle: {
    language?: string       // "中文标签"、"英文变量名"
    naming?: string         // "驼峰命名"
    tone?: string           // "正式用语"
  }
  // 硬约束（用户明确表态"不要"、"总是"的规则）
  constraints: string[]     // ["不要用 Tab 组件", "列表必须有分页"]
  // 元信息
  version: number
  updatedAt: Date
}
```

**存储位置**：Application 模型上新增 `preferences` 字段（1 App = 1 Preferences）。

**更新机制**：信号驱动提取。
- Agent 图新增 `extractPreferences` 节点（think↔tools 循环结束后执行）
- 用轻量 LLM 调用分析本轮对话是否包含偏好信号
- 偏好信号示例："以后都用蓝色"、"我不喜欢这种布局"、"按钮要更圆一些"
- 若检测到信号，输出 preferencesDelta，通过 SSE `preferences_update` 事件推送给 banyan 后端
- banyan 后端合并写入 Application.preferences
- 不需要用户确认（Windsurf 静默模式），用户可事后在设置中查看/修改

**注入位置**：L2 层，拼接在 system prompt 的 AISchema 之后、Anchor 之前。
- 格式化为精简的约束指令（"You MUST follow these user preferences: ..."）
- Token 预算：≤ 500 token（偏好应极其精练）

**偏好漂移处理**：
- 新偏好覆盖同类旧偏好（如新 colorScheme 替代旧 colorScheme）
- constraints 数组去重 + 矛盾检测（"用 Tab" vs "不要 Tab" → 保留最新）
- version 自增，可追溯变更历史

#### 维度 2: Anchor（摘要层）

**本质**：被丢弃消息的"精华记忆"——渐进压缩的中期上下文。

**数据结构**：
```typescript
interface IAnchor {
  intent: string           // 用户核心意图
  completedActions: string[]  // AI 已做的事
  decisions: string[]      // 用户确认的决策
  pendingTasks: string[]   // 待完成任务
  compactedBeforeIndex: number  // 压缩水位线
  updatedAt: Date
}
```

**存储位置**：Conversation 模型的 `anchor` 字段。

**更新机制**：阈值驱动。
- ContextBuilder 每次构建上下文时估算 token
- 未压缩消息 > TOKEN_BUDGET × 70% → 驱逐最旧消息 → 增量合并进 anchor
- 增量合并：只处理新驱逐的消息段 + existing anchor → LLM 输出新 anchor
- 至少保留最近 5 轮（10 条消息）不被压缩

**注入位置**：L3 层，拼接在 Preferences 之后。
- 格式化为结构化 Markdown（"## 项目记忆"）
- Token 预算：≤ 2000 token

#### 维度 3: Raw Messages（对话层）

**本质**：最近几轮的完整原始对话——零信息损失的近期记忆。

**数据结构**：`IMessage[]`（role + content + createdAt）

**存储位置**：Conversation 模型的 `messages` 数组（只追加，永不删除）。

**更新机制**：实时追加。
- 每次请求：追加 user 消息
- 每次完成：追加 assistant 消息
- 无条件只增长

**注入位置**：L4 层，转为 LangChain BaseMessages 注入 Agent 图。
- 从 `compactedBeforeIndex` 开始，取到倒数第二条（最后一条是当前 prompt）
- 经过 ContextBuilder token 裁剪后的子集

### 三个维度的协同关系

```
时间线 →  [非常早期]     [早期]       [近期]        [当前]
          ─────────────────────────────────────────────────
信息保留:  ×（已丢弃）    Anchor       Messages      Prompt
偏好来源:  ←─── Preferences 从全部历史中提取，持久稳定 ───→
Token占用:  0             ~2000        ~21000        ~1000
信息密度:  ∞（丢失）      高（压缩）    原始（1:1）    原始
```

**关键洞察**：三个维度不是互相替代，而是互补的正交轴：
- Preferences 回答"**怎么做**"（风格约束）—— 跨时间稳定
- Anchor 回答"**做过什么**"（历史事实）—— 随时间更新
- Messages 回答"**正在做什么**"（近期语境）—— 实时准确

### extractPreferences 节点设计

**在 Agent 图中的位置**：

```
START → think ↔ tools (循环) → extractPreferences → END
```

**实现要点**：
- 独立节点，不影响主循环的工具调用和文本生成
- 使用同一个 LLM client 但独立的轻量 prompt（≤ 200 input token）
- 通过 streamCallback 推送 `preferences_update` 事件
- 即使提取失败也不影响整体流程（catch + 静默）

**偏好信号检测 Prompt**：
```
分析以下对话的最后一轮交互，判断用户是否表达了设计偏好或行为约束。
偏好信号包括：
- 颜色/样式/布局偏好（"用蓝色"、"要圆角"）
- 内容/命名偏好（"用中文"、"简洁一些"）
- 否定约束（"不要用这种"、"别加那个"）
- 重复修正（连续要求同类更改暗示偏好）

如果检测到偏好信号，输出 JSON delta；如果没有，输出 null。
```

### 数据流全景

```
用户发 prompt
    ↓
banyan 后端 AiService:
    ├─ appendUserMessage
    ├─ ContextBuilder.build() → { anchor格式化, 裁剪后messages }
    ├─ 读取 Application.preferences
    └─ 组装请求体 { prompt, pages, previousMessages, memoryHint, preferences }
    ↓
XiangDi 服务 /ai/run:
    ├─ systemPrompt = buildSystemPrompt() + preferences + memoryHint
    ├─ messages = previousMessages → LangChain BaseMessages + current prompt
    └─ Agent 图执行:
        ├─ think ↔ tools (核心循环)
        ├─ extractPreferences (后处理)
        │    └─ SSE: preferences_update { delta }
        └─ SSE: done { pages }
    ↓
banyan 后端 SSE 回调:
    ├─ preferences_update → 合并写入 Application.preferences
    ├─ done → 写回 pages + 追加 assistant 消息
    └─ 若需要压缩 → AnchorService.compact() (异步)
```

## 后果

**正面**：
- 记忆系统有了明确的三维度模型，每个维度职责清晰
- 偏好提取让 Agent 越用越"懂"用户，生成质量持续提升
- 三个维度独立演进，互不干扰
- 对 XiangDi 服务端侵入小（只改 Agent 图 + 透传一个新 SSE 事件）

**负面**：
- extractPreferences 节点增加每次请求的 LLM 调用次数（+1 轻量调用）
- 偏好的静默提取可能偶尔不准确（但不影响功能，只影响风格）
- 三维度的 token 预算需要实际运行后调参

**缓解**：
- extractPreferences 可配置为"每 N 轮触发一次"而非每轮都触发
- 前端可提供偏好查看/编辑界面，用户手动修正不准确的提取
- Token 预算作为环境变量，可运行时调整

---

## 修订记录：L2 偏好层合并至 AgentMemory

### 背景

原设计中 L2(Preferences) 和 L3(AgentMemory) 存在语义重叠：
- L2 存储结构化偏好（Application.preferences），通过 `extractPreferencesNode` 独立提取
- L3 的 Fact 体系已有 `user_preference` 类别，且具备更强的检索能力（embedding 语义检索、置信度衰减、去重合并）

### 决策

**将 L2 Preferences 合并入 L3 AgentMemory**，上下文模型从 6 层简化为 5 层：

| 层级 | 名称 | 内容 |
|------|------|------|
| L1 | SystemPrompt | AISchema + 工具定义 + 通用规则 |
| L2 | AgentMemory | Episode 经验 + Fact 事实（含 user_preference 类别） |
| L3 | Anchor | 历史记忆锚点（压缩摘要） |
| L4 | RecentMessages | 最近 N 轮对话 |
| L5 | CurrentPrompt | 当前用户输入 |

### 主要变更

- 删除 `extractPreferencesNode`，偏好提取职责合并至 `extractMemoryNode`
- 管线简化：`...→ summarize → extractMemory → END`
- SSE 事件：删除 `preferences_update`，统一使用 `memory_update`
- 存储：偏好以 `user_preference` 类别的 Fact 存入 AgentMemory（MongoDB）
- 检索：`MemoryService.recall()` 对偏好 Fact 单独分组、置顶呈现
- 迁移：惰性迁移机制自动将 `Application.preferences` 存量数据转换为 Fact

### 收益

- 避免同一偏好在两处存储导致不一致
- 偏好获得 embedding 语义检索能力（原 L2 仅关键词匹配）
- 管线末端从双 LLM 调用减为单 LLM 调用，降低延迟和成本
- 代码简化约 270 行

### 状态

已实施。`Application.preferences` 字段已清理完毕。

---

## 修订 2: 移除 Anchor 机制，L3 改为动态生成

### 背景

Round-based 语义检索（ContextBuilder V2）上线后，Anchor 的预计算摘要与 ContextBuilder 的按需选择能力产生架构冗余：

- ContextBuilder 已具备 round 粒度的语义检索 + 时间衰减混合排序能力
- "未选中 round" 的信息可以通过实时拼接其 `roundSummary` 获得，无需预先 LLM 调用生成结构化 anchor
- Anchor 的 `compactedBeforeIndex` 水位线机制增加了状态管理复杂度

### 决策

移除 Anchor 机制，L3 改为由 ContextBuilder 动态生成：

| 层级 | 字段名 | 来源 |
|------|--------|------|
| L3 | contextSummary | 未选中 round 的 `roundSummary` 实时拼接 |
| L4 | recentMessages | 语义检索命中 + 最近 N 轮的原始消息展开 |

### 主要变更

- 删除 `IAnchor` 接口和 `AnchorSchema`（Conversation model）
- 删除 `AnchorService` 整个文件
- 删除 xiangdi-server 的 `/ai/summarize` 端点
- `MasterState.anchor` 重命名为 `MasterState.contextSummary`
- ContextBuilder 输出简化：仅保留 `contextSummary` + `recentMessages`
- ContextBuilder.buildContextSummary()：将未选中 round 的 roundSummary 拼接为 L3 文本

### 收益

- 消除 Anchor 的异步 LLM 压缩调用（每次对话省 ~1s + token 开销）
- 消除 `compactedBeforeIndex` 状态管理（无需追踪"压缩到哪里了"）
- L3 内容始终基于最新的 round 选择结果，不存在过时问题
- 代码简化约 350 行

### 代价

- 每次请求需遍历所有 round 的 roundSummary 拼接（开销极小，纯字符串操作）
- 未选中 round 数量较多时，L3 文本可能较长（未来可考虑 token 预算裁剪）

### 状态

已实施。
