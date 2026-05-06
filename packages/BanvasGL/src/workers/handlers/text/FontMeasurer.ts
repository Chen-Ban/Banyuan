/**
 * FontMeasurer - Worker 端文字测量器
 *
 * 使用 OffscreenCanvas 的 2D context 进行 measureText，
 * 在 Worker 环境中提供与主线程一致的文字宽度测量能力。
 *
 * 设计要点：
 * - 单例模式，复用同一个 OffscreenCanvas
 * - 内部缓存 fontString → char → width，避免重复测量
 * - 支持批量测量以减少 font 切换次数
 */

export interface CharMeasurement {
    char: string
    width: number
    height: number
}

export interface BatchMeasureRequest {
    /** 字体字符串，如 "normal normal 16px Arial" */
    fontString: string
    /** 需要测量的字符列表 */
    chars: string[]
    /** 字体大小（用于确定 height） */
    fontSize: number
}

export interface BatchMeasureResult {
    fontString: string
    measurements: CharMeasurement[]
}

export default class FontMeasurer {
    private static instance: FontMeasurer | null = null

    private canvas: OffscreenCanvas
    private ctx: OffscreenCanvasRenderingContext2D

    /**
     * 测量缓存：fontString → char → width
     * 由于同一字体下同一字符的宽度是确定的，缓存可以大幅减少 measureText 调用
     */
    private cache: Map<string, Map<string, number>> = new Map()

    private constructor() {
        // 创建一个最小尺寸的 OffscreenCanvas，仅用于 measureText
        this.canvas = new OffscreenCanvas(1, 1)
        const ctx = this.canvas.getContext('2d')
        if (!ctx) {
            throw new Error('FontMeasurer: 无法在 Worker 中创建 OffscreenCanvas 2D context')
        }
        this.ctx = ctx
    }

    static getInstance(): FontMeasurer {
        if (!FontMeasurer.instance) {
            FontMeasurer.instance = new FontMeasurer()
        }
        return FontMeasurer.instance
    }

    /**
     * 测量单个字符的宽度
     */
    measureChar(char: string, fontString: string, fontSize: number): CharMeasurement {
        // 查缓存
        let fontCache = this.cache.get(fontString)
        if (fontCache) {
            const cachedWidth = fontCache.get(char)
            if (cachedWidth !== undefined) {
                return { char, width: cachedWidth, height: fontSize }
            }
        }

        // 设置字体并测量
        this.ctx.font = fontString
        const metrics = this.ctx.measureText(char)
        const width = metrics.width

        // 写入缓存
        if (!fontCache) {
            fontCache = new Map()
            this.cache.set(fontString, fontCache)
        }
        fontCache.set(char, width)

        return { char, width, height: fontSize }
    }

    /**
     * 批量测量字符
     * 按 fontString 分组，减少 ctx.font 赋值次数
     */
    measureBatch(requests: BatchMeasureRequest[]): BatchMeasureResult[] {
        const results: BatchMeasureResult[] = []

        for (const request of requests) {
            const { fontString, chars, fontSize } = request
            const measurements: CharMeasurement[] = []

            // 检查是否需要切换字体（优化：只在字体变化时赋值）
            if (this.ctx.font !== fontString) {
                this.ctx.font = fontString
            }

            let fontCache = this.cache.get(fontString)
            if (!fontCache) {
                fontCache = new Map()
                this.cache.set(fontString, fontCache)
            }

            for (const char of chars) {
                const cachedWidth = fontCache.get(char)
                if (cachedWidth !== undefined) {
                    measurements.push({ char, width: cachedWidth, height: fontSize })
                } else {
                    const metrics = this.ctx.measureText(char)
                    const width = metrics.width
                    fontCache.set(char, width)
                    measurements.push({ char, width, height: fontSize })
                }
            }

            results.push({ fontString, measurements })
        }

        return results
    }

    /**
     * 清除缓存（当字体资源变化时调用）
     */
    clearCache(): void {
        this.cache.clear()
    }

    /**
     * 清除指定字体的缓存
     */
    clearFontCache(fontString: string): void {
        this.cache.delete(fontString)
    }

    /**
     * 获取缓存统计信息（调试用）
     */
    getCacheStats(): { fontCount: number; totalChars: number } {
        let totalChars = 0
        for (const fontCache of this.cache.values()) {
            totalChars += fontCache.size
        }
        return { fontCount: this.cache.size, totalChars }
    }
}
