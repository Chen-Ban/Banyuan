# @banyuan/xiangdi-agent

> 相地 —— 造园之始，先察山川形势。

XiangDi 是 Banyuan 的 AI Agent 引擎，负责将用户的自然语言意图转化为精确的画布操作。它不是一个通用聊天框架——它专门解决"如何让 LLM 生成有严格数据结构约束的可视化应用"这个问题。

---

## 它做什么

当用户对 Banyuan 说"帮我做一个登录页面"时，XiangDi 负责：

1. **理解意图**：判断用户要创建新页面、修改现有页面、还是只是闲聊
2. **结构化需求**：将模糊的自然语言转化为精确的功能需求和 UI 规格
3. **生成前后端产物**：分别生成 UI 结构（AI Projection 格式）和后端逻辑（云函数/数据模型）
4. **验证正确性**：审计生成结果是否满足约束，不满足则回退重来
5. **提交结果**：将验证通过的产物写入画布

整个过程对用户来说就是"说一句话，页面就出来了"。

---

## 核心架构：OrchestratorGraph

XiangDi 采用多 Agent 协作架构，一次 AI 对话被拆解为多个阶段，每个阶段由专职 SubAgent 处理：

```
用户消息 → Intent（意图识别）
         → Requirements（需求结构化）
         → UIDesign（UI 规格设计）
         → Contract（前后端接口契约）
         → Frontend（前端产物生成）
         → Backend（后端产物生成）
         → Audit（结构验证）
         → Commit（提交结果）
         → Summarize（总结回复）
```

每个 SubAgent 的输出都经过 Zod Schema 验证，确保结构正确后才进入下一阶段。如果 Audit 发现问题，会触发 Rollback 回到出问题的阶段重新执行。

这种设计的好处是：每个阶段的 LLM 调用有明确的输入/输出约束，生成质量远高于"一次性让 LLM 做所有事情"。

---

## 与画布的连接：AI Projection

LLM 不直接操作 BanvasGL 的内部数据结构。中间有一层**AI Projection**——一种对 LLM 友好的精简格式：

- `appJSONToProjection()`：将完整的画布数据转为 LLM 可读的精简结构
- `fromAIProjection()`：将 LLM 输出反序列化为画布对象
- `patchProjection()`：增量更新，只修改变化的部分

这层转换屏蔽了引擎内部的复杂性（addon、缓存、渲染状态），让 LLM 只关注语义层面的结构。

---

## LLM 支持

内置 DeepSeek 和 Kimi 两个 LLM 客户端，通过 LLMRouter 做健康检测和自动切换。对外暴露统一的 `LLMClient` 接口，接入方也可以实现自己的客户端。

---

## 知识检索

XiangDi 通过 Tool 模式按需检索 BanvasGL 的组件能力知识（"这个组件有哪些属性"、"怎么实现某种布局"），而不是把所有知识塞进 system prompt。知识检索由独立的 Knowledge Server 提供服务。

---

## 在 Monorepo 中的位置

```
apps/xiangdi-server  ──调用──▶  @banyuan/xiangdi-agent  ──类型依赖──▶  @banyuan/banvasgl
（HTTP 服务壳）               （AI 逻辑引擎）                      （图形引擎类型）
```

XiangDi Agent 是纯逻辑库，不含 HTTP 服务器。HTTP 层由 `apps/xiangdi-server` 提供。

---

## 许可证

[AGPL-3.0](../../LICENSE) / 商业授权
