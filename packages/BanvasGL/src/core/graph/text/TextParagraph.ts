import { GRAPHTYPE } from '@/core/constants'
import Graph from '@/core/graph/base/Graph'
import { Point3, Vector3, Matrix4 } from '@/core/math'
import { Style } from '@/core/style'
import { NonPrintableTextElement, PrintableTextElement } from './TextElement'
import ParagraphOptions from './ParagraphOptions'
import Bounds from '../base/Bounds'
import TextOptions from './TextOptions'
import { Rectangle } from '../combined'
import {
    isNonPrintableTextElement,
    isPrintableTextElement,
} from './TextElement'

export type TextParagraphContent = [
    ...PrintableTextElement[],
    NonPrintableTextElement,
]

/**
 * 文字段落类
 * 表示一个段落，包含多个文字元素 - TODO: 文本装饰的设计与实现
 */
export default class TextParagraph extends Graph {
    public type: GRAPHTYPE = GRAPHTYPE.TEXTPARAGRAPH
    public controlPoints: Point3[]
    public style: Style
    public options: ParagraphOptions
    public texts: TextParagraphContent
    public isLayouted: boolean = false
    public bounds: Bounds
    public transfromOrigin: Point3

    constructor(
        texts: TextParagraphContent = [new NonPrintableTextElement()],
        options: ParagraphOptions = ParagraphOptions.DEFAULT,
        style: Style = Style.DEFAULT
    ) {
        super()
        this.options = options
        this.style = style
        this.texts = texts
        // 初始化时不设置控制点和包围盒，等待布局时设置
        this.controlPoints = []
        this.bounds = Bounds.empty()
        this.transfromOrigin = Point3.orgin
    }

    get length(): number {
        const length = this.texts.filter(
            (text) => text instanceof PrintableTextElement
        ).length
        if (length !== this.texts.length - 1)
            throw new Error(
                'Text length is not equal to the number of printable text elements'
            )
        return length
    }

    // 计算文字段落的包围盒
    public updateBounds(): Bounds {
        // 计算所有文字元素的包围盒
        const bounds = this.texts.map((text) => text.bounds)
        // 加入守卫过后，bounds 至少有一个元素，空段也能正确显示
        const { preHeight, preWidth, postHeight } = this.options
        const unionBounds = Bounds.union(...bounds)
        unionBounds.x -= preWidth
        unionBounds.y -= preHeight
        unionBounds.height += preHeight + postHeight
        unionBounds.width += preWidth
        return unionBounds
    }

    /**
     * 添加文字元素
     */
    addTextElement(textElement: PrintableTextElement): TextParagraph {
        this.texts.splice(this.length, 0, textElement)
        return this
    }

    /**
     * 移除文字元素
     */
    removeTextElement(textElement: PrintableTextElement): TextParagraph {
        const index = this.texts.indexOf(textElement)
        if (index > -1) {
            this.texts.splice(index, 1)
        }
        return this
    }

    /**
     * 清空所有文字元素
     */
    clearTextElements(): TextParagraph {
        this.texts = [new NonPrintableTextElement()]
        return this
    }

    /**
     * 添加文字内容（创建新的TextElement）
     */
    addText(
        content: string,
        index: number = this.texts.length - 1,
        options?: TextOptions
    ): this {
        // 不能在守卫位置添加文字
        if (index < 0 || index >= this.texts.length)
            throw new Error('Index out of bounds')
        const textOptions =
            options || this.texts[Math.max(0, index - 1)].options

        for (let i = 0; i < content.length; i++) {
            const char = content[i]
            const textElement = new PrintableTextElement(
                char,
                textOptions.copy()
            )
            this.texts.splice(index + i, 0, textElement)
        }
        return this
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

    isPointOnCurve(point: Point3, tolerance: number = 1e-6): boolean {
        const bounds = this.bounds
        return new Rectangle(
            bounds.x,
            bounds.y,
            bounds.width,
            bounds.height
        ).isPointOnCurve(point, tolerance)
    }

    public getPointAt(t: number): Point3 {
        const bounds = this.bounds
        const perimeter = 2 * (bounds.width + bounds.height)
        const clampedT = Math.max(0, Math.min(1, t))
        let currentLength = clampedT * perimeter

        // 上边
        if (currentLength <= bounds.width) {
            return new Point3(bounds.x + currentLength, bounds.y, 0)
        }
        currentLength -= bounds.width

        // 右边
        if (currentLength <= bounds.height) {
            return new Point3(
                bounds.x + bounds.width,
                bounds.y + currentLength,
                0
            )
        }
        currentLength -= bounds.height

        // 下边
        if (currentLength <= bounds.width) {
            return new Point3(
                bounds.x + bounds.width - currentLength,
                bounds.y + bounds.height,
                0
            )
        }
        currentLength -= bounds.width

        // 左边
        return new Point3(bounds.x, bounds.y + bounds.height - currentLength, 0)
    }

    public getLength(tStart: number, tEnd: number): number {
        const bounds = this.bounds
        return 2 * (bounds.width + bounds.height) * Math.abs(tEnd - tStart)
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
            t = bounds.width / perimeter
        } else if (
            closestX === bounds.x + bounds.width &&
            closestY === bounds.y + bounds.height
        ) {
            t = (bounds.width + bounds.height) / perimeter
        } else if (
            closestX === bounds.x &&
            closestY === bounds.y + bounds.height
        ) {
            t = (2 * bounds.width + bounds.height) / perimeter
        } else if (closestX === bounds.x && closestY === bounds.y) {
            t = 0
        } else if (closestY === bounds.y) {
            t = (closestX - bounds.x) / perimeter
        } else if (closestX === bounds.x + bounds.width) {
            t = (bounds.width + closestY - bounds.y) / perimeter
        } else if (closestY === bounds.y + bounds.height) {
            t =
                (bounds.width +
                    bounds.height +
                    bounds.width -
                    (closestX - bounds.x)) /
                perimeter
        } else {
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
            // 变换所有文字元素
            for (const textElement of this.texts) {
                textElement.transform(matrix)
            }
            this.bounds = this.updateBounds()
        }
        return this
    }

