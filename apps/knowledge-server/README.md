# knowledge-server — BanvasGL 知识服务

Knowledge Server 是 Banyuan 平台的独立知识微服务，运行在 `:3003`，负责知识的向量化、持久化与混合检索。它将 AI 上下文检索能力从 XiangDi Agent 执行路径中解耦出来，以独立服务的形式对 banyan 后端和 xiangdi-server 提供语义检索能力。

## 架构定位

```
banyan 后端(:3001) ──▶ 知识服务(:3002) ◀── XiangDi 服务(:3002)
     │                       │
     │ /knowledge/embed       ├── EmbeddingService（Xenova/multilingual-e5-small）
     │ /knowledge/search      ├── RerankerService（Xenova/ms-marco-MiniLM-L-6-v2）
     │                        ├── KnowledgeService（LanceDB + BM25 混合检索）
     └─────────────────────── └── BanvasGL 版本隔离（knowledge_v{version}）

种子脚本 ──▶ /knowledge/upsert ──▶ 知识服务
```

**核心设计原则**：知识与 BanvasGL 版本强关联，AISchema 变更会影响知识的有效性，独立发版便于追踪版本影响。向量化与存储均在同一进程内完成（ONNX 本地推理 + LanceDB 嵌入式存储），无需额外部署向量数据库或外部推理服务。

## 检索流程

```
查询文本
    │
    ▼
EmbeddingService（ONNX 推理，multilingual-e5-small）
    │ 384 维向量
    ▼
┌──────────────────────────────────┐
│           粗排（Coarse Rank）      │
│                                  │
│  向量检索（LanceDB）               │
│  BM25 全文检索（LanceDB FTS）      │
│         ↓                        │
│   RRF 融合（Reciprocal Rank Fusion）│
│   权重：向量 60% + BM25 40%         │
└──────────────────┬───────────────┘
                   │ topK × rerankFactor 候选
                   ▼
┌──────────────────────────────────┐
│          精排（Rerank）            │
│                                  │
│   Cross-Encoder（ms-marco-MiniLM）│
│   对 (query, candidate) 逐对打分   │
│   用精排分数替换粗排分数             │
└──────────────────┬───────────────┘
                   │ 最终 topK 结果
                   ▼
              KnowledgeChunk[]
```

精排失败时自动降级到粗排结果，保障检索可用性。当知识库条目不足或 FTS 索引未就绪时，仅使用向量检索。

## API

### `GET /health`

健康检查。

**响应**：`200 OK`，`{ status: "ok" }`

---

### `POST /knowledge/search`

语义检索知识库，返回与查询最相关的知识片段。

**请求体**（`application/json`）：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `query` | `string` | 是 | 查询文本 |
| `topK` | `number` | 否 | 返回条目数，默认 5 |
| `minScore` | `number` | 否 | 最低分数阈值，默认 0 |
| `filter` | `object` | 否 | 元数据过滤，如 `{ category: "schema" }` |
| `rerank` | `boolean` | 否 | 是否启用 Cross-Encoder 精排，默认 `true` |
| `rerankFactor` | `number` | 否 | 精排扩展因子，默认 4（粗排取 topK×4 再精排）|

**响应**：

```json
{
  "chunks": [
    {
      "content": "知识内容",
      "source": "schema/rect",
      "score": 0.92,
      "metadata": { "category": "schema", "nodeType": "rect" }
    }
  ],
  "total": 1
}
```

---

### `POST /knowledge/upsert`

写入或更新知识条目（同 `id` 自动覆盖）。写入时自动完成向量化并重建 FTS 索引。

**请求体**（`application/json`）：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `entries` | `KnowledgeEntry[]` | 是 | 知识条目数组 |

`KnowledgeEntry` 结构：

```json
{
  "id": "schema/rect",
  "content": "知识文本内容",
  "source": "schema",
  "metadata": { "category": "schema", "nodeType": "rect" }
}
```

**响应**：`{ "success": true, "count": 10 }`

---

### `POST /knowledge/embed`

文本向量化，返回 384 维浮点向量。banyan 后端通过此端点完成 embedding 能力复用，无需在后端侧加载 ONNX 模型。

**请求体**：

```json
{ "text": "需要向量化的文本" }
```

**响应**：`{ "vector": [0.123, -0.456, ...] }`（384 维）

---

### `DELETE /knowledge/entries`

按 `id` 数组批量删除知识条目。

**请求体**：`{ "ids": ["schema/rect", "schema/text"] }`

**响应**：`{ "success": true, "deleted": 2 }`

---

### `GET /knowledge/stats`

返回当前知识库的统计信息。

**响应**：

```json
{
  "tableName": "knowledge_v0.3.1",
  "totalEntries": 42,
  "hasFtsIndex": true,
  "embeddingModel": "Xenova/multilingual-e5-small",
  "dimensions": 384
}
```

## 知识种子

知识种子由 `packages/xiangdi-agent/src/knowledge/seeds/` 提供，分三个层级：

| 层级 | 目录 | 内容 | 维护方式 |
|------|------|------|---------|
| `schema` | `seeds/schema/` | AISchema 节点类型文档（rect/text/image/flex/group 等） | 脚本自动生成 |
| `theme` | `seeds/theme/` | 设计主题与 token（颜色体系、字号/间距/圆角规范） | 人工维护 |
| `composition` | `seeds/composition/` | UI 组合模式（登录表单、商品卡片、数据表格等） | LLM 生成 + 人工 review |

