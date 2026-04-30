import DenseTrajectory from "@/core/graph/trajectory/DenseTrajectory";
import { WorkerHandler, WorkerHandlerResult } from "@/workers/types";
import type { TransferableData } from "@/core/interfaces";

/**
 * 轨迹相关任务（纯 handler）：
 * - 大量采样 getPointAt / getTangentAt / getNormalAt
 * - 计算长度 / 最近点等
 *
 * 传输方式：DenseTrajectory 的 controlPoints (Float32Array) 通过
 * Transferable 零拷贝传输，避免大型轨迹数据的序列化开销。
 */

/**
 * 主线程侧的 Payload 类型（发送前序列化）
 * - trajectory: DenseTrajectory 通过 toTransferable() 提取的元数据
 * - buffers: 通过 WorkerTask.buffers 单独传输
 */
export interface TrajectorySamplePayload {
  trajectory: TransferableData;
  sampleCount: number;
  includeTangent?: boolean;
  includeNormal?: boolean;
}

export interface TrajectorySampleResult {
  points: Array<{ x: number; y: number; z: number }>;
  tangents?: Array<{ x: number; y: number; z: number }>;
  normals?: Array<{ x: number; y: number; z: number }>;
}

export const trajectorySampleHandler: WorkerHandler<
  TrajectorySamplePayload,
  TrajectorySampleResult
> = (payload, buffers): WorkerHandlerResult<TrajectorySampleResult> => {
  const { trajectory: transferData, sampleCount, includeTangent = false, includeNormal = false } = payload;

  // 将 Transferable buffer 注入到 TransferableData 中，重建 DenseTrajectory 实例
  const fullTransferData: TransferableData = {
    ...transferData,
    buffers: buffers ?? [],
  };
  const trajectory = DenseTrajectory.fromTransferable(fullTransferData);

  const clampedCount = Math.max(2, sampleCount);
  const points: Array<{ x: number; y: number; z: number }> = [];
  const tangents: Array<{ x: number; y: number; z: number }> = [];
  const normals: Array<{ x: number; y: number; z: number }> = [];

  for (let i = 0; i < clampedCount; i++) {
    const t = i / (clampedCount - 1);
    const p = trajectory.getPointAt(t);
    points.push({ x: p.x, y: p.y, z: p.z });
    if (includeTangent) {
      const tg = trajectory.getTangentAt(t);
      tangents.push({ x: tg.x, y: tg.y, z: tg.z });
    }
    if (includeNormal) {
      const n = trajectory.getNormalAt(t);
      normals.push({ x: n.x, y: n.y, z: n.z });
    }
  }

  const result: TrajectorySampleResult = { points };
  if (includeTangent) result.tangents = tangents;
  if (includeNormal) result.normals = normals;

  // 归还 controlPoints 的 ArrayBuffer 给主线程
  const returnBuffers = fullTransferData.buffers;

  return { result, buffers: returnBuffers };
};
