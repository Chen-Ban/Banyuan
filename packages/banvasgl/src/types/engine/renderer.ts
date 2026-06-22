/**
 * Renderer 接口层 —— 零循环依赖
 *
 * Renderer 的公共接口定义。
 * 社区插件通过 interface 访问渲染器，无需 import 具体 class。
 */

import type { IScene } from './scene'
import type { IDrawingContext } from '../platform/drawing.js'
import type { IPlatformCanvas } from '../platform/canvas.js'

// ────────────────────────────────────────────
//  CanvasContext 配置选项
// ────────────────────────────────────────────

/** CanvasContext 配置选项 */
export interface ICanvasContextOptions {
    enableAntialiasing?: boolean
    enableImageSmoothing?: boolean
    backgroundColor?: string
    clearColor?: string
}

// ────────────────────────────────────────────
//  Renderer 接口
// ────────────────────────────────────────────

/** Renderer 配置选项 */
export interface IRendererOptions extends ICanvasContextOptions {
    /**
     * 是否显示网格
     *
     * @defaultValue false
     * @remarks 渲染器尚未实现，传入后暂时无视觉效果，待后续 Renderer 层实现。
     */
    showGrid?: boolean
    /**
     * 是否显示标尺
     *
     * @defaultValue false
     * @remarks 渲染器尚未实现，传入后暂时无视觉效果，待后续 Renderer 层实现。
     */
    showRuler?: boolean
}

/** Renderer 的公共契约 */
export interface IRenderer {
    render(scene: IScene): void
    clear(): void
    resize(width: number, height: number): void
    getSize(): { width: number; height: number }
    getFPS(): number
    setOptions(options: Partial<IRendererOptions>): void
    setDPR(dpr: number): void
    getDPR(): number
    getOptions(): IRendererOptions
    setAntialiasingEnabled(enabled: boolean): void
    setBackgroundColor(color: string): void
    setClearColor(color: string): void
    getContext(): IDrawingContext
    getBufferContext(): IDrawingContext | null
    /** 获取平台画布接口（用于导出等平台特定操作，可能为 null） */
    getPlatformCanvas(): IPlatformCanvas | null
    destroy(): void
    isCurrentlyRendering(): boolean
    getStats(): {
        fps: number
        isRendering: boolean
        canvasSize: { width: number; height: number }
        hasOffscreen: boolean
    }
}
