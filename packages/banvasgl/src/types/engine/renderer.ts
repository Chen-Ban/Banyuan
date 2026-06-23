/**
 * Renderer 接口层 —— 零循环依赖
 *
 * Renderer 的公共接口定义。
 * 社区插件通过 interface 访问渲染器，无需 import 具体 class。
 */

import type { IScene } from './scene'
import type { IDrawingSurface } from '../platform/surface.js'

/** Renderer 的公共契约 */
export interface IRenderer {
    render(scene: IScene): void
    clear(): void
    resize(width: number, height: number): void
    getSize(): { width: number; height: number }
    getFPS(): number
    setDPR(dpr: number): void
    getDPR(): number
    /** 获取画布表面（供导出等平台特定操作） */
    getSurface(): IDrawingSurface
    destroy(): void
    isCurrentlyRendering(): boolean
    getStats(): {
        fps: number
        isRendering: boolean
        canvasSize: { width: number; height: number }
        hasOffscreen: boolean
    }
}
