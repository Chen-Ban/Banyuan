import { GraphType } from '@/foundation/constants'
import MediaElement from './MediaElement'
import { Style } from '@/foundation/style'
import type { IImageElement } from '@/types/graph/graph'
import type { ISerializable } from '@/types/foundation/serializable'
import type { IDrawingContext, IDrawingImageData } from '@/types/platform/drawing.js'
import type { IImageSource } from '@/types/foundation/media.js'
import { generateId } from '@/foundation/utils'

/**
 * 图片元素类�?
 *
 * ImageElement 继承�?{@link MediaElement}，实�?{@link IImageElement} �?{@link ISerializable} 接口�?
 * 用于在画布中绘制位图图片�?
 *
 * **跨域支持**：创�?`HTMLImageElement` 时设�?`crossOrigin = 'anonymous'`�?
 * 允许从跨�?CDN 加载图片并提取像素数据（{@link getImageData}）�?
 *
 * **加载机制**：构造时自动调用 {@link loadMedia} �?{@link loadImage}，通过 Promise 封装
 * `HTMLImageElement.onload` / `onerror` 回调，加载完成后更新 `actualWidth`/`actualHeight` 和控制点�?
 *
 * **静态工�?*：{@link fromImageSource} 可从任意 {@link IImageSource} 创建图片元素（平台无关）�?
 * {@link fromCanvas} 已废弃，保留为委托到 `fromImageSource` �?convenience 方法�?
 *
 * @extends MediaElement
 * @implements IImageElement
 * @implements ISerializable
 *
 * @example
 * ```ts
 * const img = new ImageElement('https://cdn.example.com/photo.jpg', 10, 20, 300, 200);
 * // 异步加载完成后：
 * img.loaded; // true
 * img.actualWidth; // 原始宽度
 * img.render(ctx); // 绘制到画�?
 * ```
 */
export default class ImageElement extends MediaElement implements IImageElement, ISerializable {
    /** 图形类型标识 */
    public type: GraphType = GraphType.IMAGE

    /** 平台无关的图像源，加载完成后赋值（可能�?HTMLImageElement / HTMLCanvasElement / ImageBitmap 等） */
    public image: IImageSource | null = null

    /**
     * 创建图片元素实例�?
     *
     * 构造时自动调用 {@link loadMedia} 开始异步加载图片资源�?
     *
     * @param {string} src - 图片资源�?URL 地址
     * @param {number} x - 矩形左上�?x 坐标
     * @param {number} y - 矩形左上�?y 坐标
     * @param {number} width - 矩形宽度
     * @param {number} height - 矩形高度
     * @param {Style} [style=Style.DEFAULT] - 元素样式
     *
     * @example
     * ```ts
     * const img = new ImageElement('photo.jpg', 10, 20, 300, 200);
     * ```
     */
    constructor(
        src: string,
        x: number,
        y: number,
        width: number,
        height: number,
        _style?: Style
    ) {
        super(src, x, y, width, height)
        this.id = generateId(this.type)
    }

    /**
     * 加载图片资源。委托给 {@link loadImage} 执行实际的异步加载�?
     *
     * @protected
     * @returns {Promise<void>} 加载完成�?resolve
     *
     * @example
     * ```ts
     * // �?MediaElement 构造函数自动调�?
     * protected async loadMedia(): Promise<void> { return this.loadImage(); }
     * ```
     */
    protected async loadMedia(): Promise<void> {
        return this.loadImage()
    }

    /**
     * 异步加载图片�?
     *
     * 引擎不再直接创建 HTMLImageElement，改为通过平台注入�?IDrawingContext 加载像素源�?
     * 构造时此方法为 no-op（不自动加载），需�?app 初始化时通过 loadImageWithContext(ctx) 显式加载�?
     *
     * @deprecated 请使�?loadImageWithContext(ctx) 传入平台 DrawingContext 进行加载
     * @returns {Promise<void>} 立即 resolve（无操作�?
     */
    private async loadImage(): Promise<void> {
        // 引擎不再直接创建 DOM Image�?
        // 图像源加载需要通过 loadImageWithContext(ctx) 由平台层注入�?
        return Promise.resolve()
    }

