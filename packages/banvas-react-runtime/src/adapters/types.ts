/**
 * 平台事件适配器契约
 *
 * EventAdapter 是 banvas-react-runtime 的跨平台适配抽象：
 *   - 每个平台（Web / Electron / 未来 Native）提供一个 EventAdapter 实现
 *   - 适配器负责监听平台原生事件，规范化为 InteractionInput 后回调上层
 *   - 上层（useRuntimeInteraction / 识别器）只消费 InteractionInput，不感知平台
 *
 * 设计原则：
 *   - 适配器持有平台上下文（DOM element / native view 等），由 attach/detach 管理生命周期
 *   - 回调签名统一为 (input: InteractionInput) => void
 *   - 适配器不做手势识别（那是识别器的事），只做「平台原生事件 → 原子事件」的 1:1 翻译
 */

import type { InteractionInput } from "@banyuan/banvasgl";
import type { Point3 } from "@banyuan/banvasgl";

// ════════════════════════════════════════════
//  核心契约
// ════════════════════════════════════════════

/**
 * 坐标转换函数 —— 由上层注入
 *
 * 将客户端坐标（clientX/clientY）映射为世界坐标。
 * 具体实现取决于 Camera 状态和 Canvas/View 位置。
 */
export type CoordinateTransform = (clientX: number, clientY: number) => Point3;

/**
 * 平台事件适配器接口
 *
 * 每个平台实现此接口，将平台原生输入事件翻译为 banvasgl 的 InteractionInput。
 */
export interface EventAdapter {
    /**
     * 附着到平台目标上，开始监听事件
     *
     * @param onInput - 收到规范化后的原子事件时调用此回调
     */
    attach(onInput: (input: InteractionInput) => void): void;

    /**
     * 从平台目标脱离，停止监听事件，释放资源
     */
    detach(): void;

    /**
     * 更新坐标转换函数（Camera 变化时调用）
     */
    setCoordinateTransform(transform: CoordinateTransform): void;
}

// ════════════════════════════════════════════
//  工厂函数签名（各平台导出的创建函数遵循此签名）
// ════════════════════════════════════════════

/**
 * 适配器工厂选项基类 —— 各平台可扩展
 */
export interface EventAdapterOptions {
    /** 坐标转换函数 */
    coordinateTransform: CoordinateTransform;
}
