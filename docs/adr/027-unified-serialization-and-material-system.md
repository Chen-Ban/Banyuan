# ADR-027：统一序列化体系与物料系统 — 全量基座 + AI 语义投影 + 物料参数化投影

**状态**：已采纳  
**决策日期**：2026-05-28  
**决策者**：陈班

---

## 背景

BanvasGL 当前存在三种与序列化相关但彼此割裂的机制：

1. **全量序列化**（Serializer + View.toJSON/fromJSON）：精确无损，用于 MongoDB 持久化和前端实例还原。使用 `$type/$value` 包装协议，支持所有类型的递归序列化/反序列化。

2. **AISchema**（xiangdi-agent/src/schema/AISchema.ts）：为 LLM 设计的压缩格式。当前设计是**有损**的——丢弃了事件绑定、生命周期、数据模型、装饰、动画等信息，只保留视觉结构。这个设计有根本性缺陷：这些被丢弃的信息正是 AI 需要理解和生成的。

3. **物料系统**：完全缺失。当前 `IComponentTemplate` 仅能描述原子组件的创建指令（viewType + graphType + defaultProps），无法描述复合容器、无法支持用户自定义物料的生成/存储/远程加载/还原。

核心问题：

- AISchema 的有损设计限制了 AI 的能力边界——AI 无法生成/修改事件绑定和交互逻辑
- 缺少物料体系导致 AI 每次都必须完整描述所有视图细节，token 成本高昂
- 没有统一的序列化设计视角，各机制独立演进可能产生不一致

---

## 决策

### 决策一：全量 JSON 为唯一基座，其他表示均为其投影

整个序列化体系围绕 View.toJSON()/fromJSON() 构建。DB 存储的是全量 JSON 的 1:1 映射。AI Projection 和 Material Projection 都是全量 JSON 的确定性变换，不引入独立的"AISchema"或"MaterialSchema"格式概念。

### 决策二：废弃有损 AISchema，AI 直接使用全量 JSON 的等价语义投影

AI Projection 是全量 JSON 的**等价变换**——同构、无损、可逆。变换规则：展平 `$type/$value` 包装、矩阵语义化为 transform、默认值省略、null 事件省略。信息量不变，只是表达形式对 LLM 更友好更紧凑。

### 决策三：AI 的极致压缩通过物料引用机制实现，而非格式压缩

AI Projection 中引入 `$material` 特殊节点类型。LLM 可以输出一个物料引用 + 参数，替代完整描述复合子树。压缩比取决于物料复杂度（通常 90%+ token 节省），但不牺牲任何表达能力——没有匹配物料时 LLM 退回完整描述模式。

### 决策四：物料 = 全量 JSON 子树快照 + 参数孔洞

物料模板直接存储 View.toJSON() 的输出结构，只是将 ID 替换为占位符、资源 URL 替换为占位符、用户指定的可配置属性替换为参数占位符。还原时通过占位符替换 + Serializer.revive() 即可恢复完整 View 实例树。

### 决策五：内置物料迁移为 IMaterial 格式，IComponentTemplate 最终废弃

当前 `IComponentTemplate`（viewType + graphType + defaultProps）是"原子创建指令"，配合 `viewCreateStrategies` 策略表实现创建。`IMaterial` 体系成熟后，内置物料也迁移为 `IMaterial` 格式（children 为空、parameters 为空的退化情况），实现物料体系完全统一。迁移完成后：

- `IComponentTemplate` 接口废弃删除
- `viewCreateStrategies.ts` 废弃删除（创建逻辑统一走 `material.instantiate()`）
- `IComponentDefinition.template` 字段类型从 `IComponentTemplate` 改为 `IMaterialTemplate`
- 面板拖拽创建统一走 `actions.material.instantiate()` 路径
- `DESIGN_MATERIALS` 从硬编码的策略指令转变为预置的 IMaterial 物料包

---

## 架构全景

```
                    View 实例树（运行时唯一真相）
                           │
                      toJSON / fromJSON
                           │
                           ▼
                ┌── 全量 JSON（基座）──┐
                │  精确、无损、可逆     │
                │  DB 直存直取          │
                └────────┬─────────────┘
                         │
              ┌──────────┼──────────┐
              │                     │
      toAIProjection()      material.serialize()
      fromAIProjection()    material.instantiate()
              │                     │
              ▼                     ▼
    ┌─────────────────┐   ┌─────────────────────┐
    │  AI Projection  │   │ Material Projection  │
    │  等价语义变换    │   │ 参数化子树快照       │
    │  支持$material  │   │ 占位符 + 参数声明    │
    └─────────────────┘   └─────────────────────┘
```

---

## AI Projection 变换规则

