import { GraphType } from '@/foundation/constants'
import MediaElement from './MediaElement'
import { Style } from '@/foundation/style'
import type { IImageElement } from '@/types/graph/graph'
import type { ISerializable } from '@/types/foundation/serializable'
import { generateId } from '@/foundation/utils'

/**
 * 图片元素类。
 *
 * ImageElement 继承自 {@link MediaElement}，实现 {@link IImageElement} 和 {@link ISerializable} 接口，
 * 用于在画布中绘制位图图片。
 *
 * **跨域支持**：创建 `HTMLImageElement` 时设置 `crossOrigin = 'anonymous'`，
 * 允许从跨域 CDN 加载图片并提取像素数据（{@link getImageData}）。
 *
 * **加载机制**：构造时自动调用 {@link loadMedia} → {@link loadImage}，通过 Promise 封装
 * `HTMLImageElement.onload` / `onerror` 回调，加载完成后更新 `actualWidth`/`actualHeight` 和控制点。
 *
 * **静态工厂**：{@link fromCanvas} 可从 `HTMLCanvasElement` 创建图片元素，
 * 内部通过 `canvas.toDataURL()` + `Image.onload` 实现转换。
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
 * img.render(ctx); // 绘制到画布
 * ```
 */
export default class ImageElement extends MediaElement implements IImageElement, ISerializable {
    /** 图形类型标识 */
    public type: GraphType = GraphType.IMAGE

    /** 底层 HTMLImageElement 对象，加载完成后赋值 */
    public image: HTMLImageElement | null = null

    /**
     * 创建图片元素实例。
     *
     * 构造时自动调用 {@link loadMedia} 开始异步加载图片资源。
     *
     * @param {string} src - 图片资源的 URL 地址
     * @param {number} x - 矩形左上角 x 坐标
     * @param {number} y - 矩形左上角 y 坐标
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
     * 加载图片资源。委托给 {@link loadImage} 执行实际的异步加载。
     *
     * @protected
     * @returns {Promise<void>} 加载完成后 resolve
     *
     * @example
     * ```ts
     * // 由 MediaElement 构造函数自动调用
     * protected async loadMedia(): Promise<void> { return this.loadImage(); }
     * ```
     */
    protected async loadMedia(): Promise<void> {
        return this.loadImage()
    }

