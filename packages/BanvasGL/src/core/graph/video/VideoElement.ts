import { GRAPHTYPE } from "@/constants"
import Graph, { GraphOptions } from "../base/Graph"
import { Point3 } from "@/core/math"
import { Style } from "@/core/style"
import Bounds from "../base/Bounds"

/**
 * VideoElement 类 - 视频元素
 * 继承自 Graph，用于在画布中绘制视频
 */
export default class VideoElement extends Graph {
    public type: GRAPHTYPE = GRAPHTYPE.VIDEO
    public controlPoints: Point3[]
    public style: Style
    
    // 视频相关属性
    public video: HTMLVideoElement | null = null
    public videoSrc: string = ""
    public x: number
    public y: number
    public width: number = 100
    public height: number = 100
    public opacity: number = 1   // 透明度
    public loaded: boolean = false
    public autoplay: boolean = false
    public loop: boolean = false
    public muted: boolean = false
    public playing: boolean = false

    constructor(
        x: number,
        y: number,
        videoSrc: string,
        style: Style = Style.DEFAULT,
        options?: GraphOptions
    ) {
        super(options)
        this.x = x
        this.y = y
        this.videoSrc = videoSrc
        this.style = style
        
        // 初始化控制点（裁剪区域的八个点）
        this.controlPoints = this.calculateCropControlPoints()
        
        // 在构造函数中立即计算边界框，确保View能获取到正确的初始尺寸
        this.setBounds(this.calculateBounds())
        
        // 异步加载视频
        this.loadVideo()
    }

    /**
     * 加载视频
     */
    private async loadVideo(): Promise<void> {
        return new Promise((resolve, reject) => {
            const video = document.createElement('video')
            video.crossOrigin = "anonymous" // 支持跨域视频
            video.preload = "metadata"
            
            if (this.autoplay) {
                video.autoplay = true
            }
            if (this.loop) {
                video.loop = true
            }
            if (this.muted) {
                video.muted = true
            }
            
            video.onloadedmetadata = () => {
                this.video = video
                this.width = video.videoWidth
                this.height = video.videoHeight
                this.loaded = true
                resolve()
            }
            
            video.onerror = () => {
                console.error(`Failed to load video: ${this.videoSrc}`)
                reject(new Error(`Failed to load video: ${this.videoSrc}`))
            }
            
            video.src = this.videoSrc
        })
    }

    /**
     * 计算边界框
     */
    protected calculateBounds(): Bounds {
        if (!this.video || !this.loaded) {
            return new Bounds(this.x, this.y, this.width, this.height)
        }
        
        return new Bounds(
            this.x,
            this.y,
            this.width,
            this.height
        )
    }

    /**
     * 设置视频源
     */
    setVideoSrc(src: string): VideoElement {
        this.videoSrc = src
        this.loaded = false
        this.loadVideo()
        return this
    }

    /**
     * 设置位置
     */
    setPosition(x: number, y: number): VideoElement {
        this.x = x
        this.y = y
        this.updateControlPoints()
        return this
    }

    setSize(width: number, height: number): VideoElement {
        this.width = width
        this.height = height
        this.updateControlPoints()
        return this
    }


    /**
     * 设置透明度
     */
    setOpacity(opacity: number): VideoElement {
        this.opacity = Math.max(0, Math.min(1, opacity))
        return this
    }

    /**
     * 设置视频播放选项
     */
    setPlayOptions(options: {
        autoplay?: boolean
        loop?: boolean
        muted?: boolean
    }): VideoElement {
        if (options.autoplay !== undefined) this.autoplay = options.autoplay
        if (options.loop !== undefined) this.loop = options.loop
        if (options.muted !== undefined) this.muted = options.muted
        
        if (this.video) {
            this.video.autoplay = this.autoplay
            this.video.loop = this.loop
            this.video.muted = this.muted
        }
        
        return this
    }

