# ADR-042：应用内容版本化三表拆分

**状态**：已决策  
**决策日期**：2026-06  
**决策者**：陈班  
**关联**：ADR-039（Dialogue 作为唯一权威状态机）、ADR-041（Orchestrator + 领域 SubAgent）

---

## 背景

### Application 表的职责膨胀

当前 Application 模型同时承担两个正交的职责：一是应用的**元数据管理**（name、slug、tenantId、version、部署状态等），二是应用的**内容存储**（appJSON——一个可能几十甚至上百 KB 的 BanvasGL 序列化字符串）。这导致列表查询、权限校验等高频读操作被迫加载巨大的 appJSON 字段，要么做 projection 排除（代码散落各处，容易遗漏），要么承受不必要的 IO 开销。

### 三种内容实体的不对称处理

一个完整的应用状态由三部分组成：BanvasGL 视图序列化（appJSON）、动态数据表定义（collections）、云函数定义（cloudFunctions）。目前它们的存储方式不一致：

- **appJSON**：嵌入 Application 文档的 string 字段，原地更新，无历史版本
- **CollectionSchema**：独立集合，按 appId unique，原地 `version++`，无历史版本
- **CloudFunction**：独立集合，每个函数一个文档，按 `{ appId, functionId }` 索引，原地更新

这种不一致带来两个问题。第一，Dialogue 做应用快照时必须将三部分内容**全量复制嵌入**（因为源表会被后续修改覆盖），一个活跃应用每轮 AI 对话都冗余存储整份内容。第二，CloudFunction 一个 app 下散落多个独立文档，无法做"这一组函数在某时刻的整体状态"的原子快照——要么逐个复制、要么用事务，但语义上缺少"一组函数的版本"这个概念。

### 版本回退的需求

ADR-039 确立 Dialogue 链即版本历史：每个 done 态的 Dialogue 对应应用的一个确认版本。但当前的回退路径是"从历史 Dialogue 的嵌入快照中取出 appJSON/collections/cloudFunctions，整体覆盖写回源表"——这是一次全量写操作，且如果嵌入快照体积大，Dialogue 文档本身也变得臃肿。

如果内容实体是 append-only 的版本链，回退就退化为"把 Application 的版本指针指回某个历史版本号"——一次 `$set` 操作，零数据拷贝。

---

## 决策

**将应用内容拆分为三个独立的 append-only 版本化集合，Application 退化为纯元数据壳 + 版本指针。Dialogue/Deployment 的快照从全量嵌入改为版本号引用。**

### 新模型结构

```
Application（元数据壳）
├── application_id, name, description, thumbnail, tags
├── tenantId, createdBy, updatedBy
├── appSlug, webUrl, deployType, publishedVersion, lastDeployedAt
├── currentAppContentVersion: number      ← 当前 AppContent 版本
├── currentCollectionSchemaVersion: number ← 当前 CollectionSchema 版本
├── currentCloudFunctionVersion: number   ← 当前 CloudFunction 版本
└── timestamps

AppContent（BanvasGL 序列化，append-only）
├── appId: string                   ← 关联 Application
├── version: number                 ← 自增版本号
├── appJSON: string                 ← BanvasGL Serializer 输出
└── createdAt

CollectionSchema（数据表定义组，append-only）
├── appId: string
├── version: number
├── collections: ICollectionDef[]   ← 该版本下所有数据表定义
└── createdAt

CloudFunction（云函数定义组，append-only）
├── appId: string
├── version: number
├── functions: ICloudFunctionDef[]  ← 该版本下所有云函数定义
└── createdAt
```

### Application 与内容的关系

三个内容表各自维护独立的版本号序列，互不干扰。Application 通过三个版本指针分别关联各内容表的最新版本：

```
Application（元数据壳）
├── ...
├── currentAppContentVersion: number
├── currentCollectionSchemaVersion: number
├── currentCloudFunctionVersion: number
└── ...
```

confirm 时只递增实际发生变化的内容表的版本号。例如一轮 AI 对话只修改了 UI（appJSON），则只写入 AppContent 新版本并递增 `currentAppContentVersion`，CollectionSchema 和 CloudFunction 保持不变。这避免了未变化内容的冗余写入。

### Dialogue 快照

```typescript
/** 应用内容版本快照（Dialogue / Deployment 中嵌入） */
interface IAppVersionRef {
  /** AppContent 版本号 */
  appContentVersion: number
  /** CollectionSchema 版本号 */
  collectionSchemaVersion: number
  /** CloudFunction 版本号 */
  cloudFunctionVersion: number
}
```

Dialogue 从 `{ appJSON: string, collections: ICollectionDef[], cloudFunctions: ICloudFunction[] }` 三个嵌入字段简化为一个 `snapshot: IAppVersionRef`。由于内容表是 append-only（旧版本永不修改），版本号引用等价于不可变快照——无需复制数据即可冻结历史状态。需要还原某个 Dialogue 的完整应用状态时，按三个版本号分别查询即可（三次精确索引命中，可并行）。

### 构建期间的工作副本

AI 对话进行中（Dialogue phase 为 `start` ~ `awaiting_confirm`），SubAgent 会增量修改应用内容。此时修改的是**草稿**而非已确认版本。两种实现策略：

- **方案 A（推荐）**：Dialogue 额外持有 `draft: { appJSON?, collections?, cloudFunctions? }` 嵌入字段，作为构建期间的工作区。confirm 时将 draft 写入三个内容表的新版本，清空 draft。这保持了"内容表只存已确认版本"的不变量。
- **方案 B**：构建期间直接在内容表写入 `status: 'draft'` 的文档，confirm 时改为 `status: 'confirmed'`。增加了查询复杂度。

