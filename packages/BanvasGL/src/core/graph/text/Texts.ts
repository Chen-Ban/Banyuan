import { GRAPHTYPE } from "@/constants"
import Graph, { GraphOptions } from "@/core/graph/base/Graph"
import { Point3 } from "@/core/math"
import { Style } from "@/core/style"
import TextParagraph from "./TextParagraph"
import TextsOptions from "./TextsOptions"
import Bounds from "../base/Bounds"

/**
 * 文字集合类
 * 表示一个完整的文字集合，包含多个段落
 */
export default class Texts extends Graph {
    public type: GRAPHTYPE = GRAPHTYPE.TEXTS
    public controlPoints: Point3[] 
    public style: Style
    public options: TextsOptions
    public paragraphs: TextParagraph[]
    public position: Point3
    public isLayouted: boolean = false

    constructor(
        paragraphs: TextParagraph | TextParagraph[] = [],
        options: TextsOptions = TextsOptions.DEFAULT,
        style: Style = Style.DEFAULT,
        graphOptions?: GraphOptions
    ) {
        super(graphOptions)
        this.position = new Point3(0, 0, 0) // 初始位置设为原点，等待布局时设置
        this.options = options
        this.style = style
        this.controlPoints = [] // 初始化时不设置控制点，等待布局时设置
        
        // 处理段落参数
        if (Array.isArray(paragraphs)) {
            this.paragraphs = [...paragraphs]
        } else {
            this.paragraphs = [paragraphs]
        }
        
        // 不计算包围盒，等待布局时计算
    }


    /**
     * 获取选项
     */
    getOptions(): TextsOptions {
        return this.options
    }

    /**
     * 设置选项
     */
    setOptions(options: TextsOptions): Texts {
        this.options = options
        return this
    }

    /**
     * 计算边界框
     */
    protected calculateBounds(): Bounds {
        if (this.paragraphs.length === 0) {
            return Bounds.empty()
        }
        
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        
        for (const paragraph of this.paragraphs) {
            const bounds = paragraph.getBounds()
            if (bounds) {
                minX = Math.min(minX, bounds.x)
                minY = Math.min(minY, bounds.y)
                maxX = Math.max(maxX, bounds.x + bounds.width)
                maxY = Math.max(maxY, bounds.y + bounds.height)
            }
        }

        const resultBounds = new Bounds(minX, minY, maxX - minX, maxY - minY)
        
        if (this.isLayouted) {
            // 设置控制点（四个角点）
            this.controlPoints = [
                new Point3(resultBounds.x, resultBounds.y, 0), // 左上角
                new Point3(resultBounds.x + resultBounds.width, resultBounds.y, 0), // 右上角
                new Point3(resultBounds.x + resultBounds.width, resultBounds.y + resultBounds.height, 0), // 右下角
                new Point3(resultBounds.x, resultBounds.y + resultBounds.height, 0) // 左下角
            ]
            return resultBounds
        } else {
            // 未布局时返回x:0,y:0,height:实际高度,width:实际宽度
            return new Bounds(0, 0, resultBounds.width, resultBounds.height)
        }
    }

    /**
     * 添加段落
     */
    addParagraph(paragraph: TextParagraph): Texts {
        this.paragraphs.push(paragraph)
        return this
    }

    /**
     * 移除段落
     */
    removeParagraph(paragraph: TextParagraph): Texts {
        const index = this.paragraphs.indexOf(paragraph)
        if (index > -1) {
            this.paragraphs.splice(index, 1)
        }
        return this
    }

    /**
     * 获取段落数量
     */
    getParagraphCount(): number {
        return this.paragraphs.length
    }

    /**
     * 获取指定索引的段落
     */
    getParagraph(index: number): TextParagraph | undefined {
        return this.paragraphs[index]
    }

    /**
     * 清空所有段落
     */
    clearParagraphs(): Texts {
        this.paragraphs = []
        return this
    }

    /**
     * 添加文字段落（创建新的TextParagraph）
     */
    addTextParagraph(
        content: string,
        options?: any
    ): TextParagraph {
        const paragraph = TextParagraph.simple(content, options)
        this.addParagraph(paragraph)
        return paragraph
    }

