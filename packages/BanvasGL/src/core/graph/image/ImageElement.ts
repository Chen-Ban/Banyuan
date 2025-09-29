import { GRAPHTYPE } from "@/constants"
import Graph, { GraphOptions } from "../base/Graph"
import { Point3 } from "@/core/math"
import { Style } from "@/core/style"
import Bounds from "../base/Bounds"

/**
 * ImageElement 类 - 图片元素
 * 继承自 Graph，用于在画布中绘制图片
 */
export default class ImageElement extends Graph {
    public type: GRAPHTYPE = GRAPHTYPE.IMAGE
    public controlPoints: Point3[]
    public style: Style
    
    // 图片相关属性
    public image: HTMLImageElement | null = null
    public imageSrc: string = ""
    public x: number
    public y: number
    public sourceWidth?: number  // 源图片宽度（用于裁剪）
    public sourceHeight?: number // 源图片高度（用于裁剪）
    public sourceX: number = 0   // 源图片裁剪起始X坐标
    public sourceY: number = 0   // 源图片裁剪起始Y坐标
    public opacity: number = 1   // 透明度
    public loaded: boolean = false

    constructor(
        x: number,
        y: number,
        imageSrc: string,
        style: Style = Style.DEFAULT,
        options?: GraphOptions
    ) {
        super(options)
        this.x = x
        this.y = y
        this.imageSrc = imageSrc
        this.style = style
        
        // 初始化控制点（裁剪区域的八个点）
        this.controlPoints = this.calculateCropControlPoints()
        
        // 在构造函数中立即计算边界框，确保View能获取到正确的初始尺寸
        this.setBounds(this.calculateBounds())
        
        // 异步加载图片
        this.loadImage()
    }

    /**
     * 计算图片元素的包围盒
     */
    protected calculateBounds(): Bounds {
        if (!this.image || !this.loaded) {
            return new Bounds(this.x, this.y, 0, 0)
        }
        
        return new Bounds(
            this.x,
            this.y,
            this.image.naturalWidth,
            this.image.naturalHeight
        )
    }

    /**
     * 加载图片
     */
    private async loadImage(): Promise<void> {
        return new Promise((resolve, reject) => {
            const img = new Image()
            img.crossOrigin = "anonymous" // 支持跨域图片
            
            img.onload = () => {
                this.image = img
                this.loaded = true
                resolve()
            }
            
            img.onerror = () => {
                console.error(`Failed to load image: ${this.imageSrc}`)
                reject(new Error(`Failed to load image: ${this.imageSrc}`))
            }
            
            img.src = this.imageSrc
        })
    }

    /**
     * 设置图片源
     */
    setImageSrc(src: string): ImageElement {
        this.imageSrc = src
        this.loaded = false
        this.loadImage()
        return this
    }

    /**
     * 设置位置
     */
    setPosition(x: number, y: number): ImageElement {
        this.x = x
        this.y = y
        this.updateControlPoints()
        return this
    }


    /**
     * 设置透明度
     */
    setOpacity(opacity: number): ImageElement {
        this.opacity = Math.max(0, Math.min(1, opacity))
        return this
    }

    /**
     * 设置裁剪区域
     */
    setCrop(sourceX: number, sourceY: number, sourceWidth: number, sourceHeight: number): ImageElement {
        this.sourceX = sourceX
        this.sourceY = sourceY
        this.sourceWidth = sourceWidth
        this.sourceHeight = sourceHeight
        this.updateControlPoints()
        this.invalidateBounds()
        return this
    }

    /**
     * 计算裁剪区域的控制点（八个点）
     */
    private calculateCropControlPoints(): Point3[] {
        if (!this.image || !this.loaded) {
            // 如果图片未加载，返回默认控制点
            return [new Point3(this.x, this.y, 0)]
        }
        
        // 使用裁剪区域或整个图片区域
        const cropX = this.sourceX
        const cropY = this.sourceY
        const cropWidth = this.sourceWidth || this.image.naturalWidth
        const cropHeight = this.sourceHeight || this.image.naturalHeight
        
        // 计算裁剪区域在画布上的实际位置和尺寸
        const scaleX = (this.sourceWidth || this.image.naturalWidth) / this.image.naturalWidth
        const scaleY = (this.sourceHeight || this.image.naturalHeight) / this.image.naturalHeight
        
        const actualX = this.x + (cropX / this.image.naturalWidth) * this.image.naturalWidth * scaleX
        const actualY = this.y + (cropY / this.image.naturalHeight) * this.image.naturalHeight * scaleY
        const actualWidth = cropWidth * scaleX
        const actualHeight = cropHeight * scaleY
        
        // 返回裁剪区域的八个控制点
        return [
            new Point3(actualX, actualY, 0),                           // 左上角
            new Point3(actualX + actualWidth / 2, actualY, 0),         // 上中
            new Point3(actualX + actualWidth, actualY, 0),             // 右上角
            new Point3(actualX + actualWidth, actualY + actualHeight / 2, 0), // 右中
            new Point3(actualX + actualWidth, actualY + actualHeight, 0),     // 右下角
            new Point3(actualX + actualWidth / 2, actualY + actualHeight, 0), // 下中
            new Point3(actualX, actualY + actualHeight, 0),            // 左下角
            new Point3(actualX, actualY + actualHeight / 2, 0)         // 左中
        ]
    }

