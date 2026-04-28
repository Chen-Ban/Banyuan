import Serializer from "@/core/serializer";
import { Point3 } from "@/core/math";
import { WorkerHandler, WorkerHandlerResult } from "@/workers/types";

/**
 * 解析几何相交相关任务（纯 handler）：
 * - 曲线/直线/圆弧/圆等之间的相交点计算
 * - 批量相交检测
 *
 * 传输方式：AnalyticGraph 通过 Serializer 序列化为 JSON 纯对象传输，
 * Worker 端反序列化重建实例后执行计算。
 */

export interface GraphIntersectionPairPayload {
  a: string; // Serializer.serialize(graph) 后的 JSON 字符串
  b: string;
}

export interface GraphIntersectionPairResult {
  points: Array<{ x: number; y: number; z: number }>;
}

export interface GraphIntersectionBatchPayload {
  shapes: string[]; // 每个元素是 Serializer.serialize(graph) 后的 JSON 字符串
}

export interface GraphIntersectionBatchResult {
  /**
   * key 形如 "i-j"，与 IntersectionUtils.intersectAll 返回结构一致
   */
  intersections: Record<string, Array<{ x: number; y: number; z: number }>>;
}

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
> = (payload): WorkerHandlerResult<GraphIntersectionUnifiedResult> => {
  const serializer = Serializer.getInstance();

  if (payload.mode === "pair" && payload.pair) {
    const a = serializer.deserialize(payload.pair.a);
    const b = serializer.deserialize(payload.pair.b);
    const rawPoints: Point3[] = a.intersect(b);
    const points = rawPoints.map((p: Point3) => ({ x: p.x, y: p.y, z: p.z }));
    return { result: { mode: "pair", points } };
  }

  if (payload.mode === "batch" && payload.batch) {
    const shapes = payload.batch.shapes.map((s: string) => serializer.deserialize(s));
    const intersections: Record<string, Array<{ x: number; y: number; z: number }>> = {};

    for (let i = 0; i < shapes.length; i++) {
      for (let j = i + 1; j < shapes.length; j++) {
        const rawPoints: Point3[] = shapes[i].intersect(shapes[j]);
        if (rawPoints.length > 0) {
          intersections[`${i}-${j}`] = rawPoints.map((p: Point3) => ({
            x: p.x,
            y: p.y,
            z: p.z,
          }));
        }
      }
    }
    return { result: { mode: "batch", intersections } };
  }

  throw new Error("Invalid GraphIntersectionUnifiedPayload");
};
