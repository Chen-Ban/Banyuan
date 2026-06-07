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

知识数据由种子脚本写入，分三个层次：

- **Schema 种子**：每种组件的能力认知（有哪些属性、类型、默认值）
- **Composition 种子**：组件的常见组合模式（登录表单、数据表格、导航栏等）
- **Theme 种子**：视觉主题配置（颜色、间距、字号的推荐值）

---

## 主要接口

| 接口 | 用途 |
|------|------|
| `POST /knowledge/search` | 检索相关知识片段 |
| `POST /knowledge/upsert` | 写入/更新知识条目 |
| `POST /knowledge/embed` | 获取文本的向量表示 |
| `DELETE /knowledge/entries` | 删除知识条目 |
| `GET /knowledge/stats` | 查看知识库统计信息 |
| `GET /health` | 健康检查 |

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

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 3003 | 服务端口 |
| `KNOWLEDGE_INTERNAL_TOKEN` | — | 写操作认证 token（生产必填） |
| `BANVASGL_VERSION` | 自动读取 | 知识表版本隔离标识 |

---

## 技术选型

- **LanceDB**：嵌入式向量数据库，数据持久化到本地磁盘，无需外部数据库服务
- **multilingual-e5-small**：Embedding 模型（384 维），支持中英文混合语义
- **ms-marco-MiniLM-L-6-v2**：Cross-Encoder 精排模型

---

## 在 Monorepo 中的位置

```
XiangDi Server(:3002) ──HTTP──▶ Knowledge Server(:3003)
```

Knowledge Server 不访问 MongoDB，不引用 `@banyuan/xiangdi-agent` 的业务逻辑，是完全独立的知识服务。

---

## 许可证

[AGPL-3.0](../../LICENSE) / 商业授权
