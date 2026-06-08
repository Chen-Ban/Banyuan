# Schema · 架构级决策

> 整体怎么组织——跨越系统边界的数据契约格式与序列化策略。

---

## 全量 JSON 为唯一序列化基座

**✅ 已实施**

BanvasGL 的完整序列化格式（Full JSON）是所有数据表示的唯一权威来源。AI Projection 和物料系统都是 Full JSON 的投影（projection），不是独立的格式。

**决策链：** 引擎内部需要完整结构（所有属性、addon 状态、内部 ID）-> AI 需要精简结构（只看语义相关属性）-> 物料需要可复用片段 -> 如果三者各自独立会产生同步问题 -> Full JSON 为单一事实来源，其他格式通过转换函数（toAIProjection / fromAIProjection / toMaterial / fromMaterial）派生。

**约束：**

- Full JSON 是 Scene 的完整 serialization，包含所有运行时不可推断的状态
- AI Projection 是 Full JSON 的子集投影 + 结构简化（扁平化样式、省略默认值、重命名为语义化 key）
- fromAIProjection() 是 AI 产出进入引擎的唯一入口，负责补全默认值、生成 ID、验证结构合法性
- 物料是 Full JSON 片段 + 元数据（分类、名称、缩略图），序列化/反序列化走相同管线

**反例：**

- AI 直接操作 Full JSON——属性太多、嵌套太深，AI token 浪费严重且容易写错内部字段
- AI Projection 作为独立格式独立存储——两份数据的同步是噩梦，任一方修改后另一方过期

---

## 应用内容版本化三表存储

**✅ 已实施**

应用的三份核心数据各自独立版本化：AppContent（页面 JSON）、CollectionSchemaVersion（数据表定义）、CloudFunctionBundle（云函数定义）。采用 append-only 追加写入，每次变更创建新版本记录。

**决策链：** 应用数据需要版本管理（回滚、对比、审计）-> 三份数据变更频率和变更粒度不同 -> 绑定在一起会导致"改了一行云函数就创建所有数据的新版本" -> 独立版本化让每份数据按自身节奏演进 -> append-only 保证历史不可篡改。

**约束：**

- 每个版本记录包含：完整快照数据 + 版本号 + 时间戳 + 来源（ai/manual/deploy）
- "当前版本"通过 Application 文档的引用字段指向，修改引用即切换版本
- 历史版本保留策略：最近 50 个版本永久保留，更早的按保留规则清理
- 发布（deploy）时冻结当前三个版本引用为 DeploymentSnapshot
