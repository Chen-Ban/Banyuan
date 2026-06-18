# BanvasGL Flow 模块审计报告

> 审计日期: 2025-06-18  
> 审计范围: `packages/banvasgl/src/types/foundation/flow/` + `packages/banvasgl/src/foundation/flow/`  
> 审计方法: 静态代码审查 + 142 个自动化测试用例验证  
> 状态: **所有发现已修复** ✅

---

## §1 概述

BanvasGL Flow 是 `@banyuan/banvasgl` 内部的声明式流程控制子模块，基于节点图（nodes + edges）驱动。核心组件包括 24 种节点类型、22 种 slot 类型、20 个 executor 实现、FrameStack 帧栈和 FlowRunner 执行引擎。前后端通过 `client` / `server` 两个预组装 preset 工厂分别注册不同的 executor 子集（各 19 个）。

---

## §2 类型系统审计

### 2.1 枚举定义 — ✅ 完整

| 枚举 | 值数量 | 值 | 状态 |
|------|--------|-----|------|
| `NodeCategory` | 5 | `control`, `action`, `source`, `compute`, `function` | ✅ |
| `NodeKind` | 24 | 全部正确映射到对应 category | ✅ |
| `MathOp` | 8 | `add`, `sub`, `mul`, `div`, `mod`, `pow`, `min`, `max` | ✅ |
| `CompareOp` | 7 | `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains` | ✅ |
| `LogicOp` | 3 | `and`, `or`, `not` | ✅ |
| `ParallelMode` | 4 | `all`, `allSettled`, `race`, `any` | ✅ |

所有 NodeKind 值均为 camelCase 字符串，无重复，首字母小写。

### 2.2 Slot 类型 — ✅ 完整

22 种 slot 类型覆盖所有节点，每个 slot 继承 `SlotBase`（`input: Record<string, SlotValue>` + `output: readonly string[]`）。

### 2.3 Node 类型 — ✅ 完整

5 个 category union → `FlowNode` 顶层联合类型，共 24 个具体 node interface。

### 2.4 DataRef / SlotValue — ✅ 正确

`isDataRef()` 类型守卫正确判断 `{ nodeId, field }`。

### 2.5 FlowSchema — ✅ 正确

`FLOW_SCHEMA_VERSION = "2.0.0"`，FlowSchema 包含 `version` / `entry` / `nodes`。

---

## §3 实现审计

### 3.1 Executor 执行器 — ✅ 全部通过

20 个 executor 单元测试 100% 通过，覆盖正常路径、边界条件和错误路径。

### 3.2 FrameStack 帧栈 — ✅ 正确

- enter/leave push/pop 行为正确
- **enter 入参做浅拷贝**（`{ ...inputs }`），符合 `Readonly` 语义
- steps 继承与合并正确
- local 变量每帧独立隔离
- returnRef 每帧独立初始化
- outputCache set/get + leave 后随帧销毁正确

### 3.3 FlowRunner 执行引擎 — ✅ 正确

验证通过的核心场景：
- 单节点执行、线性链执行、DataRef 解析
- 条件分支、循环、并行、函数调用
- **onError 子图错误恢复**（stepNode 已增加 try-catch）
- MAX_STEPS 保护、Client/Server Preset 隔离

---

## §4 已修复的问题

### ✅ F1 — onError 机制（已修复）

**文件**: `packages/banvasgl/src/foundation/flow/FlowRunner/FlowRunner.ts:217-224`  
**严重程度**: 曾为 🔴 高

**修复内容**:  
`stepNode()` 的 `dispatch()` 调用增加 try-catch 包裹，将 executor 抛出的异常转换为 `NodeEvalResult.error`：

```typescript
// 修复前
const result = await this.dispatch(node, s);

// 修复后
let result: NodeEvalResult;
try {
  result = await this.dispatch(node, s);
} catch (err) {
  result = {
    error: err instanceof Error ? err : new Error(String(err)),
    nextNodeId: null,
  };
}
```

**验证**:  
`FlowRunner — 错误处理 > onError 子图捕获 executor 异常并执行恢复流程` 测试通过，确认 Action slot 的 `onError` 子图在 executor 抛出异常时正确触发。

### ✅ F2 — FrameStack enter 入参快照（已修复）

**文件**: `packages/banvasgl/src/foundation/flow/context/FrameStack.ts:92`  
**严重程度**: 曾为 🟡 低

**修复内容**:  
`enter()` 中从 `in: inputs` 改为 `in: { ...inputs }`，对入参做浅拷贝：

```typescript
// 修复前
in: inputs,

// 修复后
in: { ...inputs },
```

**验证**:  
`FrameStack — enter / leave 基本操作 > enter 入参存储为快照（浅拷贝）` 测试通过，确认修改原始对象不影响帧栈。

---

## §5 设计审查

| 维度 | 评价 |
|------|------|
| 类型完整性 | ✅ 24 NodeKind / 22 Slot / 5 Category 全部齐备 |
| Executor 正确性 | ✅ 20 个 executor 单元测试 100% 通过 |
| FrameStack 行为 | ✅ enter/leave/steps/local/returnRef/cache 全部正确 |
| FlowRunner 集成 | ✅ 核心流程、错误恢复、边界条件全部正确 |
| onError 机制 | ✅ 已修复并验证通过 |
| FrameStack 快照 | ✅ 已修复并验证通过 |
| 架构分层 | ✅ 类型/执行器/运行时/预组装四层清晰 |
| 类型安全 | ✅ discriminated union 穷举 + ExecutorRegistry key-wise 推导 |

---

## §6 总结

Flow 模块类型定义严谨、executor 实现覆盖完整、核心执行流程正确。本次审计发现的 onError 机制失效和 FrameStack 引用存储两个问题均已修复，所有 142 个测试用例全部通过。
