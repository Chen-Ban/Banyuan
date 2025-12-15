import DenseTrajectory from "@/core/graph/trajectory/DenseTrajectory";
import { Point3, Vector3 } from "@/core/math";
import { WorkerHandler } from "../types";

/**
 * 轨迹相关任务（纯 handler）：
 * - 大量采样 getPointAt / getTangentAt / getNormalAt
 * - 计算长度 / 最近点等
 */

export interface TrajectorySamplePayload {
  trajectory: DenseTrajectory;
  sampleCount: number;
  includeTangent?: boolean;
  includeNormal?: boolean;
}

export interface TrajectorySampleResult {
  points: Point3[];
  tangents?: Vector3[];
  normals?: Vector3[];
}

export const trajectorySampleHandler: WorkerHandler<TrajectorySamplePayload, TrajectorySampleResult> = (payload) => {
  const { trajectory, sampleCount, includeTangent = false, includeNormal = false } = payload;

  const clampedCount = Math.max(2, sampleCount);
  const points: Point3[] = [];
  const tangents: Vector3[] = [];
  const normals: Vector3[] = [];

  for (let i = 0; i < clampedCount; i++) {
    const t = i / (clampedCount - 1);
    points.push(trajectory.getPointAt(t));
    if (includeTangent) {
      tangents.push(trajectory.getTangentAt(t));
    }
    if (includeNormal) {
      normals.push(trajectory.getNormalAt(t));
    }
  }

  const result: TrajectorySampleResult = { points };
  if (includeTangent) {
    result.tangents = tangents;
  }
  if (includeNormal) {
    result.normals = normals;
  }
  return result;
};