    /**
     * 使用平台 DrawingContext 加载图片像素源�?
     *
     * 调用 ctx.loadImageSource() 获取平台无关�?IImageSource�?
     * 完成后更�?actualWidth/actualHeight/loaded 和控制点�?
     *
     * @param {IDrawingContext} ctx - 平台绘图上下�?
     * @returns {Promise<void>} 加载完成�?resolve
     */
    async loadImageWithContext(ctx: IDrawingContext): Promise<void> {
        if (!this.src) return
        try {
            const source = await ctx.loadImageSource(this.src, 'anonymous')
            this.image = source
            this.actualWidth = source.width
            this.actualHeight = source.height
            this.loaded = true
            this.updateControlPoints()
        } catch (e) {
            console.error(`Failed to load image: ${this.src}`, e)
        }
    }

    /**
     * 更换图片源并重新加载�?
     *
     * 重置 `image`/`loaded` 状态，同步控制点和包围盒，然后触发异步重新加载�?
     *
     * @param {string} src - 新的图片资源 URL
     * @returns {ImageElement} 当前实例，支持链式调�?
     *
     * @example
     * ```ts
     * img.setImageSrc('https://cdn.example.com/new-photo.jpg');
     * ```
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
     * 渲染图片�?Canvas�?
     *
     * 若图片尚未加载完成，调用 {@link renderPlaceholder} 绘制占位符；
     * 否则应用样式后使�?`ctx.drawImage` 将图片绘制到 `(x, y, width, height)` 矩形区域�?
     * 绘制使用设置�?`width`/`height`，而非图片的原始尺寸�?
     *
     * @param {IDrawingContext} ctx - Canvas 2D 渲染上下�?
     *
     * @example
     * ```ts
     * img.render(ctx); // 绘制图片或占位符
     * ```
     */
    public render(ctx: IDrawingContext, style: Style): void {
        ctx.save()
        if (!this.image || !this.loaded) {
            // 如果图片未加载，绘制占位�?
            this.renderPlaceholder(ctx)
            ctx.restore()
            return
        }

        // 应用样式
        const bounds = this.bounds
        style.applyToContext(ctx, Math.abs(bounds.width), Math.abs(bounds.height))

        // 使用设置的尺寸绘制图片，而不是原始尺�?
        ctx.drawImage(this.image, this.x, this.y, this.width, this.height)
        ctx.restore()
    }

