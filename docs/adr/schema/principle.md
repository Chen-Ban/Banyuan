# Schema · 原则级决策

> 遇到取舍时怎么选——数据格式设计的权衡标准。

---

## 决策依赖图

```
┌───────────────────────────────────────┐
│  P1 引擎只认当前版本格式              │
└───────────────────┬───────────────────┘
                    │ drives
┌───────────────────▼───────────────────┐
│  P2 Append-only 不可篡改历史          │
└───────────────────────────────────────┘

┌───────────────────────────────────────┐
│  P3 AI Projection 变更是 Breaking     │
│     Change                            │
└───────────────────────────────────────┘
```

关系说明：

- P1→P2：引擎只认当前版本意味着旧版本数据不会被"就地修改为新格式"，而是通过 Migration 生成新版本记录，这天然要求历史版本不可篡改（append-only）。P1 驱动了 P2 的设计方向。
- P3 独立存在：AI Projection 的 breaking change 原则保障的是 AI↔引擎的转换通道稳定性，与版本化存储正交。

---

## 版本格式原则

### P1. 引擎只认当前版本格式

**未实施** · 驱动 M2（数据迁移外置）

BanvasGL 引擎代码中不包含任何"如果是旧格式则..."的兼容分支。引擎假设输入数据永远是当前版本格式，格式升级的责任外置到 Migration 层。

**决策链：** 兼容代码随版本累积会形成不可维护的债务 -> 每个兼容分支都需要测试、都可能引入 bug -> 职责分离：引擎专注当前版本的正确性，Migration 专注旧->新的转换正确性。

**约束：**

- 引擎启动时检测数据 schemaVersion 字段，不匹配则拒绝加载
- 开发阶段的 breaking change 必须同时提交 Migration 函数（CI 强制）
- Migration 函数的输入/输出类型必须显式声明（不能 any -> any）

---

### P2. Append-only 不可篡改历史

**✅ 已实施** · 由 P1 驱动

版本化表（AppContent / CollectionSchemaVersion / CloudFunctionBundle）采用 append-only 写入策略，已创建的版本记录不允许修改或删除（仅允许系统级的过期清理）。

**决策链：** 版本历史是审计和回滚的基础 -> 如果历史可以被修改则无法信任 -> append-only 在数据库层面保证不可篡改 -> 发布快照引用的版本记录永远稳定。

**约束：**

- 业务代码中不提供 update/delete 版本记录的 API
- 清理过期版本由后台定时任务执行，只清理未被任何 DeploymentSnapshot 引用的记录
- 回滚操作是"创建新版本，内容复制自旧版本"，而非"修改当前版本指针"

---

## AI 协作原则

### P3. AI Projection 变更是 Breaking Change

**✅ 已实施** · 驱动 M1（AI Projection 双向转换）

任何对 AI Projection 结构的修改（新增/删除/重命名字段、语义变更）都视为 breaking change，需要同步更新 XiangDi 知识种子和 fromAIProjection 转换器。

**决策链：** AI 依赖 Projection schema 生成合法 JSON -> schema 变了但知识没更新 -> AI 产出不合法 -> fromAIProjection 报错 -> 用户体验断裂 -> 必须原子同步。

**约束：**

- PR 中修改了 projection.types.ts 的 CI 自动标记为 breaking
- 同一 PR 必须包含知识种子更新（或 CI 报 knowledge-guard 失败）
- 向后兼容的新增（新增可选字段）允许暂不更新知识种子，但 fromAIProjection 必须处理缺省情况
