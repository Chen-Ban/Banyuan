import AnalyticGraph from "@/core/graph/analytic/AnalyticGraph";
import { intersect, intersectAll } from "@/core/graph/analytic/IntersectionUtils";
import { Point3 } from "@/core/math";
import { WorkerHandler } from "../types";

/**
 * 解析几何相交相关任务（纯 handler）：
 * - 曲线/直线/圆弧/圆等之间的相交点计算
 * - 批量相交检测（intersectAll）
 */

export interface GraphIntersectionPairPayload {
  a: AnalyticGraph;
  b: AnalyticGraph;
}

export interface GraphIntersectionPairResult {
  points: Point3[];
}

export interface GraphIntersectionBatchPayload {
  shapes: AnalyticGraph[];
}

export interface GraphIntersectionBatchResult {
  /**
   * key 形如 "i-j"，与 IntersectionUtils.intersectAll 返回结构一致
   */
  intersections: Map<string, Point3[]>;
}

// 内部使用的纯函数 handler
const graphIntersectionPairHandler = (payload: GraphIntersectionPairPayload): GraphIntersectionPairResult => {
  const { a, b } = payload;
  const points = intersect(a, b);
  return { points };
};

const graphIntersectionBatchHandler = (payload: GraphIntersectionBatchPayload): GraphIntersectionBatchResult => {
  const { shapes } = payload;
  const intersections = intersectAll(shapes);
  return { intersections };
};

export type GraphIntersectionMode = "pair" | "batch";

export interface GraphIntersectionUnifiedPayload {
  mode: GraphIntersectionMode;
  pair?: GraphIntersectionPairPayload;
  batch?: GraphIntersectionBatchPayload;
}

export type GraphIntersectionUnifiedResult =
  | ({ mode: "pair" } & GraphIntersectionPairResult)
  | ({ mode: "batch" } & GraphIntersectionBatchResult);

export const graphIntersectionUnifiedHandler: WorkerHandler<
  GraphIntersectionUnifiedPayload,
  GraphIntersectionUnifiedResult
> = (payload) => {
  if (payload.mode === "pair" && payload.pair) {
    const res = graphIntersectionPairHandler(payload.pair);
    return { mode: "pair", ...res };
  }

  if (payload.mode === "batch" && payload.batch) {
    const res = graphIntersectionBatchHandler(payload.batch);
    return { mode: "batch", ...res };
  }

  throw new Error("Invalid GraphIntersectionUnifiedPayload");
};
