import { GRAPHTYPE } from '@/core/constants'
import { Style, Color } from '@/core/style'
import TextOptions from './TextOptions'
import Graph from '@/core/graph/base/Graph'
import { Point3, Vector3, Matrix4 } from '@/core/math'
import Bounds from '@/core/graph/base/Bounds'
import { Rectangle } from '@/core/graph/combined'
import { ITextElement, IPrintableTextElement, INonPrintableTextElement, ISerializable } from '@/core/interfaces'
import { generateId } from '@/core/utils'

/**
 * 文字元素基类
 * 包含文字元素的共同属性和方法
 */
export default abstract class TextElement extends Graph implements ITextElement {
    public abstract type: GRAPHTYPE
    public controlPoints: Point3[]
    public _style: Style
    public _options: TextOptions
    public _content: string
    public isLayouted: boolean = false
    public width: number = 0
    public height: number = 0
    public lineHeight: number = 0
    public bounds: Bounds
    public transfromOrigin: Point3

    /** 标记是否需要重新测量尺寸（延迟到 layout 阶段） */
    public _measureDirty: boolean = true

    constructor(
        content: string,
        options: TextOptions = TextOptions.DEFAULT,
        style: Style = Style.DEFAULT
    ) {
        super()
        this._content = content
        this._options = options
        this._style = style
        this.controlPoints = []
        this.bounds = Bounds.empty()
        this.transfromOrigin = Point3.origin
    }

    /**
     * 计算文字的实际宽高（由子类实现）
     * @param ctx 可选的 CanvasRenderingContext2D，传入时直接使用，否则子类自行获取
     */
    protected abstract calculateActualDimensions(ctx?: CanvasRenderingContext2D): void

    /**
     * 确保尺寸已测量（延迟测量的执行入口）
     *
     * TextFields.layout() 在布局前批量调用此方法，
     * 传入 bufferCtx 避免依赖全局 CanvasContext。
     *
     * 当 ctx 为空时（如 Node.js 后端环境无 canvas），跳过测量并保持 dirty，
     * 等待后续有 ctx 时再执行。
     *
     * @param ctx canvas context，用于 measureText
     */
    public ensureMeasured(ctx?: CanvasRenderingContext2D): void {
        if (!this._measureDirty) return
        if (!ctx) return // 无 context 时跳过，保持 dirty，后续渲染时重新触发
        this.calculateActualDimensions(ctx)
        this._measureDirty = false
    }
    public abstract applyLayout(point: Point3, lineHeight: number): this

    public getLength(tStart: number, tEnd: number): number {
        return (this.width + this.lineHeight) * 2 * (tEnd - tStart)
    }

    public getPointAt(t: number): Point3 {
        return this.controlPoints[0]
    }

    public updateBounds(
        orientationX?: boolean,
        orientationY?: boolean
    ): Bounds {
        if (this.isLayouted && this.controlPoints.length > 0) {
            const { x, y } = this.controlPoints[0]
            const startPoint = new Point3(
                x,
                y - this.lineHeight + this.height,
                0
            )
            const points = [
                startPoint,
                startPoint.add(
                    new Vector3(
                        this.width + this.options.letterSpacing,
                        0,
                        0
                    )
                ),
                startPoint.add(
                    new Vector3(
                        this.width + this.options.letterSpacing,
                        this.lineHeight,
                        0
                    )
                ),
                startPoint.add(new Vector3(0, this.lineHeight, 0)),
            ]
            return Bounds.fromPoints(
                points,
                orientationX ?? this.bounds?.width >= 0,
                orientationY ?? this.bounds?.height >= 0
            )
        } else {
            return Bounds.empty()
        }
    }

    /**
     * 设置选项
     */
    set options(options: TextOptions) {
        this._options = options
        // 标记需要重新测量尺寸（延迟到 layout 阶段）
        this._measureDirty = true
    }

    get options() {
        return this._options
    }

    /**
     * 设置文字内容
     */
    set content(content: string) {
        this._content = content
        // 标记需要重新测量尺寸（延迟到 layout 阶段）
        this._measureDirty = true
    }

    get content() {
        return this._content
    }

    set style(style: Style) {
        this._style = style
        // 标记需要重新测量尺寸（延迟到 layout 阶段）
        this._measureDirty = true
    }

    get style() {
        return this._style
    }