    /**
     * 更新控制点
     */
    private updateControlPoints(): void {
        this.controlPoints = this.calculateCropControlPoints()
    }

    /**
     * 渲染图片
     */
    public render(ctx: CanvasRenderingContext2D): void {
        if (!this.image || !this.loaded) {
            // 如果图片未加载，绘制占位符
            this.renderPlaceholder(ctx)
            return
        }

        // 应用样式
        const bounds = this.getBounds()
        this.style.applyToContext(ctx, bounds.width, bounds.height)
        
        // 设置透明度
        ctx.globalAlpha = this.opacity
        
        // 绘制图片（使用原始尺寸）
        if (this.sourceWidth && this.sourceHeight) {
            // 绘制裁剪后的图片
            ctx.drawImage(
                this.image,
                this.sourceX, this.sourceY, this.sourceWidth, this.sourceHeight,
                this.x, this.y, this.sourceWidth, this.sourceHeight
            )
        } else {
            // 绘制完整图片
            ctx.drawImage(
                this.image,
                this.x, this.y, this.image.naturalWidth, this.image.naturalHeight
            )
        }
    }

    /**
     * 渲染占位符（当图片未加载时）
     */
    private renderPlaceholder(ctx: CanvasRenderingContext2D): void {
        // 绘制边框（使用默认尺寸）
        const defaultWidth = 100
        const defaultHeight = 100
        ctx.strokeStyle = '#cccccc'
        ctx.lineWidth = 1
        ctx.strokeRect(this.x, this.y, defaultWidth, defaultHeight)
        
        // 绘制加载中文字
        ctx.fillStyle = '#999999'
        ctx.font = '12px Arial'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(
            'Loading...',
            this.x + defaultWidth / 2,
            this.y + defaultHeight / 2
        )
    }

    /**
     * 检查点是否在图片内
     */
    containsPoint(point: Point3): boolean {
        if (!this.image || !this.loaded) {
            return false
        }
        
        return point.x >= this.x && 
               point.x <= this.x + this.image.naturalWidth &&
               point.y >= this.y && 
               point.y <= this.y + this.image.naturalHeight
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
        
        if (this.sourceWidth && this.sourceHeight) {
            ctx.drawImage(
                this.image,
                this.sourceX, this.sourceY, this.sourceWidth, this.sourceHeight,
                0, 0, this.sourceWidth, this.sourceHeight
            )
        } else {
            ctx.drawImage(this.image, 0, 0, this.image.naturalWidth, this.image.naturalHeight)
        }
        
        return ctx.getImageData(0, 0, canvas.width, canvas.height)
    }

    /**
     * 复制图片元素
     */
    public copy(): ImageElement {
        const copy = new ImageElement(
            this.x, this.y, this.imageSrc, this.style
        )
        copy.opacity = this.opacity
        copy.sourceX = this.sourceX
        copy.sourceY = this.sourceY
        copy.sourceWidth = this.sourceWidth
        copy.sourceHeight = this.sourceHeight
        return copy
    }

    /**
     * 检查是否是图片元素
     */
    public isImageElement(): boolean {
        return true
    }

    /**
     * 静态工厂方法
     */
    static fromImageElement(
        image: HTMLImageElement,
        x: number,
        y: number,
        style: Style = Style.DEFAULT
    ): ImageElement {
        const element = new ImageElement(x, y, "", style)
        element.image = image
        element.loaded = true
        return element
    }

    static fromCanvas(
        canvas: HTMLCanvasElement,
        x: number,
        y: number,
        style: Style = Style.DEFAULT
    ): ImageElement {
        const element = new ImageElement(x, y, "", style)
        // 将 canvas 转换为图片
        const img = new Image()
        img.src = canvas.toDataURL()
        element.image = img
        element.loaded = true
        return element
    }
}
