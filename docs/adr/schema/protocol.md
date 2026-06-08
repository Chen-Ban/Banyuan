# Schema · 协议级决策

> 模块间怎么通信——跨边界的数据格式规范与版本化接口。

---

## 决策依赖图

```
┌───────────────────────────────────────┐
│  C1 Full JSON 序列化格式协议           │
└───────────────────┬───────────────────┘
                    │ enables
┌───────────────────▼───────────────────┐
│  C2 AI Projection 投影格式协议         │
└───────────────────────────────────────┘

┌───────────────────────────────────────┐
│  C3 版本化表三表各自独立版本号         │
└───────────────────────────────────────┘
```

关系说明：

- C1→C2：Full JSON 格式协议定义了完整字段集合和命名规范，AI Projection 格式协议在此基础上定义投影规则（哪些字段省略、如何重命名、如何扁平化）。C1 使 C2 成为可能。
- C3 独立存在：版本号协议关注的是数据存储层的版本化策略，与序列化格式正交。

---

## 序列化格式

### C1. Full JSON 序列化格式协议

**✅ 已实施** · 细化 A1（全量 JSON 基座的具体格式规范，机制归属上溯 A0）

Full JSON 是 Scene 级别的完整序列化输出。顶层结构为 { pages: Page[], theme?, globalData? }，每个 Page 包含视图树（嵌套的 View JSON）和页面级配置。每个 View JSON 包含所有属性（含默认值）、addon 状态、data 字段、events/lifetimes 的 FlowSchema 引用。

> **A0 机制/策略定位：** 本协议规定的是 banvasgl 运行时**序列化机制**对外的格式契约——按 A0，「序列化/版本迁移」是 banvasgl 提供的机制。schemaVersion 字段即为该机制与版本迁移机制（M2/A6a）的衔接锚点；格式只描述「如何无损序列化」，不约束「何时序列化、何时迁移」这类上层策略。

**决策链：** A0 把序列化定为 banvasgl 运行时机制（经 A1 承接）→ 需要一种格式能无损保存和恢复 Scene 的完整状态 -> JSON 是最通用的序列化格式 -> 包含所有字段（含默认值）确保反序列化不依赖引擎当前默认值设置。

**约束：**

- 字段命名使用 camelCase
- 所有坐标值使用逻辑像素（非物理像素）
- events 和 lifetimes 字段存储 FlowSchema ID 引用或内联 FlowSchema
- 版本号字段 schemaVersion 标识格式版本，用于 Migration 匹配

---

### C2. AI Projection 投影格式协议

**✅ 已实施** · 依赖 C1

AI Projection 是 Full JSON 面向 AI 的精简投影。规则：省略等于默认值的字段、扁平化嵌套样式对象（如 boxDecoration.backgroundColor -> backgroundColor）、重命名为语义化 key（如 children -> views）、ID 使用语义化短标识。

**决策链：** Full JSON 对 AI 来说噪声太大 -> 需要精简但不丢失语义信息 -> 通过投影规则把"引擎实现细节"隐藏、把"设计语义"暴露 -> AI 只需要理解和生成精简格式。

**约束：**

- AI Projection 必须能无歧义地还原为 Full JSON（fromAIProjection 不需要猜测）
- 省略字段的默认值由 fromAIProjection 内部硬编码（跟随引擎当前版本的默认值）
- 新增 ViewType 必须同步定义其 AI Projection 映射规则

---

## 版本号协议

### C3. 版本化表三表各自独立版本号

**✅ 已实施** · 细化 A2（三表存储的版本号管理规范）

AppContent、CollectionSchemaVersion、CloudFunctionBundle 各自维护独立递增的版本号。Application 文档通过三个引用字段（currentAppContentId、currentSchemaVersionId、currentFunctionBundleId）指向当前活跃版本。

**决策链：** 三份数据变更频率完全不同（UI 频繁改、数据表偶尔改、云函数中等频率）-> 统一版本号会导致大量"空版本"（内容没变但版本号增了）-> 独立版本号精确反映各自变更历史。

**约束：**

- 版本号严格递增，不允许回退（回滚是创建新版本）
- Application 文档的三个引用字段原子更新（事务）
- DeploymentSnapshot 冻结三个版本 ID 的组合，确保可精确回滚到历史状态
