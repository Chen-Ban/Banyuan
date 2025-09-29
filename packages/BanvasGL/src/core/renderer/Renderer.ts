import Scene from '../scene/Scene'
import CanvasContext, { CanvasContextOptions } from './CanvasContext'

export interface RendererOptions extends CanvasContextOptions {
    // 渲染器选项可以在这里添加
}

export default class Renderer {
    // 画布上下文管理器
    public canvasContext: CanvasContext
    
    // 渲染状态
    private isRendering: boolean = false
    private lastRenderTime: number = 0
    private frameCount: number = 0
    private fps: number = 0

    constructor(canvas: HTMLCanvasElement, options: RendererOptions = {}) {
        this.canvasContext = new CanvasContext(canvas, options)
    }

    // 渲染场景
    public render(scene: Scene): void {
        if (this.isRendering) {
            return
        }

        this.isRendering = true

        try {
            // 清空画布并渲染场景
                this.canvasContext.clear()
                scene.render(this.canvasContext)

            // 更新FPS
            this.updateFPS()

        } catch (error) {
            console.error('Renderer error:', error)
        } finally {
            this.isRendering = false
        }
    }

    // 清空画布
    public clear(): void {
        this.canvasContext.clear()
    }

    // 更新FPS
    private updateFPS(): void {
        this.frameCount++
        const currentTime = performance.now()
        
        if (currentTime - this.lastRenderTime >= 1000) {
            this.fps = Math.round((this.frameCount * 1000) / (currentTime - this.lastRenderTime))
            this.frameCount = 0
            this.lastRenderTime = currentTime
        }
    }

    // 调整画布大小
    public resize(width: number, height: number): void {
        this.canvasContext.resize(width, height)
    }

    // 获取画布尺寸
    public getSize(): { width: number, height: number } {
        return this.canvasContext.getSize()
    }

    // 获取FPS
    public getFPS(): number {
        return this.fps
    }

    // 设置渲染选项
    public setOptions(options: Partial<RendererOptions>): void {
        this.canvasContext.setOptions(options)
    }

    // 获取渲染选项
    public getOptions(): RendererOptions {
        return this.canvasContext.getOptions()
    }

    // 启用/禁用离屏渲染
    public setOffscreenEnabled(enabled: boolean): void {
        this.canvasContext.setOffscreenEnabled(enabled)
    }

    // 启用/禁用抗锯齿
    public setAntialiasingEnabled(enabled: boolean): void {
        this.canvasContext.setAntialiasingEnabled(enabled)
    }

    // 设置背景色
    public setBackgroundColor(color: string): void {
        this.canvasContext.setBackgroundColor(color)
    }

    // 设置清除色
    public setClearColor(color: string): void {
        this.canvasContext.setClearColor(color)
    }

    // 获取画布元素
    public getCanvas(): HTMLCanvasElement {
        return this.canvasContext.getMainCanvas()
    }

    // 获取离屏画布元素
    public getBufferCanvas(): HTMLCanvasElement | null {
        return this.canvasContext.getBufferCanvas()
    }

    // 获取主画布上下文
    public getContext(): CanvasRenderingContext2D {
        return this.canvasContext.getMainContext()
    }

    // 获取离屏画布上下文
    public getBufferContext(): CanvasRenderingContext2D | null {
        return this.canvasContext.getBufferContext()
    }

    // 导出画布为图像
    public toDataURL(type?: string, quality?: number): string {
        return this.canvasContext.toDataURL(type, quality)
    }

    // 导出画布为Blob
    public toBlob(callback: (blob: Blob | null) => void, type?: string, quality?: number): void {
        this.canvasContext.toBlob(callback, type, quality)
    }

    // 销毁渲染器
    public destroy(): void {
        // 清理资源
        this.canvasContext.destroy()
        this.isRendering = false
    }

    // 检查是否正在渲染
    public isCurrentlyRendering(): boolean {
        return this.isRendering
    }

    // 获取渲染统计信息
    public getStats(): {
        fps: number
        isRendering: boolean
        canvasSize: { width: number, height: number }
        hasOffscreen: boolean
    } {
        return {
            fps: this.fps,
            isRendering: this.isRendering,
            canvasSize: this.getSize(),
            hasOffscreen: this.canvasContext.getBufferContext() !== null
        }
    }
}