    public renderPath(ctx: CanvasRenderingContext2D, dependent: Boolean): void {
        dependent && ctx.beginPath()
        ctx.moveTo(this.controlPoints[0].x, this.controlPoints[1].y);
        for (let i = 1; i < this.controlPoints.length; i++) {
            ctx.lineTo(this.controlPoints[i].x, this.controlPoints[i].y);
        }
    }

    /**
     * 渲染文字集合
     */
    public render(ctx: CanvasRenderingContext2D): void {
        ctx.save()
        // 应用样式
        this.style.applyToContext(ctx)
        
        // 渲染所有段落
        for (const paragraph of this.paragraphs) {
            paragraph.render(ctx)
        }
        ctx.restore()
    }

    /**
     * 复制文字集合
     */
    public copy(): this {
        // 复制所有段落
        const copiedParagraphs = this.paragraphs.map(paragraph => paragraph.copy())
        
        const newTexts = new Texts(
            copiedParagraphs,
            this.options.copy(),
            this.style.copy()
        )
        
        // 如果原对象已经布局，则设置position
        if (this.isLayouted) {
            newTexts.position = this.position.copy()
            newTexts.isLayouted = true
            newTexts.setBounds(newTexts.calculateBounds())
        }
        
        return newTexts as this
    }

    /**
     * 检查是否是文字集合
     */
    public isTexts(): boolean {
        return true
    }

    /**
     * 获取所有文字内容
     */
    getAllContent(): string {
        return this.paragraphs.map(paragraph => paragraph.getContent()).join('\n')
    }

    /**
     * 设置所有文字内容（替换所有段落）
     */
    setAllContent(content: string): Texts {
        this.clearParagraphs()
        
        // 简单实现：将整个内容作为一个段落
        // 实际应用中可能需要更复杂的文本处理（如按换行符分割）
        const lines = content.split('\n')
        let currentY = this.position.y
        
        for (const line of lines) {
            if (line.trim()) {
                this.addTextParagraph(line)
                currentY += 30 // 简单的行间距
            }
        }
        
        return this
    }

    /**
     * 获取总字符数
     */
    getTotalCharacterCount(): number {
        return this.paragraphs.reduce((total, paragraph) => {
            return total + paragraph.getContent().length
        }, 0)
    }

    /**
     * 获取总文字元素数
     */
    getTotalTextElementCount(): number {
        return this.paragraphs.reduce((total, paragraph) => {
            return total + paragraph.getTextElementCount()
        }, 0)
    }

    /**
     * 静态工厂方法 - 创建简单文字集合
     */
    static simple(
        content: string,
        options?: TextsOptions
    ): Texts {
        const paragraph = TextParagraph.simple(content)
        const texts = new Texts(paragraph, options)
        return texts
    }

    /**
     * 静态工厂方法 - 创建多行文字集合
     */
    static multiline(
        content: string,
        lineHeight: number = 30,
        options?: TextsOptions
    ): Texts {
        const paragraphs: TextParagraph[] = []
        const lines = content.split('\n')
        
        for (const line of lines) {
            if (line.trim()) {
                paragraphs.push(TextParagraph.simple(line))
            }
        }
        
        return new Texts(paragraphs, options)
    }

    /**
     * 静态工厂方法 - 创建居中对齐文字集合
     */
    static center(
        content: string
    ): Texts {
        const options = TextsOptions.center()
        const paragraph = TextParagraph.center(content)
        const texts = new Texts(paragraph, options)
        return texts
    }

    /**
     * 静态工厂方法 - 创建标题文字集合
     */
    static title(
        content: string,
        size: number = 24
    ): Texts {
        const paragraph = TextParagraph.title(content, size)
        return new Texts(paragraph)
    }

    /**
     * 静态工厂方法 - 创建列表文字集合
     */
    static list(
        items: string[],
        itemHeight: number = 30
    ): Texts {
        const paragraphs: TextParagraph[] = []
        
        for (const item of items) {
            paragraphs.push(TextParagraph.listItem(item))
        }
        
        return new Texts(paragraphs)
    }

    /**
     * 布局方法 - 在TextView中调用时设置位置和计算包围盒
     */
    public layout(position: Point3): Texts {
        this.position = position
        this.isLayouted = true
        // 计算包围盒
        this.setBounds(this.calculateBounds())
        return this
    }
}
