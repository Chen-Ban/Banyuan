import { CompareOp } from "@/types/foundation/flow/enums.js";

/**
 * 纯函数：比较两个值。
 * 不含任何运行时依赖（不访问 ctx / stack / executor）。
 */
export function compareEval(left: unknown, op: CompareOp, right: unknown): boolean {
  switch (op) {
    case CompareOp.Eq:
      return (left as any) == (right as any);
    case CompareOp.Neq:
      return (left as any) != (right as any);
    case CompareOp.Gt:
      return (left as any) > (right as any);
    case CompareOp.Gte:
      return (left as any) >= (right as any);
    case CompareOp.Lt:
      return (left as any) < (right as any);
    case CompareOp.Lte:
      return (left as any) <= (right as any);
    case CompareOp.Contains:
      return String(left).includes(String(right));
    default:
      return false;
  }
}
