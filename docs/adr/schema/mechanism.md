# Schema · 机制级决策

> 某个机制怎么工作——数据格式转换、版本化、物料序列化等核心机制。

---

## AI Projection 双向转换机制

**✅ 已实施**

toAIProjection(scene) 将 Full JSON 转换为 AI 可读的精简结构；fromAIProjection(projection) 将 AI 产出转换回 Full JSON 并注入引擎。转换过程包括：属性重命名（语义化）、默认值省略/补全、ID 生成、结构验证。

**决策链：** AI 需要精简输入（节省 token）和语义化输出（减少幻觉）-> 但引擎只认完整 Full JSON -> 需要双向转换层 -> fromAIProjection 作为"安检门"，只有通过验证的结构才进入引擎。

**约束：**

- fromAIProjection 失败时抛出详细错误（哪个字段、什么问题），用于 AI 重试
- 转换器跟随 ViewType / graphType / layoutMode 的增删同步更新
- AI Projection schema 变更属于 breaking change，需同步更新 XiangDi 知识种子

---

## 数据迁移外置到 CI/CD

**未实施**

引擎只认"当前版本"的数据格式，不内置任何兼容旧格式的逻辑。格式升级时编写独立的 Migration 函数，在 CI/CD 部署步骤中执行，将旧数据转换为新格式后再启动新版服务。

**决策链：** 如果引擎内置兼容逻辑 -> 随版本累积会形成"兼容性债务"（v1->v2->v3 的链式兼容代码永远不能删）-> 外置 Migration 让引擎保持精简 -> Migration 函数有明确的生命周期（执行一次后可归档）。

**约束：**

- Migration 函数入 Git 仓库，可 Code Review，有测试覆盖
- CI 中 migration-guard job 验证：如果引擎类型定义变了，必须有对应的 Migration 函数
- Migration 执行是幂等的（重复执行不产生副作用）
- 引擎启动时校验数据版本号，不匹配则拒绝启动并提示执行 Migration

**反例：**

- 引擎内运行时兼容所有历史格式——代码膨胀、测试组合爆炸、性能退化
- 用户手动执行迁移脚本——容易遗忘，生产环境出事故

---

## 物料序列化与反序列化

**✅ 已实施**

物料（Material）是 Full JSON 的可复用片段，序列化时从 Scene 中提取选中视图子树的 Full JSON + 元数据（名称、分类、缩略图）。反序列化时通过 fromMaterial() 注入 Scene，生成新 ID 避免冲突。

**决策链：** 用户需要复用设计好的组件组合 -> 直接复制 JSON 片段最简单 -> 但 ID 冲突和上下文依赖需要处理 -> fromMaterial 负责"重新分配 ID + 解除外部引用"。

**约束：**

- 物料不存储绝对位置（注入时由用户指定放置位置）
- 物料可跨应用使用（通过物料市场共享）
- 物料版本化：引擎升级后旧物料通过 Migration 机制兼容