    public renderPath(ctx: CanvasRenderingContext2D, dependent: Boolean): void {
        dependent && ctx.beginPath()
        const bounds = this.bounds
        ctx.moveTo(bounds.x, bounds.y)
        ctx.lineTo(bounds.x + bounds.width, bounds.y)
        ctx.lineTo(bounds.x + bounds.width, bounds.y + bounds.height)
        ctx.lineTo(bounds.x, bounds.y + bounds.height)
        ctx.lineTo(bounds.x, bounds.y)
    }

    /**
     * 渲染文字元素（由子类实现）
     */
    public abstract render(ctx: CanvasRenderingContext2D): void

    isPointOnCurve(point: Point3, tolerance: number = 1e-6): boolean {
        const bounds = this.bounds
        return new Rectangle(
            bounds.x,
            bounds.y,
            bounds.width,
            bounds.height
        ).isPointOnCurve(point, tolerance)
    }

    public getTangentAt(t: number): Vector3 {
        const bounds = this.bounds
        const perimeter = 2 * (bounds.width + bounds.height)
        let currentLength = 0

        // 上边：向右
        if (t * perimeter <= bounds.width) {
            return new Vector3(1, 0, 0)
        }
        currentLength += bounds.width

        // 右边：向下
        if (t * perimeter <= currentLength + bounds.height) {
            return new Vector3(0, 1, 0)
        }
        currentLength += bounds.height

        // 下边：向左
        if (t * perimeter <= currentLength + bounds.width) {
            return new Vector3(-1, 0, 0)
        }

        // 左边：向上
        return new Vector3(0, -1, 0)
    }

    public getNormalAt(t: number): Vector3 {
        const tangent = this.getTangentAt(t)
        return new Vector3(-tangent.y, tangent.x, 0)
    }

    public getClosestPoint(point: Point3): {
        distance: number
        closestPoint: Point3
        parameter: number
    } {
        const bounds = this.bounds
        const closestX = Math.max(
            bounds.x,
            Math.min(point.x, bounds.x + bounds.width)
        )
        const closestY = Math.max(
            bounds.y,
            Math.min(point.y, bounds.y + bounds.height)
        )
        const closestPoint = new Point3(closestX, closestY, 0)
        const distance = Math.sqrt(
            Math.pow(point.x - closestPoint.x, 2) +
                Math.pow(point.y - closestPoint.y, 2)
        )

        // 计算参数t（基于周长）
        const perimeter = 2 * (bounds.width + bounds.height)
        let t = 0
        if (closestX === bounds.x + bounds.width && closestY === bounds.y) {
            // 右上角
            t = bounds.width / perimeter
        } else if (
            closestX === bounds.x + bounds.width &&
            closestY === bounds.y + bounds.height
        ) {
            // 右下角
            t = (bounds.width + bounds.height) / perimeter
        } else if (
            closestX === bounds.x &&
            closestY === bounds.y + bounds.height
        ) {
            // 左下角
            t = (2 * bounds.width + bounds.height) / perimeter
        } else if (closestX === bounds.x && closestY === bounds.y) {
            // 左上角
            t = 0
        } else if (closestY === bounds.y) {
            // 上边
            t = (closestX - bounds.x) / perimeter
        } else if (closestX === bounds.x + bounds.width) {
            // 右边
            t = (bounds.width + closestY - bounds.y) / perimeter
        } else if (closestY === bounds.y + bounds.height) {
            // 下边
            t =
                (bounds.width +
                    bounds.height +
                    bounds.width -
                    (closestX - bounds.x)) /
                perimeter
        } else {
            // 左边
            t =
                (2 * bounds.width +
                    bounds.height +
                    bounds.height -
                    (closestY - bounds.y)) /
                perimeter
        }

        return { distance, closestPoint, parameter: t }
    }

    public getArea(): number {
        const bounds = this.bounds
        return bounds.width * bounds.height
    }

    public getCentroid(): Point3 {
        const bounds = this.bounds
        return new Point3(
            bounds.x + bounds.width / 2,
            bounds.y + bounds.height / 2,
            0
        )
    }

    public transform(matrix: Matrix4): Graph {
        if (this.controlPoints.length > 0) {
            this.controlPoints[0] = matrix.multiply(this.controlPoints[0])
            this.bounds = this.updateBounds()
        }
        return this
    }

    /**
     * 计算与另一个图形的相交点
     * @param other 另一个图形
     */
    public intersect(other: Graph): Point3[] {
        return Rectangle.fromBounds(
            this.bounds ?? this.updateBounds()
        ).intersect(other)
    }

