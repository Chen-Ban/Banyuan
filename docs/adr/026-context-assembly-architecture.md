# ADR-026：上下文组装架构 — 无状态 Agent + Pull-based 动态组装 + 语义检索即 Few-shot

**状态**：已采纳  
**决策日期**：2026-07-17  
**决策者**：陈班

---

## 背景

Banyuan 的 AI Agent（XiangDi）负责根据用户自然语言指令生成/修改符合 AISchema 的 pages JSON——本质上是一个**规则驱动的结构化视觉界面生成器**。其核心架构是：

- banyan 后端（:3001）持有所有持久化状态（MongoDB: pages、conversations、agentMemory）
- XiangDi 服务（:3002）是无状态执行引擎，不访问 MongoDB
- 每次请求时，banyan 后端通过 ContextBuilder 动态组装上下文，传给 XiangDi

一个关键的架构质疑是：**每次请求都重新构建完整上下文，是否合理？是否应该让 XiangDi 缓存会话状态？**

此外，ContextBuilder V2 采用了基于用户当前输入的**语义检索**来动态选择注入哪些历史对话，这导致 L3/L4 层内容每次请求都可能不同，无法利用 LLM 服务商的 Prompt Cache（前缀缓存）机制。这个设计取舍是否正确？

---

## 决策

### 决策一：坚持"持久化基底 + 无状态 Agent + 每次动态组装"架构

每次请求时由 banyan 后端从 MongoDB 获取最新状态，通过 ContextBuilder 组装五层上下文，传给无状态的 XiangDi 服务。XiangDi 不缓存任何跨请求状态。

### 决策二：语义检索作为"带 CoT 的 Few-shot"机制，优先级高于 Prompt Cache 友好性

ContextBuilder 的语义检索不是为了"回忆过去的步骤"，而是为模型提供**带推理过程的历史生成样本**，确保全局视觉风格一致。这个设计目标的优先级高于 Prompt Cache 的前缀稳定性。

---

## 论据

### 论据一：业界共识 — Persistent Substrate vs Ephemeral Context

Anthropic 2026 年 Agent Harness 架构明确提出：

> "Session is not Claude's context window. Every time the harness calls the model, it pulls from the session and **assembles a context for that turn**."

核心模式是：
```
Raw events kept long-term (持久化基底)
    ↓
Context Builder picks dynamically (每次动态选择)
    ↓
This model call sees a high-signal context (高信噪比上下文)
```

- 来源：Anthropic, "Agent Harness Architecture" (2026)
- 来源：Zylos.ai, "Dynamic Context Assembly and Projection Patterns for LLM Agent Runtimes" (2026-03)

### 论据二：Context Engineering 四策略框架

Lance Martin / LangChain (2025-06) 提出 Context Engineering 的四大策略：Write / Select / Compress / Isolate。

Banyuan 的映射：

| 策略 | Banyuan 实现 |
|------|------|
| **Write** | 每轮对话的 messages + roundSummary + embedding 持久化到 MongoDB |
| **Select** | ContextBuilder 通过语义检索 + 时间衰减混合排序选取相关 dialogue |
| **Compress** | 未选中 dialogue 的 roundSummary 拼接为 L3 contextSummary |
| **Isolate** | XiangDi 无状态，每次请求在独立上下文中执行 |

- 来源：Lance Martin, "Context Engineering for Agents", LangChain Blog (2025-06)

### 论据三：语义检索的真正价值 — 隐式设计规范的视觉记忆

XiangDi 生成的 pages JSON 描述的是**视觉界面**（位置、尺寸、颜色、间距、圆角等）。AISchema 规则只定义"什么是合法的"，但不定义"什么是风格一致的"。

一个应用的多个页面通常分多次对话创建。如果模型每次都从零决策样式，会出现跨页面风格不一致的问题。语义检索历史对话的核心价值：

1. **全局风格统一**：让模型看到"这个应用之前的页面长什么样"，从而继承隐含的设计规范
2. **带 CoT 的 Few-shot**：历史 dialogue 不只有最终 JSON 结果，还包含模型当时的推理过程（为什么选这个间距、为什么用这个布局），相当于一个完整的"输入→推理→输出"示范
3. **可印证的原始证据**：与 agentMemory（高度压缩的偏好摘要）相比，历史 dialogue 是 ground truth——模型可以从中看到具体数值、具体上下文、具体决策过程

