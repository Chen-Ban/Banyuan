/**
 * 节点分类 —— 五类节点，按调度行为和有无副作用划分。
 *
 * - **Control**：控制流节点（Condition / Loop / Parallel / Return），决定执行路径，不产出数据
 * - **Action**：副作用节点（SetVariable / SetViewData / HttpRequest / DbQuery 等），通过 cap 代理产生外部效应
 * - **Source**：叶子数据源（Literal / Context），被 Pull 惰性求值，无控制流
 * - **Compute**：纯计算/变换节点（Math / Compare / Logic 等），纯函数，不可见外部状态
 * - **Function**：内联函数调用节点，创建新作用域执行子图
 */
export enum NodeCategory {
  Control = "control",
  Action = "action",
  Source = "source",
  Compute = "compute",
  Function = "function",
}

/**
 * 节点具体类型 —— 25 种节点，每个节点有唯一 kind。
 *
 * | category | kind | 说明 |
 * |----------|------|------|
 * | source | literal | 内联字面量值 |
 * | source | context | 从帧栈按路径取上下文变量 |
 * | compute | math | 数学运算（加减乘除、取模、幂、最值） |
 * | compute | compare | 比较运算（相等、大于、包含等） |
 * | compute | logic | 逻辑运算（与、或、非） |
 * | compute | concat | 字符串拼接 |
 * | compute | format | 模板字符串格式化 |
 * | compute | get | 从对象按路径取嵌套字段 |
 * | control | condition | 条件分支（多 slot，逐求 filter） |
 * | control | loop | while 循环 |
 * | control | parallel | 并行分支 |
 * | control | return | 返回（终止子图执行） |
 * | function | function | 内联函数调用 |
 * | action | setVariable | 写帧内变量 |
 * | action | setViewData | 写 View 数据（前端） |
 * | action | setViewVisible | 控制 View 可见性（前端） |
 * | action | playAnimation | 触发动画（前端） |
 * | action | navigate | 页面跳转（前端，必须是终点） |
 * | action | cloudFunction | 调用云函数（前端→后端） |
 * | action | httpRequest | HTTP 请求（后端） |
 * | action | dbQuery | 数据库查询（后端） |
 * | action | dbInsert | 数据库插入（后端） |
 * | action | dbUpdate | 数据库更新（后端） |
 * | action | dbDelete | 数据库删除（后端） |
 */
export enum NodeKind {
  Literal = "literal",
  Context = "context",
  Math = "math",
  Compare = "compare",
  Logic = "logic",
  Concat = "concat",
  Format = "format",
  Get = "get",
  Condition = "condition",
  Loop = "loop",
  Parallel = "parallel",
  Return = "return",
  Function = "function",
  SetVariable = "setVariable",
  SetViewData = "setViewData",
  SetViewVisible = "setViewVisible",
  PlayAnimation = "playAnimation",
  Navigate = "navigate",
  CloudFunction = "cloudFunction",
  HttpRequest = "httpRequest",
  DbQuery = "dbQuery",
  DbInsert = "dbInsert",
  DbUpdate = "dbUpdate",
  DbDelete = "dbDelete",
}

/** 数学运算符 */
export enum MathOp {
  Add = "add",
  Sub = "sub",
  Mul = "mul",
  Div = "div",
  Mod = "mod",
  Pow = "pow",
  Min = "min",
  Max = "max",
}

/** 比较运算符 */
export enum CompareOp {
  Eq = "eq",
  Neq = "neq",
  Gt = "gt",
  Gte = "gte",
  Lt = "lt",
  Lte = "lte",
  Contains = "contains",
}

/** 逻辑运算符 */
export enum LogicOp {
  And = "and",
  Or = "or",
  Not = "not",
}

/** 并行收敛模式 */
export enum ParallelMode {
  /** 全部成功（任一失败则抛错） */
  All = "all",
  /** 全部完成（不抛错） */
  AllSettled = "allSettled",
  /** 首个完成的结果（其余继续但不被消费） */
  Race = "race",
  /** 首个成功的结果（全部失败抛 AggregateError） */
  Any = "any",
}