    /**
     * 计算裁剪区域的控制点（八个点）
     */
    private calculateCropControlPoints(): Point3[] {
        if (!this.video || !this.loaded) {
            // 如果视频未加载，返回默认控制点
            return [new Point3(this.x, this.y, 0)]
        }
        
        const actualX = this.x
        const actualY = this.y
        const actualWidth = this.width
        const actualHeight = this.height
        
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

    public renderPath(ctx: CanvasRenderingContext2D, dependent: Boolean): void {
        dependent && ctx.beginPath()
        const x = this.x
        const y = this.y
        const width = this.width
        const height = this.height
        ctx.moveTo(x, y)
        ctx.lineTo(x + width, y)
        ctx.lineTo(x + width, y + height)
        ctx.lineTo(x, y + height)
        ctx.lineTo(x, y)
    }

    /**
     * 播放视频
     */
    play(): Promise<void> {
        if (!this.video) {
            return Promise.reject(new Error('Video not loaded'))
        }
        
        this.playing = true
        return this.video.play()
    }

    /**
     * 暂停视频
     */
    pause(): void {
        if (this.video) {
            this.video.pause()
            this.playing = false
        }
    }

    /**
     * 停止视频
     */
    stop(): void {
        if (this.video) {
            this.video.pause()
            this.video.currentTime = 0
            this.playing = false
        }
    }

    /**
     * 设置播放时间
     */
    setCurrentTime(time: number): void {
        if (this.video) {
            this.video.currentTime = time
        }
    }

    /**
     * 获取当前播放时间
     */
    getCurrentTime(): number {
        return this.video ? this.video.currentTime : 0
    }

    /**
     * 获取视频总时长
     */
    getDuration(): number {
        return this.video ? this.video.duration : 0
    }

    /**
     * 设置音量
     */
    setVolume(volume: number): void {
        if (this.video) {
            this.video.volume = Math.max(0, Math.min(1, volume))
        }
    }

    /**
     * 获取音量
     */
    getVolume(): number {
        return this.video ? this.video.volume : 0
    }

    /**
     * 渲染视频
     */
    public render(ctx: CanvasRenderingContext2D): void {
        if (!this.video || !this.loaded) {
            // 如果视频未加载，绘制占位符
            this.renderPlaceholder(ctx)
            return
        }

        // 应用样式
        const bounds = this.getBounds()
        this.style.applyToContext(ctx, bounds.width, bounds.height)
        
        // 设置透明度
        ctx.globalAlpha = this.opacity
        
        // 绘制视频（使用设置的尺寸）
        ctx.drawImage(
            this.video,
            this.x, this.y, this.width, this.height
        )
    }

    /**
     * 渲染占位符（当视频未加载时）
     */
    private renderPlaceholder(ctx: CanvasRenderingContext2D): void {
        ctx.strokeStyle = '#cccccc'
        ctx.lineWidth = 1
        ctx.strokeRect(this.x, this.y, this.width, this.height)
        
        // 绘制播放按钮图标
        const centerX = this.x + this.width / 2
        const centerY = this.y + this.height / 2
        const iconSize = Math.min(this.width, this.height) * 0.3
        
        ctx.fillStyle = '#999999'
        ctx.beginPath()
        ctx.moveTo(centerX - iconSize / 2, centerY - iconSize / 2)
        ctx.lineTo(centerX + iconSize / 2, centerY)
        ctx.lineTo(centerX - iconSize / 2, centerY + iconSize / 2)
        ctx.closePath()
        ctx.fill()
        
        // 绘制加载中文字
        ctx.fillStyle = '#999999'
        ctx.font = '12px Arial'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'bottom'
        ctx.fillText(
            'Loading...',
            centerX,
            centerY + iconSize / 2 + 20
        )
    }

    /**
     * 检查点是否在视频内
     */
    containsPoint(point: Point3): boolean {
        if (!this.video || !this.loaded) {
            return false
        }
        
        return point.x >= this.x && 
               point.x <= this.x + this.width &&
               point.y >= this.y && 
               point.y <= this.y + this.height
    }

    /**
     * 获取视频的像素数据
     */
    getImageData(): ImageData | null {
        if (!this.video || !this.loaded) return null
        
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) return null
        
        canvas.width = this.video.videoWidth
        canvas.height = this.video.videoHeight
        
        ctx.drawImage(this.video, 0, 0, this.video.videoWidth, this.video.videoHeight)
        
        return ctx.getImageData(0, 0, canvas.width, canvas.height)
    }

    /**
     * 复制视频元素
     */
    public copy(): this {
        const copy = new VideoElement(
            this.x, this.y, this.videoSrc, this.style
        )
        copy.width = this.width
        copy.height = this.height
        copy.opacity = this.opacity
        copy.autoplay = this.autoplay
        copy.loop = this.loop
        copy.muted = this.muted
        return copy as this
    }

    /**
     * 检查是否是视频元素
     */
    public isVideoElement(): boolean {
        return true
    }

    /**
     * 静态工厂方法
     */
    static fromVideoElement(
        video: HTMLVideoElement,
        x: number,
        y: number,
        style: Style = Style.DEFAULT
    ): VideoElement {
        const element = new VideoElement(x, y, "", style)
        element.video = video
        element.loaded = true
        return element
    }
}
