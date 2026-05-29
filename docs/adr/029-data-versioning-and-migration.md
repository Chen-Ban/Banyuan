# ADR-029：数据格式版本化与 Migration 机制

**状态**：已采纳  
**决策日期**：2025-07-14  
**决策者**：陈班  
**前置依赖**：ADR-027（统一序列化体系与物料系统）

---

## 背景

### 核心问题

ADR-027 确立了统一序列化体系——全量 JSON 是唯一基座，DB 存储的是 `Serializer.serialize(scene)` 的 1:1 映射，物料模板（IMaterial）直接存储 `View.toJSON()` 子树快照。这套体系精确无损，但天然缺少一个机制：**当引擎格式随版本演进时，已持久化的旧数据如何安全迁移**。

### 关键约束：Monorepo 原子发版

Banyuan 采用 pnpm monorepo + lockstep 版本策略，CI 门禁（`pnpm build:all`）保证单次发版内代码不会出现版本错配。因此**代码兼容性（API deprecation cycle、adapter layer）不在本 ADR 的关注范围内**。本 ADR 只关注一个问题：**已持久化的数据如何跟随格式变更安全升级**。

### 数据存储点

ADR-027 完成后，需要进行版本化管理的持久化数据有三类：

| 存储位置 | 格式 | 版本敏感原因 |
|----------|------|------------|
| MongoDB `pages` 字段 | `Serializer.serialize(scene)` 输出的 JSON 字符串数组 | View.toJSON() 格式随引擎版本演进 |
| MongoDB `materials` 集合 | `IMaterial.template.root` = View.toJSON() 子树快照 | 同上，快照在发布时冻结 |
| `@banyuan/flow` 节点数据 | FlowSchema JSON，嵌套在 View.events/lifetimes 中，随 pages 一起存储 | FlowSchema 格式随 flow 包版本演进 |

有一类数据**不需要**迁移：OSS 已发布产物。构建产物是自包含的静态包，在打包时同时冻结了引擎代码和数据，无需也无法独立迁移。

### 序列化格式结构（ADR-027 确立）

```typescript
// Serializer.serialize() 输出的顶层包装
interface SerializedData {
  type: string      // 如 "Scene"
  version: string   // 当前硬编码为 '1.0.0'，本 ADR 激活该字段
  data: any         // 递归的 { $type, $value } 结构
  metadata?: { timestamp: number; source: string }
}

// 内部节点包装格式
{ "$type": "FlexView", "$value": { id, type, visible, wrap, ... } }
{ "$type": "Matrix4",  "$value": [ ...16 floats ] }

// IMaterial 中的 template.root 是同一格式的子树
{ "$type": "FlexView", "$value": { ..., children: [...] } }
```

---

## 决策

### 决策一：激活版本字段

`Serializer.serialize()` 目前写入 `version: '1.0.0'` 但反序列化时完全忽略该字段——它是一个"死字段"。将其激活，写入当前引擎的语义版本：

```typescript
// Serializer.serialize() 中
const serializedData: SerializedData = {
    type: this.getObjectType(obj),
    version: BANVASGL_VERSION,  // 由 tsup define 宏从 package.json 注入
    data: this.serializeValue(obj, opts, 0),
    metadata: { timestamp: Date.now(), source: 'BanvasGL Serializer' },
}
```

**存量数据处理**：缺少 `version` 字段或值为 `'1.0.0'` 的旧数据，在迁移管线中统一视为基线版本（引入 migration 机制时的当前版本）。

### 决策二：有序迁移管线（Migration Pipeline）

引入 `MigrationRegistry`，维护按版本升序排列的迁移函数链。`Serializer.deserialize()` 入口处比较数据版本与当前引擎版本，按序执行区间内所有迁移函数，再进入 `deserializeValue()`。

```typescript
interface Migration {
  /** 执行此迁移后数据的目标版本 */
  version: string
  description: string
  /** 在原始 JSON 层面变换 SerializedData，不依赖任何 View/Graph 类实例 */
  up(data: SerializedData): SerializedData
}

class MigrationRegistry {
  private migrations: Migration[] = []

  register(migration: Migration): void

  /** 将 data 从其 version 迁移到当前引擎版本，返回更新后的 SerializedData */
  migrate(data: SerializedData): SerializedData
}
```

**核心设计原则**：

