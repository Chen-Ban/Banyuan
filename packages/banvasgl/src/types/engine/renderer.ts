/**
 * Renderer 接口层 —— 零循环依赖
 *
 * Renderer 和 CanvasContext 的公共接口定义。
 * 社区插件通过 interface 访问渲染器，无需 import 具体 class。
 */

import type { IScene } from './scene'

// ────────────────────────────────────────────
//  CanvasContext 接口
// ────────────────────────────────────────────

/** CanvasContext 配置选项 */
export interface ICanvasContextOptions {
    enableAntialiasing?: boolean
    enableImageSmoothing?: boolean
    backgroundColor?: string
    clearColor?: string
}

/** CanvasContext 的公共契约 */
export interface ICanvasContext {
    readonly mainCtx: CanvasRenderingContext2D
    bufferCtx: CanvasRenderingContext2D

    save(): void
    restore(): void
    setTransform(transform: number[]): void
    transform(transform: number[]): void
    clear(): void
    resize(width: number, height: number): void
    getSize(): { width: number; height: number }
    getMainCanvas(): HTMLCanvasElement
    getBufferCanvas(): OffscreenCanvas
    getMainContext(): CanvasRenderingContext2D
    getBufferContext(): CanvasRenderingContext2D
    setOptions(options: Partial<ICanvasContextOptions>): void
    getOptions(): ICanvasContextOptions
    setAntialiasingEnabled(enabled: boolean): void
    setBackgroundColor(color: string): void
    setClearColor(color: string): void
    toDataURL(type?: string, quality?: number): string
    toBlob(callback: (blob: Blob | null) => void, type?: string, quality?: number): void
}

// ────────────────────────────────────────────
//  Renderer 接口
// ────────────────────────────────────────────

/** Renderer 配置选项 */
export interface IRendererOptions extends ICanvasContextOptions {
    dpr?: number
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
    getCanvas(): HTMLCanvasElement
    getBufferCanvas(): HTMLCanvasElement | OffscreenCanvas | null
    getContext(): CanvasRenderingContext2D
    getBufferContext(): CanvasRenderingContext2D | null
    toDataURL(type?: string, quality?: number): string
    toBlob(callback: (blob: Blob | null) => void, type?: string, quality?: number): void
    destroy(): void
    isCurrentlyRendering(): boolean
    getStats(): {
        fps: number
        isRendering: boolean
        canvasSize: { width: number; height: number }
        hasOffscreen: boolean
    }
}
