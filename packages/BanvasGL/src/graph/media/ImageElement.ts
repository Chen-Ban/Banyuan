import { GRAPHTYPE } from '@/foundation/constants'
import MediaElement from './MediaElement'
import { Style } from '@/foundation/style'
import { Point3 } from '@/foundation/math'
import { IImageElement, ISerializable } from '@/types'
import { generateId } from '@/foundation/utils'

/**
 * ImageElement 类 - 图片元素
 * 继承自 MediaElement，用于在画布中绘制图片
 */
export default class ImageElement extends MediaElement implements IImageElement, ISerializable {
    public type: GRAPHTYPE = GRAPHTYPE.IMAGE

    // 图片相关属性
    public image: HTMLImageElement | null = null

    constructor(
        src: string,
        x: number,
        y: number,
        width: number,
        height: number,
        style: Style = Style.DEFAULT
    ) {
        super(src, x, y, width, height, style)
        this.id = generateId(this.type)
    }

    /**
     * 加载图片
     */
    protected async loadMedia(): Promise<void> {
        return this.loadImage()
    }

    /**
     * 加载图片
     */
    private async loadImage(): Promise<void> {
        return new Promise((resolve, reject) => {
            const img = new Image()
            img.crossOrigin = 'anonymous' // 支持跨域图片

            img.onload = () => {
                this.image = img
                this.width = img.naturalWidth
                this.actualWidth = img.naturalWidth
                this.actualHeight = img.naturalHeight
                this.height = img.naturalHeight
                this.loaded = true
                // 媒体加载完成后，更新控制点和边界框
                this.updateControlPoints()
                this.transfromOrigin = new Point3(
                    this.x + this.width / 2,
                    this.y + this.height / 2,
                    0
                )
                resolve()
            }

            img.onerror = () => {
                console.error(`Failed to load image: ${this.src}`)
                reject(new Error(`Failed to load image: ${this.src}`))
            }

            img.src = this.src
        })
    }

    /**
     * 设置图片源
     */
    setImageSrc(src: string): ImageElement {
        this.src = src
        this.image = null
        this.loaded = false
        // 重置为未加载状态时，更新控制点和边界框
        this.updateControlPoints()
        this.loadMedia()
        return this
    }

    /**
     * 渲染图片
     */
    public render(ctx: CanvasRenderingContext2D): void {
        ctx.save()
        if (!this.image || !this.loaded) {
            // 如果图片未加载，绘制占位符
            this.renderPlaceholder(ctx)
            ctx.restore()
            return
        }

        // 应用样式
        const bounds = this.bounds
        this.style.applyToContext(ctx, bounds.width, bounds.height)

        // 使用设置的尺寸绘制图片，而不是原始尺寸
        ctx.drawImage(this.image, this.x, this.y, this.width, this.height)
        ctx.restore()
    }

    /**
     * 渲染占位符（当图片未加载时）
     */
    protected renderPlaceholder(ctx: CanvasRenderingContext2D): void {
        ctx.save()
        ctx.strokeStyle = '#cccccc'
        ctx.lineWidth = 1
        ctx.strokeRect(this.x, this.y, this.width, this.height)

        // 绘制加载中文字
        ctx.fillStyle = '#999999'
        ctx.font = '12px Arial'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(
            'Loading...',
            this.x + this.width / 2,
            this.y + this.height / 2
        )
        ctx.restore()
    }

    /**
     * 获取图片的像素数据
     */
    getImageData(): ImageData | null {
        if (!this.image || !this.loaded) return null

        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) return null

        canvas.width = this.image.naturalWidth
        canvas.height = this.image.naturalHeight

        ctx.drawImage(
            this.image,
            0,
            0,
            this.image.naturalWidth,
            this.image.naturalHeight
        )

        return ctx.getImageData(0, 0, canvas.width, canvas.height)
    }

    /**
     * 复制图片元素
     */
    public copy(): this {
        const copy = new ImageElement(
            this.src,
            this.x,
            this.y,
            this.width,
            this.height,
            this.style
        )
        return copy as this
    }

    // ── 序列化 ──
    toJSON(): any {
        return {
            id: this.id,
            type: this.type,
            src: this.src,
            x: this.x,
            y: this.y,
            width: this.width,
            height: this.height,
            style: this.style.toJSON(),
        }
    }

    static fromJSON(data: any): ImageElement {
        const el = new ImageElement(
            data.src,
            data.x,
            data.y,
            data.width,
            data.height,
            Style.fromJSON(data.style),
        )
        el.id = data.id
        return el
    }

    static fromCanvas(
        canvas: HTMLCanvasElement,
        x: number,
        y: number,
        width: number,
        height: number,
        style: Style = Style.DEFAULT
    ): Promise<ImageElement> {
        return new Promise((resolve, reject) => {
            const element = new ImageElement('', x, y, width, height, style)
            // 将 canvas 转换为图片
            const img = new Image()
            img.src = canvas.toDataURL()
            img.onload = () => {
                element.image = img
                element.loaded = true
                element
                    .loadMedia()
                    .then(() => {
                        resolve(element)
                    })
                    .catch((error) => reject(error))
            }
        })
    }
}