迁移函数操作的是 `JSON.parse()` 后的 plain object，在 `deserializeValue()` 之前执行，因此完全不依赖任何运行时类实例。迁移函数可以单独测试，输入一段旧格式 JSON，断言输出符合新格式，无需启动完整引擎。

`Serializer.deserialize()` 的新调用链：

```
JSON.parse(json)
  → MigrationRegistry.migrate(data)      // 数据格式升级到当前版本
  → deserializeValue(data.data)          // 递归还原 View/Graph 实例
```

同理，`Serializer.revive()`（用于操作栈的 applyDiff）也经过迁移管线，确保历史 diff 数据可以正确还原。

### 决策三：类型级迁移（Type-Level Migration）

全局 Migration 适合跨类型的结构变更。对于**单个类型内部**的小范围格式调整（字段新增默认值、字段重命名），引入更轻量的 per-type 版本标注：

```typescript
// 序列化时在 $value 中写入 _v 字段
{ "$type": "FlexView", "$value": { "_v": 2, "id": "...", "wrap": true, ... } }

// TypeRegistry 中的 deserializer 按 _v 分发
deserializer: (data: any) => {
  const v = data._v ?? 1           // 无 _v 的存量数据视为 v1
  if (v === 1) return FlexView.fromJSON_v1(data)   // 补 wrap/lineGap 默认值
  return FlexView.fromJSON(data)
}
```

**选型建议**：

- 新增可选字段（存量数据缺失时有明确默认值）→ 优先用 type-level migration（`_v` 升级 + 默认值填充），更轻量
- 字段删除/重命名，或跨多个类型的结构变化 → 用全局 Migration

### 决策四：FlowSchema 版本对齐

FlowSchema 嵌套在 `View.events`（13 个事件字段）和 `View.lifetimes`（3 个钩子）中，随 pages JSON 一起持久化，其格式由 `@banyuan/flow` 包定义。

当 flow 包格式变更时，FlowSchema 数据通过全局 Migration 覆盖：迁移函数递归遍历所有 View 的 events/lifetimes 字段，对其中的 FlowSchema 子结构执行变换。由于 monorepo lockstep 发版，Flow 格式变更与 BanvasGL 版本号联动，`@banyuan/flow` 导出 `FLOW_SCHEMA_VERSION` 常量供迁移函数判断是否需要处理。

### 决策五：AI 投影层无需迁移

ADR-027 确立的 AI Projection（`projection.ts`）是全量 JSON 的等价语义变换——它是一个纯运行时函数，不持久化任何数据。XiangDi 对话中的投影 JSON 存在于 SSE 流中，随请求生灭。因此 AI 投影层**不需要数据迁移机制**。

ADR-027 对这一层的保障是：projection.ts 有完整的 fixture 测试（固化 View JSON → 投影 JSON 的输入输出），当引擎格式发生变更时，fixture 测试自然失败，CI 门禁阻止合入，迫使开发者同步更新投影函数。这是代码层面的保障，不是数据迁移。

### 决策六：迁移覆盖策略

**MongoDB pages 的迁移时机**：

- **Lazy（优先）**：应用打开时由 `deserialize()` 自动触发迁移管线，迁移后**不回写**。用户下次保存时，自然以新格式写入 MongoDB。无需停机，无需全量脚本。
- **Eager（可选）**：针对迁移逻辑较重（如全量遍历重建某字段）的版本，可在发版后以后台脚本批量预迁移，避免用户首次打开时的延迟。

**MongoDB materials 快照的迁移时机**：

IMaterial 物料快照的实例化路径（ADR-027 决策四）在调用 `Serializer.revive()` 前先经过迁移管线：

```
IMaterial.template.root
  → MigrationRegistry.migrate(snapshot, from: meta.engineVersion)
  → 参数占位符替换
  → Serializer.revive()
  → View 实例
```

其中 `IMaterialMeta.engineVersion` 标记快照写入时的引擎版本，迁移管线据此确定起点。

### 决策七：物料市场的迁移保障

物料快照一旦发布便永久存储，其 `engineVersion` 随时间与当前版本产生差距。需要一套机制确保物料在引擎升级后仍可正确实例化：

**三类物料的迁移责任**：