    public resize(
        fixedPoint: Point3,
        dynamicPoint: Point3,
        resizeVector: Vector3
    ): void {
        this.options.size = Math.max(
            0,
            this.options.size +
                resizeVector.length *
                    Math.sign(
                        dynamicPoint.subtract(fixedPoint).y * resizeVector.y
                    )
        )
    }

    /** 文字元素不支持顶点编辑 */
    public setControlPoint(_index: number, _point: Point3): void {}

    /**
     * 复制文字元素（由子类实现）
     */
    public abstract copy(): this
}

/**
 * 可打印的文字元素类
 * 表示单个可打印的文字元素，是最小的文字单位
 * 文字包围盒为option.size * lineheight
 * 单个文字的控制点不在其包围盒左上角而是在文字的左上角
 */
export class PrintableTextElement extends TextElement implements IPrintableTextElement, ISerializable {
    public type: GRAPHTYPE = GRAPHTYPE.PRINTABLE_TEXTELEMENT

    constructor(
        content: string,
        options: TextOptions = TextOptions.DEFAULT,
        style: Style = Style.DEFAULT
    ) {
        super(content, options, style)

        if (content.length !== 1)
            throw new Error(
                'PrintableTextElement content must be a single character'
            )

        // 标记 dirty，延迟到 layout 阶段由 TextFields.layout() 批量测量
        this._measureDirty = true
        this.id = generateId(this.type)
    }

    /**
     * 计算文字的实际宽高
     *
     * @param ctx 用于 measureText 的 CanvasRenderingContext2D
     */
    protected calculateActualDimensions(ctx?: CanvasRenderingContext2D): void {
        if (!ctx) throw new Error('calculateActualDimensions: 需要传入 ctx')
        ctx.save()
        // 设置字体样式
        ctx.font = this.options.fontString

        // 测量文字尺寸
        const metrics = ctx.measureText(this._content)
        this.width = metrics.width
        this.height = this.options.size
        ctx.restore()
    }

    /**
     * 设置文字内容
     */
    set content(content: string) {
        if (content.length > 1)
            throw new Error(
                'PrintableTextElement content must be a single character'
            )
        super.content = content
    }

    /**
     * 布局方法 - 在TextView中调用时设置位置和计算包围盒
     */
    public applyLayout(position: Point3, lineHeight: number): this {
        this.isLayouted = true
        this.controlPoints = [position.copy()]
        this.lineHeight = lineHeight
        // 计算包围盒并设置正确的controlPoints
        this.bounds = this.updateBounds()
        // 将变换原点放到左上角
        this.transfromOrigin = position.add(
            new Vector3(0, this.height - lineHeight, 0)
        )
        return this
    }

    /**
     * 渲染文字元素
     */
    public render(ctx: CanvasRenderingContext2D): void {
        ctx.save()

        // 设置字体样式
        ctx.font = this.options.fontString
        //字体基线
        ctx.textBaseline = 'top'

        // 应用样式（但不覆盖文字颜色）
        const bounds = this.bounds
        this.style.applyToContext(ctx, bounds.width, bounds.height)

        // 设置文字颜色（在应用样式后设置，确保不被覆盖）
        ctx.fillStyle = this.options.color.rgba
        // 绘制文字
        ctx.fillText(
            super.content,
            this.controlPoints[0].x,
            this.controlPoints[0].y
        )
        ctx.restore()
    }

    /**
     * 复制文字元素
     */
    public copy(): this {
        const newElement = new PrintableTextElement(
            super.content,
            super.options.copy(),
            super.style.copy()
        )

        if (this.isLayouted) {
            newElement.applyLayout(this.controlPoints[0].copy(), this.lineHeight)
        }
        return newElement as this
    }

    /**
     * 静态工厂方法 - 创建简单文字元素
     */
    static simple(
        content: string,
        size: number = 16,
        color: string = '#000000'
    ): PrintableTextElement {
        const options = new TextOptions()
        options.size = size
        // 从字符串创建Color对象
        const colorObj = Color.fromHex(color)
        options.color = colorObj

        return new PrintableTextElement(content, options)
    }

    // ── 序列化 ──
    toJSON(): any {
        return {
            id: this.id,
            type: this.type,
            $class: 'PrintableTextElement',
            content: super.content,
            options: super.options.toJSON(),
            style: super.style.toJSON(),
        }
    }