两者的互补关系：

```
agentMemory (L2):  Declarative — "是什么"（圆角 12px，主色 #1677ff）
                   → 快速兜底索引，但可能失真、丢失上下文
语义检索 (L3/L4): Procedural  — "怎么做到的"（带 CoT 的完整样本）
                   → 真实可信，模型可自行提取模式
```

agentMemory 是索引，语义检索的历史 dialogue 是原文。当 agentMemory 说"圆角 12px"而模型需要确认时，可以从检索到的历史 dialogue 中看到当时确实输出了 `borderRadius: 12`。

### 论据四：Prompt Cache 对本架构的影响分析

DeepSeek 的 Context Caching on Disk（2024-08 上线）通过持久化 Prefill 阶段的 KV Cache 实现前缀缓存，缓存命中 token 成本降低 90%。

**然而**，Prompt Cache 要求请求之间的**前缀完全相同**。在本架构中：

| 层 | 稳定性 | 能否命中 Prompt Cache |
|------|------|------|
| L1 SystemPrompt | 稳定（ProjectSpec + AISchema 定义） | ✅ 可命中 |
| L2 AgentMemory | 不稳定（每轮 extractMemory 可能更新） | ❌ 一旦变化，后续全部失效 |
| L3 contextSummary | 不稳定（基于当前 prompt 语义检索动态生成） | ❌ |
| L4 recentMessages | 不稳定（基于当前 prompt 语义检索动态选取） | ❌ |
| L5 CurrentPrompt | 每次不同 | ❌ |

结论：**仅 L1（~2500 token）能稳定命中 Prompt Cache**，优化空间极为有限。

**但这不是问题**，因为：

- DeepSeek Flash 的 cache miss 价格仅 $0.14/M token，实际每请求 input 成本在几分钱人民币量级
- 语义检索让总 input token 数大幅降低（只注入 5-8 个相关 dialogue 而非全部历史），本身已是成本优化
- 生成质量的一致性 >> 缓存命中省下的微小成本
- 真正的成本大头在 output token 和 LLM 调用次数，不在 input

### 论据五：Anthropic "Building Effective Agents" 的正确解读

Anthropic (2024-12) 推荐的"Agent 简单性"原则被广泛误解为"Agent 不需要状态管理"。正确解读是：

- **Agent 执行引擎（harness）无状态**：不持有跨请求的业务数据 → XiangDi 的设计
- **状态管理职责外置**：由编排层持有并在每次调用时注入 → banyan 后端的设计
- **"简单"指的是 Agent 循环本身**：LLM 在循环里基于环境反馈使用工具，不是说"不需要上下文管理"

> "Agents 通常就是 LLM 在循环里基于环境反馈使用工具。"

这个循环内部是无状态的——每一步的"环境"由外部注入。

---

## 考虑过的方案

### 方案 A：XiangDi 缓存会话状态（被否决）

让 XiangDi 服务持有内存中的会话缓存，banyan 后端只传增量信息。

缺点：
- 违反 ADR-008 无状态原则，服务重启丢失状态
- 缓存一致性问题（banyan 后端可能独立修改 pages/memory）
- 水平扩展时需要 sticky session 或分布式缓存
- 与 Anthropic Agent Harness 架构的"brain/hands 解耦"原则冲突

### 方案 B：固定时间窗口（最近 N 轮）替代语义检索（被否决）

直接取最近 N 轮对话作为上下文，不做语义检索。

优点：天然前缀追加式，Prompt Cache 友好。

缺点：
- 无法保证风格一致性——3 周前创建首页时的样式信息不在最近 N 轮中
- "lost in the middle" 效应——无关对话淹没关键信息
- token 浪费——大量无关历史占用预算

### 方案 C：只用 agentMemory 存储风格规范，不做语义检索（被否决）

将所有设计风格信息提炼到 agentMemory（偏好摘要），取消 L3/L4 的语义检索。

缺点：
- agentMemory 是 declarative 的压缩摘要，丢失推理过程
- `extractMemory` 可能提取不准确、遗漏细节（如具体数值）
- 单点失败——一旦摘要错误，所有后续生成受影响，无原始样本可交叉验证
- LLM 对"带推理链的完整示范"的遵循度远高于"干巴巴的规则表"

### 方案 D：语义检索降级为可选工具（被否决用于默认行为）