    /**
     * 计算与另一个图形的相交点
     * @param other 另一个图形
     * @returns 相交点数组（暂未实现）
     */
    public intersect(other: Graph): Point3[] {
        // 暂未实现
        return []
    }

    /**
     * 渲染段落
     */
    public render(ctx: CanvasRenderingContext2D): void {
        ctx.save()
        // 应用样式
        const bounds = this.bounds
        this.style.applyToContext(ctx, bounds.width, bounds.height)
        this.renderPath(ctx, true)
        ctx.strokeStyle = '#bfa'
        ctx.setLineDash([1, 1])
        ctx.lineWidth = 5
        ctx.stroke()

        // 渲染所有文字元素
        for (const textElement of this.texts) {
            textElement.render(ctx)
        }
        ctx.restore()
    }

    /**
     * 复制段落
     */
    public copy(): this {
        const texts = this.texts.map((text) => text.copy())
        if (!isTextParagraphContent(texts))
            throw new Error('The texts is not a valid TextParagraphContent')
        const newParagraph = new TextParagraph(
            texts,
            this.options.copy(),
            this.style.copy()
        )
        // 如果原对象已经布局，则设置position
        if (this.isLayouted) {
            newParagraph.layout(this.controlPoints[0].copy())
        }

        return newParagraph as this
    }

    /**
     * 布局方法 - 在TextView中调用时设置位置和计算包围盒
     */
    public layout(position: Point3): TextParagraph {
        this.isLayouted = true
        this.controlPoints = [position.copy()]
        // 计算包围盒
        this.bounds = this.updateBounds()
        this.transfromOrigin = position.copy()
        return this
    }

    /**
     * 静态工厂方法 - 创建简单段落
     */
    static simple(content: string, options?: ParagraphOptions): TextParagraph {
        const paragraph = new TextParagraph(
            [new NonPrintableTextElement()],
            options
        )
        paragraph.addText(content, 0, TextOptions.DEFAULT)
        return paragraph
    }

    /**
     * 静态工厂方法 - 创建居中对齐段落
     */
    static center(content: string): TextParagraph {
        const options = ParagraphOptions.center()
        const paragraph = new TextParagraph(
            [new NonPrintableTextElement()],
            options
        )
        paragraph.addText(content)
        return paragraph
    }

    public resize(
        fixedPoint: Point3,
        dynamicPoint: Point3,
        resizeVector: Vector3
    ): void {
        this.texts.forEach((text) =>
            text.resize(fixedPoint, dynamicPoint, resizeVector)
        )
    }
}

// 类型守卫函数
export function isTextParagraph(graph: any): graph is TextParagraph {
    return (
        graph !== null &&
        graph !== undefined &&
        graph.type === GRAPHTYPE.TEXTPARAGRAPH
    )
}

export function isTextParagraphContent(
    content: any
): content is TextParagraphContent {
    if (!Array.isArray(content) || content.length === 0) {
        return false
    }

    // 检查最后一个元素是否是 NonPrintableTextElement
    const lastElement = content[content.length - 1]
    if (!isNonPrintableTextElement(lastElement)) {
        return false
    }

    // 检查前面的所有元素（如果有）是否是 PrintableTextElement
    for (let i = 0; i < content.length - 1; i++) {
        if (!isPrintableTextElement(content[i])) {
            return false
        }
    }

    return true
}
