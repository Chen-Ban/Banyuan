# knowledge-server —— BanvasGL 知识服务

Knowledge Server 是一个独立的知识检索微服务，为 XiangDi AI Agent 提供 BanvasGL 组件能力的知识检索。当 AI 需要知道"某个组件有哪些属性"或"怎么实现某种布局"时，就是向这个服务查询。

---

## 它做什么

Knowledge Server 存储和检索的是 **BanvasGL 的能力体系知识**——组件有哪些属性、怎么组合使用、视觉主题如何配置等。这些知识按引擎版本隔离，引擎升级时知识库可以平滑迁移。

检索流程是三阶段管线：

1. **粗排**：向量检索（语义相似度）+ BM25 全文检索（关键词匹配），RRF 融合
2. **精排**：Cross-Encoder 模型对粗排结果重新打分
3. **返回 TopK**：取精排后的前 K 条结果

所有推理都在本地完成（ONNX Runtime），不依赖外部 Embedding API，低延迟低成本。

---

## 知识来源

知识数据由种子脚本（`scripts/seed-knowledge.ts`）写入，覆盖 UI / Flow / Data 三个领域，分三层递进（详见 ADR-040）：

- **Primitive 种子（原子能力认知）**：每种 ViewType 的属性/graphType/layoutMode（UI），每种 FlowNode kind 的参数与执行环境约束（Flow），每种字段类型的能力边界（Data）
- **Composition 种子（组合模式）**：常见 UI 组合（登录表单、数据表格）、跨领域绑定模式 [bindflow]（"列表页 onLoad → 调用云函数 → setData"）、全栈拆解 [fullstack]（完整用户故事的三领域协同方案）
- **Convention 种子（惯例约定）**：视觉惯例（间距/字号/颜色规范）、流程惯例（事件优先级/防抖策略）、数据惯例（命名规范/索引策略）

---

## 主要接口

| 接口                        | 用途               |
| --------------------------- | ------------------ |
| `POST /knowledge/search`    | 检索相关知识片段   |
| `POST /knowledge/upsert`    | 写入/更新知识条目  |
| `POST /knowledge/embed`     | 获取文本的向量表示 |
| `DELETE /knowledge/entries` | 删除知识条目       |
| `GET /knowledge/stats`      | 查看知识库统计信息 |
| `GET /health`               | 健康检查           |

写操作需要 `X-Internal-Token` 认证，读操作开放。

---

## 快速开始

```bash
# 开发模式
pnpm dev

# 生产构建
pnpm build && pnpm start
```

默认监听 `:3003`。通常不需要单独启动——`pnpm dev:banyan` 会一并启动。

首次启动时模型会自动从 HuggingFace Hub 下载并缓存到本地。

---

## 环境变量

| 变量                       | 默认值   | 说明                         |
| -------------------------- | -------- | ---------------------------- |
| `PORT`                     | 3003     | 服务端口                     |
| `KNOWLEDGE_INTERNAL_TOKEN` | —        | 写操作认证 token（生产必填） |
| `BANVASGL_VERSION`         | 自动读取 | 知识表版本隔离标识           |

---

## 技术选型

- **LanceDB**：嵌入式向量数据库，数据持久化到本地磁盘，无需外部数据库服务
- **multilingual-e5-small**：Embedding 模型（384 维），支持中英文混合语义
- **ms-marco-MiniLM-L-6-v2**：Cross-Encoder 精排模型

---

## 设计理念与业界参考

Knowledge Server 的核心假设是：LLM 在私有 DSL 上的生成质量，**瓶颈不在模型智能，而在领域知识注入的深度和结构**。这一判断有三个业界实践支撑：

**Knowledge Protocol Engineering (KPE, 2025)**——提出 LLM 做复杂领域任务需要的不仅是事实性知识（what），还有方法论知识（how to think and act）：决策树、工作流程、逻辑依赖关系。我们的三层架构（Primitive → Composition → Convention）本质上是 KPE 的一种实现：Primitive 提供事实性知识，Composition 提供方法论知识，Convention 提供隐性约束知识。

**Microsoft DSL-Copilot 研究 (2024)**——发现 AI 在 DSL 上的初始准确率低于 20%，但通过三种干预可达 85%：显式领域上下文（对应 Primitive Seeds）+ 高质量示例（对应 Composition Seeds）+ 验证器在回路中（对应 `fromAIProjection()` / FlowSchema 验证 / Zod 校验）。知识存储为 "prompt + additionalDetails + correct response" 三元组，与我们 "语义维度 + 格式维度 + 示例" 的结构同构。

**v0 (Vercel) 模式**——成功的关键不是 LLM 聪明，而是约束输出空间 + 深度注入组件库知识。BanvasGL 的 AIProjection 和 FlowSchema 是我们的 DSL，需要同等深度的知识注入才能保证生成质量。

---

## 在 Monorepo 中的位置

```
XiangDi Server(:3002) ──HTTP──▶ Knowledge Server(:3003)
```

Knowledge Server 不访问 MongoDB，不引用 `@banyuan/xiangdi-agent` 的业务逻辑，是完全独立的知识服务。

---

## 许可证

[AGPL-3.0](../../LICENSE) / 商业授权