将历史检索作为 Agent 可调用的工具（"搜索历史对话"），而非默认注入。

缺点：
- 模型不一定知道什么时候该调用这个工具
- 风格一致性需要**每次都参考**，不是偶尔需要
- 增加一次工具调用延迟

适用场景：作为补充手段（用户明确说"像上次那个一样做"），但不应替代默认的语义检索注入。

---

## 最终架构（确认）

```
五层上下文组装模型：

L1  SystemPrompt         稳定层    ProjectSpec + AISchema + 工具定义
L2  AgentMemory          偏好层    Episode 经验 + Fact 事实（含 user_preference）
L3  contextSummary       动态层    未选中 dialogue 的 roundSummary 拼接
L4  recentMessages       动态层    语义检索 top-k + 最近 M 个 dialogue 原始消息
L5  CurrentPrompt        即时层    用户当前输入

设计原则：
- L3/L4 由 L5 驱动动态生成（语义检索 + 时间衰减混合排序）
- 牺牲 Prompt Cache 前缀稳定性，换取"高信噪比 + 全局风格一致"
- L2 是压缩索引，L4 是可印证的原始证据，两者互补不可替代
```

数据流：
```
banyan 后端（有状态控制面）        XiangDi 服务（无状态执行引擎）
┌──────────────────────────┐      ┌─────────────────────────────┐
│ MongoDB: pages, dialogues│      │ 不访问 MongoDB               │
│ ContextBuilder:          │      │ 接收组装好的上下文            │
│   1. 获取 query embedding│      │ 执行 Agent 循环（think↔tools）│
│   2. 语义 + 时间混合排序  │─────▶│ 通过 BanyanClient 按需拉取   │
│   3. top-k + 最近 M 选取  │      │ 输出 pages JSON + SSE 事件   │
│   4. 组装五层上下文       │      └─────────────────────────────┘
│   5. Token 预算控制       │
└──────────────────────────┘
```

---

## Prompt Cache 利用建议（低优先级，未来可选优化）

虽然当前架构的 Prompt Cache 收益有限，但仍有一些不改变架构的优化点：

1. **L1 用英文编写**：system prompt 和工具定义用英文可节省 30-50% token（中文编码效率低），且作为唯一稳定前缀，英文缓存体积更小
2. **不要在 system prompt 中放动态内容**：时间戳、session ID 等应放在 L5（user message）中
3. **监控缓存命中率**：记录 DeepSeek 返回的 `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens`，作为架构演化的数据依据
4. **MasterGraph 内多轮 LLM 调用受益**：Agent 图内 think→tools→think 循环中，同一请求内的多次 LLM 调用共享相同 system prompt，自动命中缓存

---

## 影响

### 正面影响

- 架构决策有了明确的业界理论支撑（Anthropic Agent Harness / LangChain Context Engineering）
- "语义检索 = 带 CoT 的 Few-shot"的定位清晰化，后续优化有方向
- 确认了 Prompt Cache 在本场景下的局限性，避免为追求缓存命中率而扭曲架构
- XiangDi 无状态设计获得了多方理论验证

### 权衡

- 放弃了 Prompt Cache 可能带来的成本节省（在当前 DeepSeek 定价下影响极小）
- 语义检索增加了每次请求的 embedding 计算延迟（~100ms，通过降级策略兜底）

---

## 参考

- Anthropic, "Building Effective Agents" (2024-12) — 5 种 workflow + 1 种 agent 设计模式
- Anthropic, "Effective Context Engineering for AI Agents" (2025-09) — 上下文工程方法论
- Anthropic, "Agent Harness Architecture / Managed Agents" (2026) — Session + Harness + Sandbox 分层
- Lance Martin / LangChain, "Context Engineering for Agents" (2025-06) — Write/Select/Compress/Isolate 四策略
- DeepSeek, "Context Caching on Disk" (2024-08) — 基于 MLA 的磁盘 KV Cache 缓存机制
- Zylos.ai, "Dynamic Context Assembly and Projection Patterns for LLM Agent Runtimes" (2026-03)
- HydraDB, "Stateful Agents and Why Context Management Matters" (2025-11)
- [ADR-008：XiangDi 独立服务化](./008-xiangdi-as-independent-service.md)
- [ADR-022：记忆管理系统](./022-memory-management-system.md)