    /**
     * 异步加载图片。
     *
     * 创建 `HTMLImageElement` 并设置 `crossOrigin = 'anonymous'` 以支持跨域图片，
     * 通过 Promise 封装 `onload`/`onerror` 回调：
     * - `onload`：赋值 {@link image}，更新 `actualWidth`/`actualHeight` 和 `loaded`，同步控制点和包围盒
     * - `onerror`：reject 并打印错误日志
     *
     * @private
     * @returns {Promise<void>} 图片加载完成后 resolve，加载失败则 reject
     *
     * @example
     * ```ts
     * await img.loadImage();
     * img.loaded; // true
     * ```
     */
    private async loadImage(): Promise<void> {
        return new Promise((resolve, reject) => {
            const img = new Image()
            img.crossOrigin = 'anonymous' // 支持跨域图片

            img.onload = () => {
                this.image = img
                this.actualWidth = img.naturalWidth
                this.actualHeight = img.naturalHeight
                this.loaded = true
                // 媒体加载完成后，更新控制点和边界框
                this.updateControlPoints()
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
     * 更换图片源并重新加载。
     *
     * 重置 `image`/`loaded` 状态，同步控制点和包围盒，然后触发异步重新加载。
     *
     * @param {string} src - 新的图片资源 URL
     * @returns {ImageElement} 当前实例，支持链式调用
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
     * 渲染图片到 Canvas。
     *
     * 若图片尚未加载完成，调用 {@link renderPlaceholder} 绘制占位符；
     * 否则应用样式后使用 `ctx.drawImage` 将图片绘制到 `(x, y, width, height)` 矩形区域。
     * 绘制使用设置的 `width`/`height`，而非图片的原始尺寸。
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 渲染上下文
     *
     * @example
     * ```ts
     * img.render(ctx); // 绘制图片或占位符
     * ```
     */
    public render(ctx: CanvasRenderingContext2D, style: Style): void {
        ctx.save()
        if (!this.image || !this.loaded) {
            // 如果图片未加载，绘制占位符
            this.renderPlaceholder(ctx)
            ctx.restore()
            return
        }

        // 应用样式
        const bounds = this.bounds
        style.applyToContext(ctx, Math.abs(bounds.width), Math.abs(bounds.height))

        // 使用设置的尺寸绘制图片，而不是原始尺寸
        ctx.drawImage(this.image, this.x, this.y, this.width, this.height)
        ctx.restore()
    }

    /**
     * 渲染占位符。当图片未加载完成时，绘制灰色虚线边框和 "Loading..." 提示文字。
     *
     * @protected
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 渲染上下文
     *
     * @example
     * ```ts
     * // 由 render() 在 loaded === false 时自动调用
     * img.renderPlaceholder(ctx);
     * ```
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
     * 获取图片的像素数据。
     *
     * 创建临时 Canvas，将图片以原始尺寸（`naturalWidth` × `naturalHeight`）绘制到上面，
     * 再通过 `ctx.getImageData` 提取完整的像素数据。
     * 需要图片已加载完成且跨域配置正确，否则返回 `null`。
     *
     * @returns {ImageData | null} 图片像素数据；若未加载或 Canvas 不可用则返回 `null`
     *
     * @example
     * ```ts
     * const img = new ImageElement('photo.jpg', 0, 0, 100, 100);
     * await img.loadMedia();
     * const pixels = img.getImageData();
     * // pixels.data[0] → 第一个像素的 R 通道值
     * ```
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
     * 复制图片元素。
     *
     * 创建一个相同属性（`src`、位置、尺寸、样式）的新 {@link ImageElement} 实例。
     * 注意：复制后的实例不共享 `HTMLImageElement`，需要重新加载。
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

    // ── 序列化 ──

    /**
     * 将图片元素序列化为 JSON 对象，用于持久化存储。
     *
     * @returns {any} 包含 id、type、src、位置、尺寸和样式的 JSON 对象
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
     * 从 JSON 对象反序列化创建图片元素。
     *
     * @param {any} data - 序列化后的 JSON 数据
     * @returns {ImageElement} 恢复的图片元素实例
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
     * 从 HTMLCanvasElement 创建图片元素的静态工厂方法。
     *
     * 通过 `canvas.toDataURL()` 将 Canvas 内容转为 Data URL，
     * 再创建 `HTMLImageElement` 加载该 Data URL，加载成功后赋值给新实例的 {@link image} 属性。
     *
     * @param {HTMLCanvasElement} canvas - 源 Canvas 元素
     * @param {number} x - 矩形左上角 x 坐标
     * @param {number} y - 矩形左上角 y 坐标
     * @param {number} width - 矩形宽度
     * @param {number} height - 矩形高度
     * @param {Style} [style=Style.DEFAULT] - 元素样式
     * @returns {Promise<ImageElement>} 加载完成后 resolve 为图片元素实例
     *
     * @example
     * ```ts
     * const canvas = document.createElement('canvas');
     * canvas.width = 200;
     * canvas.height = 100;
     * // ... 在 canvas 上绘制内容 ...
     * const img = await ImageElement.fromCanvas(canvas, 0, 0, 200, 100);
     * ```
     */
    static fromCanvas(
        canvas: HTMLCanvasElement,
        x: number,
        y: number,
        width: number,
        height: number,
        _style?: Style
    ): Promise<ImageElement> {
        return new Promise((resolve, reject) => {
            const element = new ImageElement('', x, y, width, height)
            // 将 canvas 转换为图片
            const img = new Image()
            img.src = canvas.toDataURL()
            img.onload = () => {
                element.image = img
                element.actualWidth = img.naturalWidth
                element.actualHeight = img.naturalHeight
                element.loaded = true
                element.updateControlPoints()
                resolve(element)
            }
            img.onerror = () => {
                reject(new Error('Failed to create image from canvas'))
            }
        })
    }
}
