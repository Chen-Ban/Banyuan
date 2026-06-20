import { GraphType } from '@/foundation/constants'
import Graph from '@/graph/base/Graph'
import { MathUtils, Point3, Vector3, Matrix4 } from '@/foundation/math'
import { Style } from '@/foundation/style'
import { NonPrintableTextElement, PrintableTextElement } from './TextElement'
import ParagraphOptions from './ParagraphOptions'
import Bounds from '@/graph/base/Bounds'
import TextOptions from './TextOptions'
import { isGraphType } from '@/foundation/guards'
import type { ITextParagraph } from '@/types/graph/graph'
import type { ISerializable } from '@/types/foundation/serializable'
import type { IDrawingContext } from '@/types/platform/drawing.js'
import { generateId } from '@/foundation/utils'

export type TextParagraphContent = [
    ...PrintableTextElement[],
    NonPrintableTextElement,
]

/**
 * 文字段落类
 * 表示一个段落，包含多个文字元素 - TODO: 文本装饰的设计与实现
 */
export default class TextParagraph extends Graph implements ITextParagraph, ISerializable {
    public type: GraphType = GraphType.TEXTPARAGRAPH
    public controlPoints: Point3[]
    public options: ParagraphOptions
    public texts: TextParagraphContent
    public isLayouted: boolean = false
    public bounds: Bounds

    public isClosed(): boolean {
        return false;
    }

    constructor(
        texts: TextParagraphContent = [new NonPrintableTextElement()],
        options: ParagraphOptions = ParagraphOptions.DEFAULT,
    ) {
        super()
        this.options = options
        this.texts = texts
        // 初始化时不设置控制点和包围盒，等待布局时设置
        this.controlPoints = []
        this.bounds = Bounds.empty()
        this.id = generateId(this.type)
    }

    get length(): number {
        const length = this.texts.filter(
            (text) => text instanceof PrintableTextElement
        ).length
        if (length !== this.texts.length - 1) {
            console.warn(
                '[TextParagraph] Text length is not equal to the number of printable text elements'
            )
        }
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

    public renderPath(ctx: IDrawingContext, dependent: boolean): void {
        dependent && ctx.beginPath()
        const bounds = this.bounds
        ctx.moveTo(bounds.x, bounds.y)
        ctx.lineTo(bounds.x + bounds.width, bounds.y)
        ctx.lineTo(bounds.x + bounds.width, bounds.y + bounds.height)
        ctx.lineTo(bounds.x, bounds.y + bounds.height)
        ctx.lineTo(bounds.x, bounds.y)
    }

    isPointOnCurve(_point: Point3, _tolerance: number = MathUtils.EPSILON): boolean {
        return false
    }

    public getPointAt(_t: number): Point3 {
        return this.controlPoints[0] ?? new Point3(0, 0, 0)
    }

    public getLength(_tStart: number, _tEnd: number): number {
        return 0
    }

    public getTangentAt(_t: number): Vector3 {
        return new Vector3(1, 0, 0)
    }

    public getNormalAt(_t: number): Vector3 {
        return new Vector3(0, 1, 0)
    }

    public getClosestPoint(point: Point3): {
        distance: number
        closestPoint: Point3
        parameter: number
    } {
        return { distance: 0, closestPoint: point, parameter: 0 }
    }

    public getArea(): number {
        return 0
    }

    public getCentroid(): Point3 {
        return this.controlPoints[0] ?? new Point3(0, 0, 0)
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
    public render(ctx: IDrawingContext, style: Style): void {
        ctx.save()
        // 应用样式
        const bounds = this.bounds
        style.applyToContext(ctx, Math.abs(bounds.width), Math.abs(bounds.height))
        this.renderPath(ctx, true)
        ctx.strokeStyle = '#bfa'
        ctx.setLineDash([1, 1])
        ctx.lineWidth = 5
        ctx.stroke()

        // 渲染所有文字元素
        for (const textElement of this.texts) {
            textElement.render(ctx, style)
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
        )
        // 如果原对象已经布局，则设置position
        if (this.isLayouted) {
            newParagraph.applyLayout(this.controlPoints[0].copy())
        }

        return newParagraph as this
    }

    /**
     * 布局方法 - 在TextView中调用时设置位置和计算包围盒
     */
    public applyLayout(position: Point3): TextParagraph {
        this.isLayouted = true
        this.controlPoints = [position.copy()]
        // 计算包围盒
        this.bounds = this.updateBounds()
        return this
    }

    // ── 序列化 ──
    toJSON(): any {
        return {
            id: this.id,
            type: this.type,
            texts: this.texts.map(t => t.toJSON()),
            options: this.options.toJSON(),
        }
    }

    static fromJSON(data: any): TextParagraph {
        const texts = data.texts.map((t: any) => {
            if (t.$class === 'NonPrintableTextElement') {
                return NonPrintableTextElement.fromJSON(t)
            }
            return PrintableTextElement.fromJSON(t)
        }) as TextParagraphContent
        const paragraph = new TextParagraph(
            texts,
            ParagraphOptions.fromJSON(data.options),
        )
        paragraph.id = data.id
        return paragraph
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

  /** 段落不支持顶点编辑 */
  public setControlPoint(_index: number, _point: Point3): void {}
}

// 类型守卫函数
export function isTextParagraphContent(
    content: any
): content is TextParagraphContent {
    if (!Array.isArray(content) || content.length === 0) {
        return false
    }

    // 检查最后一个元素是否是 NonPrintableTextElement
    const lastElement = content[content.length - 1]
    if (!isGraphType(lastElement, GraphType.NONPRINTABLE_TEXTELEMENT)) {
        return false
    }

    // 检查前面的所有元素（如果有）是否是 PrintableTextElement
    for (let i = 0; i < content.length - 1; i++) {
        if (!isGraphType(content[i], GraphType.PRINTABLE_TEXTELEMENT)) {
            return false
        }
    }

    return true
}