| 物料来源 | 迁移责任方 | 机制 |
|----------|-----------|------|
| `builtin`（内置物料包） | 引擎团队随发版更新 | 代码变更，非数据迁移。内置物料的 `engineVersion` 始终等于当前引擎版本 |
| `community`（官方物料市场） | 物料市场 CI 自动验证 | 引擎 PR 合入 main 时触发验证 job，对所有已发布物料执行 `migrate → revive` 链路，失败则标记 `needsUpdate` 并通知作者 |
| `user`（用户自定义） | Lazy + 平台提示 | 用户拖拽使用物料时，若 `migrate → revive` 失败则弹出提示「该物料需更新」，提供基于 migration diff 的自动修复建议 |

**社区物料 CI 验证流程**：

```
引擎 PR → CI trigger
  → 拉取所有 community 物料的 IMaterial 数据
  → for each material:
      migrate(template.root, from: meta.engineVersion, to: current)
      → Serializer.revive()
      → 断言实例化成功（无异常，根 View 类型正确）
  → 失败物料：写入 needsUpdate 状态 + 生成 migration diff 报告 + 通知作者
```

---

## 实施路径

```
Phase 1：迁移基础设施
  ├─ Serializer.serialize()：version 字段从 '1.0.0' 改为 BANVASGL_VERSION
  ├─ 新增 MigrationRegistry（register / migrate / semver 版本比较）
  ├─ Serializer.deserialize() 和 revive() 入口集成 migrate()
  ├─ 约定：version 缺失或 '1.0.0' → 视为初始基线版本
  └─ 第一个空 Migration（baseline → 当前版本，无变换，用于验证管线本身正确）

Phase 2：回归保障体系
  ├─ Snapshot fixture：固化当前版本所有 ViewType 的 toJSON 输出格式
  ├─ Migration 测试规范：每个 Migration 配套「旧格式 JSON → 新格式 JSON」断言测试
  ├─ CI 门禁：修改任何 toJSON/fromJSON 的 PR 必须同时提供 Migration 或 _v 升级
  └─ IMaterial 实例化路径：integrate migrate() 到 material.instantiate() 调用链

Phase 3：物料市场 CI
  └─ 引擎发版触发物料验证 job（社区物料全量验证 + needsUpdate 标记）
```

---

## 影响范围

| 模块 | 变更 |
|------|------|
| `packages/banvasgl/src/engine/Serializer.ts` | 激活 version 字段 + deserialize/revive 集成 migrate |
| 新增 `packages/banvasgl/src/engine/migrations/` | MigrationRegistry 类 + 按版本命名的迁移函数文件 |
| `packages/banvasgl/src/actions/materialActions.ts` | instantiate() 调用链前插入 migrate() |
| `packages/flow/src/types/schema.ts` | 导出 FLOW_SCHEMA_VERSION 常量 |
| `apps/banyan/backend/src/services/` | 可选：eager 批量迁移脚本 |
| CI 配置 | Migration PR 门禁规则 + 物料市场验证 job |

---

## 被否决的方案

### 方案A：双版本 Serializer 并行

每次 breaking change 维护新旧两套 Serializer。否决理由：维护成本随版本数指数增长，且无法处理多个中间版本跨越。

### 方案B：向前兼容约定（永不 break toJSON 结构）

约定只做加法，永不删除/重命名字段。否决理由：随着容器体系扩展（ADR-030 的 GridView layoutParams、ScrollView 新字段）和物料体系成熟，字段重命名和结构调整不可避免，强制向前兼容最终会使序列化格式变得臃肿且难以维护。

### 方案C：MongoDB 层面做 Schema 迁移

否决理由：pages 和 materials 快照在 MongoDB 中是 opaque JSON string，MongoDB 的 schema migration 工具无法理解 `{ $type, $value }` 协议内部的结构。迁移必须在 Serializer 层完成。

### 方案D：在 projection.ts 中处理版本兼容

否决理由：projection.ts 是运行时函数，读取的是已经过迁移管线处理的当前版本数据。将版本兼容逻辑下沉到投影层，会使同一份持久化数据在不同地方有多套"读取视角"，违反 ADR-027 确立的「全量 JSON 为唯一基座」原则。

---

## 后续演进

- **快照版本**：当迁移链超过 10 个版本跨度时，将所有历史迁移合并为一个"直达迁移"函数作为新基线，旧迁移函数归档保留
- **Pool 模式下的迁移**：多租户共享运行时要求同一时刻所有租户数据格式一致，届时可能强制 eager 批量迁移策略
- **第三方插件 ViewType**：插件开发者需自行注册 type-level migration 函数（`_v` 升级），并随插件版本发布