    /**
     * 渲染占位符。当图片未加载完成时，绘制灰色虚线边框和 "Loading..." 提示文字�?
     *
     * @protected
     * @param {IDrawingContext} ctx - Canvas 2D 渲染上下�?
     *
     * @example
     * ```ts
     * // �?render() �?loaded === false 时自动调�?
     * img.renderPlaceholder(ctx);
     * ```
     */
    protected renderPlaceholder(ctx: IDrawingContext): void {
        ctx.save()
        ctx.strokeStyle = '#cccccc'
        ctx.lineWidth = 1
        ctx.strokeRect(this.x, this.y, this.width, this.height)

        // 绘制加载中文�?
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
     * 获取图片的像素数据�?
     *
     * 直接返回 image.data —�?引擎持有原始 RGBA 像素�?
     * 无需通过 DrawingContext 中转�?
     * 需要图片已加载完成，否则返�?`null`�?
     *
     * @returns {IDrawingImageData | null} 图片像素数据；若未加载则返回 `null`
     */
    getImageData(): IDrawingImageData | null {
        if (!this.image || !this.loaded) return null
        return {
            width: this.image.width,
            height: this.image.height,
            data: this.image.data,
        }
    }

    /**
     * 复制图片元素�?
     *
     * 创建一个相同属性（`src`、位置、尺寸、样式）的新 {@link ImageElement} 实例�?
     * 注意：复制后的实例不共享 `HTMLImageElement`，需要重新加载�?
     *
     * @returns {this} 新的图片元素实例
     *
     * @example
     * ```ts
     * const copy = img.copy();
     * copy.src; // 与原实例相同
     * ```
     */
    public copy(): this {
        const copy = new ImageElement(
            this.src,
            this.x,
            this.y,
            this.width,
            this.height,
        )
        return copy as this
    }

    // ── 序列�?──

    /**
     * 将图片元素序列化�?JSON 对象，用于持久化存储�?
     *
     * @returns {any} 包含 id、type、src、位置、尺寸和样式�?JSON 对象
     *
     * @example
     * ```ts
     * const json = img.toJSON();
     * // { id: '...', type: 4, src: 'photo.jpg', x: 10, y: 20, width: 300, height: 200, style: {...} }
     * ```
     */
    toJSON(): any {
        return {
            id: this.id,
            type: this.type,
            src: this.src,
            x: this.x,
            y: this.y,
            width: this.width,
            height: this.height,
        }
    }

    /**
     * �?JSON 对象反序列化创建图片元素�?
     *
     * @param {any} data - 序列化后�?JSON 数据
     * @returns {ImageElement} 恢复的图片元素实�?
     *
     * @example
     * ```ts
     * const img = ImageElement.fromJSON(jsonData);
     * ```
     */
    static fromJSON(data: any): ImageElement {
        const el = new ImageElement(
            data.src,
            data.x,
            data.y,
            data.width,
            data.height,
        )
        el.id = data.id
        return el
    }

    /**
     * 从平台无关的图像源创建图片元素的静态工厂方法�?
     *
     * 直接存储 {@link IImageSource}，无需 `toDataURL()` �?`HTMLImageElement` 中转�?
     * 适用于将 Canvas / ImageBitmap / SkImage 等任意平台图像源包装为图元�?
     *
     * @param {IImageSource} source - 平台无关的图像源
     * @param {number} x - 矩形左上�?x 坐标
     * @param {number} y - 矩形左上�?y 坐标
     * @param {number} width - 矩形宽度
     * @param {number} height - 矩形高度
     * @param {Style} [_style] - 元素样式
     * @returns {ImageElement} 立即可用的图片元素实�?
     *
     * @example
     * ```ts
     * const canvas = document.createElement('canvas');
     * canvas.width = 200;
     * canvas.height = 100;
     * // ... �?canvas 上绘制内�?...
     * const img = ImageElement.fromImageSource(canvas, 0, 0, 200, 100);
     * ```
     */
    static fromImageSource(
        source: IImageSource,
        x: number,
        y: number,
        width: number,
        height: number,
        _style?: Style
    ): ImageElement {
        const element = new ImageElement('', x, y, width, height)
        element.image = source
        element.actualWidth = source.width
        element.actualHeight = source.height
        element.loaded = true
        element.updateControlPoints()
        return element
    }

    /**
     * 从平台无关的图像源创建图片元素的静态工厂方法�?
     *
     * @deprecated 请使用平台无关的 {@link fromImageSource}，它接受任意 {@link IImageSource}�?
     *
     * @param {IImageSource} source - 平台无关的图像源
     * @param {number} x - 矩形左上�?x 坐标
     * @param {number} y - 矩形左上�?y 坐标
     * @param {number} width - 矩形宽度
     * @param {number} height - 矩形高度
     * @param {Style} [_style] - 元素样式
     * @returns {Promise<ImageElement>} 加载完成�?resolve 为图片元素实�?
     */
    static fromCanvas(
        source: IImageSource,
        x: number,
        y: number,
        width: number,
        height: number,
        _style?: Style
    ): Promise<ImageElement> {
        return Promise.resolve(
            ImageElement.fromImageSource(source, x, y, width, height, _style)
        )
    }
}
