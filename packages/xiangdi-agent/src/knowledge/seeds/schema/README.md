# Schema 层知识种子

此目录存放**自动生成的** Schema 层知识种子数据。

## 内容

基于 AI Projection 类型体系（`packages/xiangdi-agent/src/schema/projection.types.ts`）生成的结构化文档，覆盖 BanvasGL 所有可操作的节点类型：

| 种子文件 | 节点类型 | 说明 |
|----------|----------|------|
| common.json | Common | 公共字段 + AIDecoration + AIEvents + AIDataModel |
| scene.json | Scene | 页面/场景（AIProjectionScene） |
| graphview.json | GRAPHVIEW | 图形视图（含各 graphType 子类） |
| textview.json | TEXTVIEW | 文本视图（富文本段落结构） |
| imageview.json | IMAGEVIEW | 图片视图 |
| videoview.json | VIDEOVIEW | 视频视图 |
| combinedview.json | COMBINEDVIEW | 容器视图（free/flex/list/grid/scroll 五种布局） |
| nodeview.json | NODEVIEW | 流程图节点 |
| edgeview.json | EDGEVIEW | 流程图连线 |
| portview.json | PORTVIEW | 流程图端口 |

每个种子内容包含：类型描述、属性结构、最小 JSON 示例、使用场景。

## 生成方式

由 `packages/banvasgl/scripts/generate-knowledge.ts` 脚本自动生成：

```
pnpm build:banvasgl
  └─ postbuild: tsx scripts/generate-knowledge.ts
       └─ 输出 10 个 JSON 文件到此目录
```

## 版本策略

- 种子 `metadata.version` 取自 `packages/banvasgl/package.json` 的 version 字段
- knowledge-server 按版本隔离向量表（`knowledge_v{version}`）
- 基础库版本升级时，postbuild 重新生成种子，写入新版本表
- 旧版本数据在向量库中保留不变，服务于旧版本应用

## 写入流程

种子文件生成后，通过 knowledge-server API 写入向量库：

```
POST /knowledge/upsert
{
  "entries": [{ id, content, source, metadata }]
}
```

由 seed 脚本或 CI 管线在构建后自动调用。

## 注意

- 此目录下的 JSON 文件是自动生成的，**请勿手工编辑**
- 修改种子内容请编辑 `packages/banvasgl/scripts/generate-knowledge.ts`
- LLM 在运行时通过 `knowledge_search` 工具按需检索这些知识