    static fromJSON(data: any): PrintableTextElement {
        const el = new PrintableTextElement(
            data.content,
            TextOptions.fromJSON(data.options),
            Style.fromJSON(data.style),
        )
        el.id = data.id
        return el
    }

    /**
     * 静态工厂方法 - 创建标题文字元素
     */
    static title(content: string, size: number = 24): PrintableTextElement {
        const options = TextOptions.title()
        options.size = size

        return new PrintableTextElement(content, options)
    }

    /**
     * 静态工厂方法 - 创建粗体文字元素
     */
    static bold(content: string, size: number = 16): PrintableTextElement {
        const options = TextOptions.bold()
        options.size = size

        return new PrintableTextElement(content, options)
    }

    /**
     * 静态工厂方法 - 创建斜体文字元素
     */
    static italic(content: string, size: number = 16): PrintableTextElement {
        const options = TextOptions.italic()
        options.size = size

        return new PrintableTextElement(content, options)
    }
}

/**
 * 不可打印的文字元素
 * @description 不可打印的文字元素，段落结束位置守卫，不会渲染到屏幕上
 * @description 使用场景: 空行布局与交互
 */
export class NonPrintableTextElement extends TextElement implements INonPrintableTextElement, ISerializable {
    public type: GRAPHTYPE = GRAPHTYPE.NONPRINTABLE_TEXTELEMENT

    constructor() {
        super('', TextOptions.DEFAULT, Style.DEFAULT)
        this.calculateActualDimensions()
        this._measureDirty = false  // 固定尺寸，无需延迟
        this.id = generateId(this.type)
    }

    // ── 序列化 ──
    toJSON(): any {
        return {
            id: this.id,
            type: this.type,
            $class: 'NonPrintableTextElement',
        }
    }

    static fromJSON(data: any): NonPrintableTextElement {
        const el = new NonPrintableTextElement()
        el.id = data.id
        return el
    }

    /**
     * 布局方法 - 在TextView中调用时设置位置和计算包围盒
     *
     * 注意：不修改 this.height（始终保持为 0），这样 layoutTextElementsInParagraph
     * 中 `currentY + lineHeight - textElement.height` 的计算在每次重新布局时都一致。
     * 包围盒的高度通过 lineHeight 表达，与 PrintableTextElement 的模式对齐。
     */
    public applyLayout(position: Point3, lineHeight: number): this {
        this.isLayouted = true
        this.controlPoints = [position.copy()]
        this.lineHeight = lineHeight
        // 计算包围盒并设置正确的controlPoints
        this.bounds = this.updateBounds()
        this.transfromOrigin = position.copy()
        return this
    }

    /**
     * 计算文字的实际宽高（固定尺寸，不需要 ctx）
     */
    protected calculateActualDimensions(_ctx?: CanvasRenderingContext2D): void {
        this.width = 2
        this.height = 0
    }

    /**
     * 计算包围盒
     *
     * NonPrintable 的 height 始终为 0，position.y = currentY + lineHeight（由布局引擎设置）。
     * 包围盒 y 起点 = position.y - lineHeight = currentY，高度 = lineHeight。
     * 这与 PrintableTextElement 的 updateBounds 逻辑等价：
     *   startPoint.y = position.y - lineHeight + height
     * 当 height = 0 时简化为 position.y - lineHeight。
     */
    public updateBounds(): Bounds {
        return new Bounds(
            this.controlPoints[0].x,
            this.controlPoints[0].y - this.lineHeight,
            this.width + this.options.letterSpacing,
            this.lineHeight
        )
    }

    /**
     * 渲染文字元素（不可打印，不渲染内容）
     */
    public render(ctx: CanvasRenderingContext2D): void {
        // 不可打印元素不渲染任何内容
    }

    /**
     * 复制文字元素
     */
    public copy(): this {
        const newElement = new NonPrintableTextElement()

        if (this.isLayouted) {
            newElement.applyLayout(this.controlPoints[0].copy(), this.lineHeight)
        }
        return newElement as this
    }
}

// 类型守卫函数

/**
 * 检查是否为可打印的文字元素
 */
export function isPrintableTextElement(
    graph: any
): graph is PrintableTextElement {
    return graph instanceof PrintableTextElement
}

/**
 * 检查是否为不可打印的文字元素
 */
export function isNonPrintableTextElement(
    graph: any
): graph is NonPrintableTextElement {
    return graph instanceof NonPrintableTextElement
}
