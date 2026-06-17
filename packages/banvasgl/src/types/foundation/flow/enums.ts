export enum NodeCategory {
  Control = "control",
  Action = "action",
  Source = "source",
  Compute = "compute",
  Function = "function",
}

export enum NodeKind {
  Source = "source",
  Math = "math",
  Compare = "compare",
  Logic = "logic",
  Concat = "concat",
  Format = "format",
  Get = "get",
  Condition = "condition",
  Loop = "loop",
  Parallel = "parallel",
  LocalFunction = "localFunction",
  SetVariable = "setVariable",
  Navigate = "navigate",
  CloudFunction = "cloudFunction",
  HttpRequest = "httpRequest",
  DbQuery = "dbQuery",
  DbInsert = "dbInsert",
  DbUpdate = "dbUpdate",
  DbDelete = "dbDelete",
}

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
export enum CompareOp {
  Eq = "eq",
  Neq = "neq",
  Gt = "gt",
  Gte = "gte",
  Lt = "lt",
  Lte = "lte",
  Contains = "contains",
}
export enum LogicOp {
  And = "and",
  Or = "or",
  Not = "not",
}
export enum ParallelMode {
  All = "all",
  AllSettled = "allSettled",
  Race = "race",
  Any = "any",
}
export enum SourceFrom {
  Literal = "literal",
  Context = "context",
}
