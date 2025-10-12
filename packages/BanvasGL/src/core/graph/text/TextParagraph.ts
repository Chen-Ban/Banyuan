import { GRAPHTYPE, HORIZONTALALIGN } from "@/constants"
import Graph, { GraphOptions } from "@/core/graph/base/Graph"
import { Point3 } from "@/core/math"
import { Style } from "@/core/style"
import TextElement from "./TextElement"
import ParagraphOptions from "./ParagraphOptions"
import Bounds from "../base/Bounds"

/**
 * 文字段落类
 * 表示一个段落，包含多个文字元素
 */
export default class TextParagraph extends Graph {
    public type: GRAPHTYPE = GRAPHTYPE.TEXTPARAGRAPH
    public controlPoints: Point3[] 
    public style: Style
    public options: ParagraphOptions
    public texts: TextElement[]
    public position: Point3
    public isLayouted: boolean = false

    constructor(
        options: ParagraphOptions = ParagraphOptions.DEFAULT,
        style: Style = Style.DEFAULT,
        graphOptions?: GraphOptions
    ) {
        super(graphOptions)
        this.position = new Point3(0, 0, 0) // 初始位置设为原点，等待布局时设置
        this.options = options
        this.style = style
        this.texts = []
        this.controlPoints = [] // 初始化时不设置控制点，等待布局时设置
        // 不计算包围盒，等待布局时计算
    }
    
     // 计算文字段落的包围盒
     protected calculateBounds(): Bounds {
        if (this.texts.length === 0) {
            return Bounds.empty()
        }

        // 计算所有文字元素的包围盒
        const bounds = this.texts.map(text => text.getBounds())
        if (bounds.length === 0) {
            return Bounds.empty()
        }
        
        const unionBounds = Bounds.union(...bounds)
        
        if (this.isLayouted) {
            // 设置控制点（四个角点）
            this.controlPoints = [
                new Point3(unionBounds.x, unionBounds.y, 0), // 左上角
                new Point3(unionBounds.x + unionBounds.width, unionBounds.y, 0), // 右上角
                new Point3(unionBounds.x + unionBounds.width, unionBounds.y + unionBounds.height, 0), // 右下角
                new Point3(unionBounds.x, unionBounds.y + unionBounds.height, 0) // 左下角
            ]
            return unionBounds
        } else {
            return Bounds.empty()
        }
    }


    /**
     * 获取选项
     */
    getOptions(): ParagraphOptions {
        return this.options
    }

    /**
     * 设置选项
     */
    setOptions(options: ParagraphOptions): TextParagraph {
        this.options = options
        return this
    }

    /**
     * 添加文字元素
     */
    addTextElement(textElement: TextElement): TextParagraph {
        this.texts.push(textElement)
        return this
    }

    /**
     * 移除文字元素
     */
    removeTextElement(textElement: TextElement): TextParagraph {
        const index = this.texts.indexOf(textElement)
        if (index > -1) {
            this.texts.splice(index, 1)
        }
        return this
    }

    /**
     * 获取文字元素数量
     */
    getTextElementCount(): number {
        return this.texts.length
    }

    /**
     * 获取指定索引的文字元素
     */
    getTextElement(index: number): TextElement | undefined {
        return this.texts[index]
    }

    /**
     * 清空所有文字元素
     */
    clearTextElements(): TextParagraph {
        this.texts = []
        return this
    }

    /**
     * 添加文字内容（创建新的TextElement）
     */
    addText(
        content: string,
        options?: Partial<{
            color: string
            size: number
            family: string
            style: string
            weight: string
        }>
    ): TextElement[] {
        const textOptions = TextElement.simple('A').options.copy() // 使用单个字符作为模板
        
        // 应用自定义选项
        if (options) {
            if (options.size) textOptions.setSize(options.size)
            if (options.family) textOptions.setFamily(options.family)
            // 这里可以添加更多选项处理
        }
        
        const textElements: TextElement[] = []
        
        // 将字符串拆分成单个字符，为每个字符创建TextElement
        for (let i = 0; i < content.length; i++) {
            const char = content[i]
            const textElement = new TextElement(char, textOptions)
            this.addTextElement(textElement)
            textElements.push(textElement)
        }
        
        return textElements
    }

