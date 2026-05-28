/**
 * @banyuan/banvasgl — 核心 2D 图形引擎
 *
 * 六层架构：
 *   types      — 接口契约（纯类型，零实现）
 *   foundation — 零依赖原子模块（math / style / constants / utils）
 *   graph      — 图形体系（几何图形数据结构）
 *   view       — 视图体系（图形 + 交互 + 渲染指令）
 *   engine     — 引擎运转（Scene / Camera / Renderer / App / Animation / Operations）
 *   actions    — 操作 API（view/page/app/history 命名空间 + 内置策略）
 *   data       — 预设数据（内置物料、页面树构建、右键菜单）
 */

export * from "./types";
export * from "./foundation";
export * from "./graph";
export * from "./view";
export * from "./engine";
export * from "./actions";
export * from "./data";
export { version } from "./version";
