/**
 * @banyuan/canvas — 核心 2D 图形引擎
 *
 * 导出：
 *   - core（App、Scene、Camera、Renderer、Graph、View、Animation 等完整引擎能力）
 *   - version 信息
 *
 * 已拆分至独立包：
 *   - useDesignBanvas → @banyuan/canvas-design
 *   - useCanvasInit / useRuntimeBanvas → @banyuan/canvas-runtime
 *   - Workers（WorkerExecutor、WorkerManager）→ @banyuan/canvas-design
 */

export * from "./core";
export { version } from "./version";