| 全量 JSON | AI Projection | 变换类型 |
|---|---|---|
| `{ "$type": "FLEXVIEW", "$value": {...} }` | `{ "type": "FLEXVIEW", ... }` | 展平包装 |
| `matrix: [16 个数字]` | `transform: { x, y, rotation?, scaleX?, scaleY? }` | 语义解构 |
| `viewport: { x, y, width, height }` | `size: { width, height }` | 语义提取 |
| `constraintBounds: {...}` | 省略（从 size 推导） | 冗余消除 |
| `events: { onClick: null, ... }` | `events: {}` 或省略 | null 值省略 |
| `visible: true, freezed: false` | 省略 | 默认值省略 |
| `decoration: undefined` | 省略 | 空值省略 |

核心约束：`fromJSON(fromAIProjection(toAIProjection(toJSON(view)))) ≡ view`（语义等价）。

---

## 物料系统类型定义

```typescript
interface IMaterial {
  meta: IMaterialMeta
  template: IMaterialTemplate
}

interface IMaterialMeta {
  id: string
  version: string
  name: string
  description?: string
  thumbnail?: string
  author: string
  tags?: string[]
  category?: string
  createdAt: number
  updatedAt: number
}

interface IMaterialTemplate {
  root: any                              // View.toJSON() 结构，带占位符
  parameters: IMaterialParameter[]       // 参数声明
  assets: IMaterialAsset[]               // 资源清单
  idCount: number                        // ID 占位符数量
  internalIdRefs: Record<string, string[]>  // FlowSchema 中的 viewId 引用映射
}

interface IMaterialParameter {
  id: string
  name: string
  type: 'string' | 'number' | 'color' | 'image' | 'boolean' | 'enum' | 'flowSchema'
  defaultValue: any
  bindings: Array<{ nodePath: string; propPath: string }>
}

interface IMaterialAsset {
  id: string
  type: 'image' | 'font' | 'video' | 'audio'
  url: string
  hash: string
}
```

---

## 影响范围

| 模块 | 影响 | 优先级 |
|------|------|--------|
| `packages/banvasgl/src/engine/Serializer.ts` | 无需改动，保持原样 | — |
| `packages/banvasgl/src/view/*/toJSON()` | 无需改动，保持原样 | — |
| `packages/banvasgl/src/actions/` | 新增 `materialActions.ts` | P1 |
| `packages/banvasgl/src/types/hook/hook.ts` | 新增 `IMaterialActions` 接口 | P1 |
| `packages/banvasgl/src/data/designMaterials.ts` | **重写**为 IMaterial[] 格式 | P3 |
| `packages/banvasgl/src/actions/viewActions.ts` | `create()` 方法废弃，统一走 `material.instantiate()` | P3 |
| `packages/banvasgl/src/actions/viewCreateStrategies.ts` | **废弃删除** | P3 |
| `packages/banvasgl/src/types/hook/hook.ts` | 删除 `IComponentTemplate`，修改 `IComponentDefinition.template` 类型 | P3 |
| `packages/xiangdi-agent/src/schema/AISchema.ts` | **废弃删除** | P0 |
| `packages/xiangdi-agent/src/schema/converters.ts` | **重写**为 AI Projection 转换器 | P0 |
| `packages/xiangdi-agent/src/tools/` | 新增物料搜索/使用工具 | P2 |
| `apps/xiangdi-server/` | 上下文组装切换为 AI Projection | P0 |
| `apps/banyan/backend/src/services/AiService.ts` | 移除 banvasToAIApp/aiAppToBanvas 调用 | P0 |
| `apps/banyan/backend/src/models/` | 新增 Material 模型 | P1 |
| `apps/banyan/backend/src/services/` | 新增 MaterialService | P1 |
| `apps/banyan/backend/src/routes/` | 新增物料 CRUD API | P1 |
| `apps/banyan/frontend/src/components/` | 新增物料面板 UI | P2 |
| `apps/knowledge-server/` | 物料元信息索引 | P2 |

---

## 备选方案（已否决）

1. **保留有损 AISchema + 为每种能力独立加工具**：被否决，因为本质上是将一个统一的数据操作问题拆散到多个工具中，增加 Agent 编排复杂度。

2. **物料模板使用独立格式（不复用 toJSON）**：被否决，因为引入额外的格式转换层增加维护成本和信息丢失风险。

3. **在 IComponentTemplate 上加 children 字段**：被否决，因为 IComponentTemplate 的定位是"原子创建指令"，将其扩展为完整的树形快照会模糊职责边界。物料模板是独立的更高层次抽象。

---

## 参考

- 阿里 LowCodeEngine 三层协议（搭建协议 + 物料协议 + 资产包协议）
- Figma Component/Variant 模型
- Webpack Module Federation 远程组件加载
- Colyseus Schema 增量序列化思路