    public renderPath(ctx: CanvasRenderingContext2D, dependent: Boolean): void {
        dependent && ctx.beginPath()
        ctx.moveTo(this.controlPoints[0].x, this.controlPoints[1].y);
        for (let i = 1; i < this.controlPoints.length; i++) {
            ctx.lineTo(this.controlPoints[i].x, this.controlPoints[i].y);
        }
    }
    /**
     * 渲染段落
     */
    public render(ctx: CanvasRenderingContext2D): void {
        ctx.save()
        // 应用样式
        const bounds = this.getBounds()
        this.style.applyToContext(ctx, bounds.width, bounds.height)
        
        // 渲染所有文字元素
        for (const textElement of this.texts) {
            textElement.render(ctx)
        }
        ctx.restore()
    }

    /**
     * 复制段落
     */
    public copy(): TextParagraph {
        const newParagraph = new TextParagraph(
            this.options.copy(),
            this.style.copy()
        )
        
        // 复制所有文字元素
        for (const textElement of this.texts) {
            newParagraph.addTextElement(textElement.copy())
        }
        
        // 如果原对象已经布局，则设置position
        if (this.isLayouted) {
            newParagraph.position = this.position.copy()
            newParagraph.isLayouted = true
            newParagraph.setBounds(newParagraph.calculateBounds())
        }
        
        return newParagraph
    }

    /**
     * 检查是否是段落
     */
    public isTextParagraph(): boolean {
        return true
    }

    /**
     * 布局方法 - 在TextView中调用时设置位置和计算包围盒
     */
    public layout(position: Point3): TextParagraph {
        this.position = position
        this.isLayouted = true
        // 计算包围盒
        this.setBounds(this.calculateBounds())
        return this
    }

    /**
     * 获取段落内容（所有文字元素的文本）
     */
    getContent(): string {
        return this.texts.map(text => text.getContent()).join('')
    }

    /**
     * 设置段落内容（替换所有文字元素）
     */
    setContent(content: string): TextParagraph {
        this.clearTextElements()
        
        // 简单实现：将整个内容作为一个文字元素
        // 实际应用中可能需要更复杂的文本处理
        const textElement = new TextElement(content)
        this.addTextElement(textElement)
        
        return this
    }

    /**
     * 静态工厂方法 - 创建简单段落
     */
    static simple(
        content: string,
        options?: ParagraphOptions
    ): TextParagraph {
        const paragraph = new TextParagraph(options)
        paragraph.addText(content)
        return paragraph
    }

    /**
     * 静态工厂方法 - 创建标题段落
     */
    static title(
        content: string,
        size: number = 24
    ): TextParagraph {
        const options = ParagraphOptions.title()
        const paragraph = new TextParagraph(options)
        paragraph.addText(content, { size })
        return paragraph
    }

    /**
     * 静态工厂方法 - 创建居中对齐段落
     */
    static center(
        content: string
    ): TextParagraph {
        const options = ParagraphOptions.center()
        const paragraph = new TextParagraph(options)
        paragraph.addText(content)
        return paragraph
    }

    /**
     * 静态工厂方法 - 创建列表项段落
     */
    static listItem(
        content: string,
        decoration?: string
    ): TextParagraph {
        const options = new ParagraphOptions(
            HORIZONTALALIGN.LEFT,
            1.2,
            0,
            0,
            0,
            undefined, // 暂时使用undefined，后续可以添加装饰图形
            20
        )
        const paragraph = new TextParagraph(options)
        paragraph.addText(content)
        return paragraph
    }

   
}
