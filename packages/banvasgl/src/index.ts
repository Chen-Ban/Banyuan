/**
 * @banyuan/banvasgl — 核心 2D 图形引擎
 *
 * 五层架构：
 *   types      — 接口契约（纯类型，零实现）
 *   foundation — 零依赖原子模块（math / style / constants / utils）
 *   graph      — 图形体系（几何图形数据结构）
 *   view       — 视图体系（图形 + 交互 + 渲染指令）
 *   engine     — 引擎运转（Scene / Camera / Renderer / App / Animation / Operations）
 *
 * 已拆分至独立包：
 *   - useDesignBanvas → @banyuan/banvas-design
 *   - useCanvasInit / useRuntimeBanvas → @banyuan/banvas-runtime
 *   - Workers（WorkerExecutor、WorkerManager）→ @banyuan/banvas-design
 */

export * from "./types";
export * from "./foundation";
export * from "./graph";
export * from "./view";
export * from "./engine";
export { version } from "./version";
