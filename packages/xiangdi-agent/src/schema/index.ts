// AI Projection（ADR-027 统一序列化）
export * from "./projection.js";
export type * from "./projection.types.js";

// Patch Projection（ADR-041 Patch 语义写入）
export { patchProjection, patchProjectionViaAdapter } from "./patchProjection.js";
export type { PatchProjectionInput, PatchProjectionResult } from "./patchProjection.js";