采用方案 A：Dialogue 保留嵌入式 draft，内容表只存已确认的 immutable 版本。

### CloudFunction 模型重构

当前 CloudFunction 表每个函数一个独立文档。改为与 CollectionSchema 对齐：一个 app 的所有函数打包为一个文档的 `functions[]` 数组。理由：

1. AI 一轮对话可能同时创建/修改多个函数，打包为原子版本更利于一致性
2. 与 CollectionSchema 的 `collections[]` 结构完全对齐，三种内容实体同构
3. 简化查询——"获取某 app 的所有云函数"从 `find({ appId })` 多文档变为 `findOne({ appId, version })` 单文档

```typescript
/** 云函数定义（嵌入 CloudFunction.functions[] 中） */
interface ICloudFunctionDef {
  functionId: string
  name: string
  displayName: string
  description: string
  flowSchema: Record<string, unknown>
}
```

注意 `appId`、`version`、`createdAt`、`updatedAt` 提升到外层文档，单个函数定义不再携带这些字段。

### Deployment 快照

Deployment 的 `snapshot: IDeploySnapshot` 同样从全量嵌入改为版本引用：

```typescript
interface IDeploySnapshot {
  /** 部署时的 AppContent 版本号 */
  appContentVersion: number
  /** 部署时的 CollectionSchema 版本号 */
  collectionSchemaVersion: number
  /** 部署时的 CloudFunction 版本号 */
  cloudFunctionVersion: number
  /** 部署类型决定是否需要后端资源 */
  deployType: 'static' | 'fullstack'
}
```

需要回滚时，通过三个版本号分别从对应内容表读取完整数据即可。

---

## 索引设计

```
AppContent:       { appId: 1, version: -1 } unique
CollectionSchema: { appId: 1, version: -1 } unique
CloudFunction:    { appId: 1, version: -1 } unique
```

高频查询模式：
- 获取最新版本：`findOne({ appId }, { sort: { version: -1 } })`
- 获取指定版本：`findOne({ appId, version })`
- Application 列表：只查 Application 表（轻量，无 appJSON）

---

## 迁移策略

### 阶段一：CloudFunction 表重构

将现有的 per-function 文档聚合为 per-app 文档（`{ appId, version, functions[] }`），结构对齐 CollectionSchema。原有 CloudFunction 集合原地改造，迁移脚本将同一 appId 下的多个函数文档合并为一个文档。

### 阶段二：AppContent 独立

从 Application 文档中拆出 appJSON，写入新的 `AppContent` 集合（version=1）。Application 增加三个版本指针字段，删除 `appJSON` 字段。

### 阶段三：CollectionSchema 补充 append-only 语义

现有 CollectionSchema 集合已经是 `{ appId, collections[], version }` 格式，只需将 appId 的 unique 约束改为 `{ appId, version }` 联合 unique，支持同一 appId 存在多个版本文档。

### 阶段四：Dialogue/Deployment 快照瘦身

新创建的 Dialogue 使用 `snapshot: IAppVersionRef` + `draft` 模式。历史 Dialogue 保持旧格式（嵌入快照），查询时做兼容处理，不做数据迁移。

---

## 收益

1. **Application 查询性能**：列表页、权限校验等高频操作不再加载 appJSON，文档体积从几十 KB 降至 < 1 KB
2. **Dialogue 文档瘦身**：快照从嵌入全量内容（可能 100+ KB）变为三个 version 数字，降低 MongoDB 文档体积限制风险
3. **零成本回退**：版本回退 = 修改 Application 的三个版本指针，无数据拷贝
4. **版本历史天然可审计**：append-only 意味着所有历史版本永久可追溯，支持 diff 对比
5. **三种内容实体同构**：统一的 `{ appId, version, content }` 模式，Service 层可抽象公共的 VersionedContentService
6. **按需写入，无冗余**：独立版本号意味着只有实际变化的内容表产生新版本，未修改的内容表零 IO
7. **Deployment 回滚简化**：回滚 = 用历史版本号重新部署，快照自带完整数据引用

---

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| 存储膨胀（append-only 不删旧版本） | 设 TTL 或定期归档策略，保留最近 N 个版本 + 所有 Dialogue 引用的版本 |
| 读取需要额外一次查询（Application → AppContent） | 高频路径（编辑器加载）可做 populate 或 Service 层缓存 |
| 迁移期间新旧格式并存 | Dialogue 查询做版本兼容（有 snapshot.version 走新路径，有 appJSON 走旧路径） |
| confirm 原子性 | confirm 时在一个 MongoDB session/transaction 内写入变化的内容表 + 更新 Application 对应版本指针 |

---

## 不采纳的方案

### 方案 B：三个内容表共享单一版本号

三个内容表共享 Application 的一个 `currentVersion` 序列，每次 confirm 时三表同时写入新版本文档。不采纳原因：大多数 AI 对话只修改 appJSON（UI 层），数据表和云函数不变，共享版本号会导致未变化的内容表也要生成冗余副本，浪费存储且无语义收益。

### 方案 C：保持 CloudFunction per-function 独立文档

不做打包，通过 `{ appId, batchVersion }` 字段做逻辑分组。不采纳原因：查询模式不对称（与 CollectionSchema 不一致），原子快照需要额外的分组查询，不如物理上打包为一个文档简洁。

### 方案 D：Dialogue 快照仍全量嵌入

保持现有嵌入模式，只做 Application 拆分。不采纳原因：未能解决 Dialogue 文档臃肿问题，且与 append-only 内容表的设计理念不一致——既然内容不可变，引用就等价于快照，无需重复存储。