```bash
# 写入所有层级
pnpm seed -- --layer all

# 仅写入特定层级
pnpm seed -- --layer schema
pnpm seed -- --layer composition
pnpm seed -- --layer theme
```

种子脚本（`scripts/seed-knowledge.ts`）读取 xiangdi-agent 的 seeds 目录，批量调用 `/knowledge/upsert` 写入，支持幂等执行（同 id 自动覆盖）。

## 目录结构

```
apps/knowledge-server/
├── src/
│   ├── app.ts              # Koa 应用实例（中间件 + 路由注册）
│   ├── server.ts           # 入口（监听端口）
│   ├── middleware/
│   │   ├── auth.ts         # 内部认证（X-Internal-Token 校验）
│   │   ├── errorHandler.ts # 全局错误处理
│   │   └── logger.ts       # 请求日志
│   ├── routes/
│   │   ├── health.ts       # GET /health
│   │   └── knowledge.ts    # POST /knowledge/search|upsert|embed, DELETE /knowledge/entries, GET /knowledge/stats
│   └── services/
│       ├── EmbeddingService.ts   # 本地 ONNX 推理（Xenova/multilingual-e5-small，384 维，单例）
│       ├── KnowledgeService.ts   # LanceDB 向量检索 + BM25 + RRF 混合检索 + Cross-Encoder 精排
│       └── RerankerService.ts    # Cross-Encoder 精排（Xenova/ms-marco-MiniLM-L-6-v2，单例）
└── scripts/
    └── seed-knowledge.ts   # 知识种子写入脚本
```

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Koa | ^2.15 | HTTP 框架 |
| @koa/router | ^13.1 | 路由 |
| @lancedb/lancedb | latest | 嵌入式向量数据库（本地文件，无需独立部署） |
| @huggingface/transformers | ^3.x | ONNX 本地推理（Xenova 模型） |
| @banyuan/banvasgl | workspace:* | 仅读取 `version` 做表名隔离 |
| tsx | ^4.19 | TypeScript 直接运行（开发模式） |

**模型说明**：

- **EmbeddingService**：`Xenova/multilingual-e5-small`，384 维，支持中英文混合语义，首次运行自动从 HuggingFace Hub 下载并缓存
- **RerankerService**：`Xenova/ms-marco-MiniLM-L-6-v2`，Cross-Encoder 架构，对 (query, passage) 对直接评分，精排效果显著优于向量余弦相似度

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务端口 | `3003` |
| `KNOWLEDGE_INTERNAL_TOKEN` | 内部认证 token（未设置时开发模式跳过认证） | — |
| `BANVASGL_VERSION` | BanvasGL 版本号（备选，通常从包自动读取） | — |

## 内部认证

所有写操作（`/knowledge/upsert`、`DELETE /knowledge/entries`）以及 `/knowledge/embed` 需要携带 `X-Internal-Token` 请求头，值为 `KNOWLEDGE_INTERNAL_TOKEN` 环境变量。`/knowledge/search` 和 `/knowledge/stats` 不需要认证。

开发模式下（`NODE_ENV !== 'production'` 且未设置 `KNOWLEDGE_INTERNAL_TOKEN`）跳过认证校验。

## 快速开始

### 前置条件

- Node.js ≥ 20
- pnpm ≥ 10.10

### 启动

**推荐**：通过根目录命令一键启动完整平台（含知识服务）：

```bash
# 在 monorepo 根目录
pnpm dev:banyan
```

**单独启动**（仅调试知识服务本身时使用）：

```bash
# 先确保 BanvasGL 已构建（知识服务读取其 version）
pnpm --filter @banyuan/banvasgl build

# 启动知识服务
pnpm --filter knowledge-server dev
```

服务启动后监听 `http://localhost:3003`。ONNX 模型在首次请求时懒加载（约 2~5 秒），随后保持常驻内存（单例）。

### 构建与生产启动

```bash
# 构建
pnpm --filter knowledge-server build

# 生产启动
pnpm --filter knowledge-server start
```

### 写入知识种子

```bash
# 在 knowledge-server 目录或根目录执行
pnpm --filter knowledge-server seed -- --layer all
```

## 与 Monorepo 其他包的关系

- **@banyuan/banvasgl**（`packages/banvasgl`）：仅用于读取版本号，拼接表名 `knowledge_v{version}`，实现按版本隔离知识库
- **@banyuan/xiangdi-agent**（`packages/xiangdi-agent`）：提供知识种子文件（`src/knowledge/seeds/`），知识服务的 `RemoteKnowledgeStore` 是 xiangdi-server 调用知识服务的 HTTP 客户端适配层
- **banyan 后端**（`apps/banyan/backend`）：通过 `KNOWLEDGE_URL` 环境变量（默认 `http://localhost:3003`）调用知识服务，用途包括 ContextBuilder 语义检索和 `/knowledge/embed` 向量化代理
- **xiangdi-server**（`apps/xiangdi-server`）：通过 `RemoteKnowledgeStore` 调用 `/knowledge/search`，为 `knowledge_search` 工具提供检索能力

## 禁止事项

- **禁止**在本服务中直接访问 MongoDB；持久化由 banyan 后端负责
- **禁止**在本服务中直接引用 `@banyuan/xiangdi-agent` 的源码（种子脚本通过 HTTP API 写入，不直接 import）
- **禁止**在生产环境中不设置 `KNOWLEDGE_INTERNAL_TOKEN`；写操作必须经过认证
