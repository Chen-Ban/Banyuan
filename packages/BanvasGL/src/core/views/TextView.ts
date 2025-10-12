import View, { ViewOptions } from './View'
import { Texts } from '../graph/text'
import TextParagraph from '../graph/text/TextParagraph'
import TextElement from '../graph/text/TextElement'
import CanvasContext from '../renderer/CanvasContext'
import { Rectangle } from '../graph/combined/Polygon'
import { Point3 } from '../math'
import Selection from './Selection'
import { VIEWTYPE } from '@/constants'

// 文本视图选项接口
export interface TextViewOptions extends Omit<ViewOptions, 'content'> {
    layoutArea?: Rectangle
    underLine?: Rectangle
    deleteLine?: Rectangle
    selection?: Selection
    fixedHeight?: Boolean
    fixedWidth?: Boolean
    shouldLayout?: Boolean
}

/**
 * 文本视图 - 专门处理Texts类型内容
 */
export default class TextView extends View {
    public readonly type: VIEWTYPE = VIEWTYPE.TEXSTVIEW
    public children: View<any>[] | null = null

    public content: Texts
    public layoutArea: Rectangle | undefined
    public underLine: Rectangle | undefined
    public deleteLine: Rectangle | undefined
    public selection: Selection
    public fixedHeight: Boolean
    public fixedWidth: Boolean
    public shouldLayout: Boolean

    constructor(text: Texts, options: TextViewOptions = {}) {
        // 将text作为content传递给父类构造函数
        super({ ...options, content: text })
        this.content = text
        
        // 初始化TextView特有的属性
        this.layoutArea = options?.layoutArea
        this.underLine = options?.underLine
        this.deleteLine = options?.deleteLine
        this.selection = new Selection()
        this.fixedHeight = !!options?.fixedHeight
        this.fixedWidth = !!options?.fixedWidth
        this.shouldLayout = !!options?.shouldLayout
        
        // 如果设置了layoutArea，更新bounds
        if (this.layoutArea) {
            this.updateBoundsFromLayoutArea()
            // 执行布局
            this.layout()
            //计算包围盒
            this.initBoundingBox()
            this.initBoundingBox()
        }
    }

    public renderContent(ctx: CanvasRenderingContext2D): void {
        // 渲染文本内容
        if (this.content && typeof this.content.render === 'function') {
            this.content.render(ctx)
        }
        
        // 渲染选择区域
        this.selection.render(ctx)
    }

    public interact(p: Point3):TextElement {
        return this.content.paragraphs[0].texts[0]
    }

    /**
     * 处理输入事件
     */
    public input(e: InputEvent): void {
        // TODO: 实现输入处理逻辑
        console.log('TextView input event:', e)
    }

    /**
     * 将点坐标转换为文本索引
     * @param p 点坐标
     * @returns [行索引, 字符索引]
     */
    private point2Index(p: Point3): [number, number] {
        // TODO: 实现点坐标到文本索引的转换
        // 这里需要根据文本布局计算点击位置对应的行和字符索引
        return [0, 0]
    }

    /**
     * 执行文本布局
     */
    private layout(): void {
        if (!this.content) {
            return
        }
        if (!this.layoutArea) {
            console.warn('LayoutArea is not set, cannot perform layout')
            return
        }
        
        // 执行深度优先搜索布局
        this.layoutTexts(this.content, this.layoutArea)
        this.shouldLayout = false
        
    }


    /**
     * 布局Texts - 前序遍历，处理整个文本集合
     */
    private layoutTexts(texts: Texts, layoutArea: Rectangle): void {
        
        // 从layoutArea左上角开始布局
        let currentY = layoutArea.getTopLeft().y
        
        // 遍历所有段落进行布局
        for (const paragraph of texts.paragraphs) {
            this.layoutParagraph(paragraph, layoutArea.getTopLeft().x, currentY, layoutArea.width)
            const paragraphBounds = paragraph.getBounds()
            if (paragraphBounds) {
                currentY += paragraphBounds.height + paragraph.options.postHeight
            }
        }
        // 设置Texts的布局状态（先设置位置，再调整对齐）
        texts.layout(new Point3(layoutArea.getTopLeft().x, layoutArea.getTopLeft().y, 0))
        
        // 根据Texts的垂直对齐方式调整整体位置
        this.adjustTextsVerticalAlignment(texts, layoutArea)
        
    }

    /**
     * 布局TextParagraph - 处理单个段落
     */
    private layoutParagraph(paragraph: TextParagraph, startX: number, startY: number, maxWidth: number): void {
        // 计算基于首字符宽度的缩进
        const indentationWidth = this.calculateIndentationWidth(paragraph)
        
        // 考虑段落的前宽度，但不在这里加缩进
        const actualStartX = startX + paragraph.options.preWidth
        const actualMaxWidth = maxWidth - paragraph.options.preWidth
        
        // 布局段落内的所有TextElement，传递缩进信息
        this.layoutTextElementsInParagraph(paragraph, actualStartX, startY, actualMaxWidth, indentationWidth)
        
        // 设置段落的布局状态（先设置位置，再调整对齐）
        paragraph.layout(new Point3(actualStartX, startY, 0))
        
        // 根据段落的水平对齐方式调整段落内元素位置
        this.adjustParagraphHorizontalAlignment(paragraph, actualStartX, actualMaxWidth)
    }

    /**
     * 布局段落内的TextElement - 处理换行和字符间距
     */
    private layoutTextElementsInParagraph(paragraph: TextParagraph, startX: number, startY: number, maxWidth: number, indentationWidth: number = 0): void {
        // 第一步：根据字体宽度进行分行
        const lines = this.breakTextIntoLines(paragraph, startX, maxWidth, indentationWidth)
        // 第二步：计算每行的行高和位置
        let currentY = startY + paragraph.options.preHeight
        
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex]
            
            // 计算当前行的行高（基于leading）
            const lineHeight = this.calculateLineHeight(line, paragraph.options.leading)
            
            // 计算当前行的基线位置（文字基于行底部对齐）
            const baselineY = currentY + lineHeight
            
            // 第三步：设置该行所有TextElement的位置
            let currentX = line.startX
            
            for (const textElement of line.elements) {
                // 文字基于行底部对齐：基线位置 - 文字高度
                const y = baselineY - textElement.getActualHeight()
                
                const position = new Point3(currentX, y, 0)
                textElement.layout(position)
                
                // 更新X位置
                currentX += textElement.getActualWidth() + paragraph.options.letterSpacing
            }
            
            // 更新Y位置到下一行
            currentY += lineHeight
        }
    }

    /**
     * 将文本元素分行
     */
    private breakTextIntoLines(paragraph: TextParagraph, startX: number, maxWidth: number, indentationWidth: number = 0): Array<{elements: TextElement[], startX: number}> {
        const lines: Array<{elements: TextElement[], startX: number}> = []
        
        // 边界条件：空段落
        if (paragraph.texts.length === 0) {
            return lines
        }
        
        let currentLine: TextElement[] = []
        let currentX = startX + indentationWidth // 第一行加上缩进
        let isFirstLine = true
        
        for (const textElement of paragraph.texts) {
            const actualWidth = textElement.getActualWidth()
            
            // 边界条件：单个文字宽度超过布局区域
            // 如果当前行是空的，但文字宽度超过可用空间，仍然要添加这个文字
            if (currentLine.length === 0) {
                // 当前行为空，直接添加文字（即使超出边界）
                currentLine.push(textElement)
                currentX += actualWidth + paragraph.options.letterSpacing
            } else {
                // 当前行不为空，检查是否需要换行
                if (currentX + actualWidth > startX + maxWidth) {
                    // 保存当前行
                    lines.push({
                        elements: currentLine,
                        startX: isFirstLine ? startX + indentationWidth : startX
                    })
                    
                    // 开始新行
                    currentLine = [textElement]
                    currentX = startX + actualWidth + paragraph.options.letterSpacing
                    isFirstLine = false
                } else {
                    // 添加到当前行
                    currentLine.push(textElement)
                    currentX += actualWidth + paragraph.options.letterSpacing
                }
            }
        }
        
        // 添加最后一行
        if (currentLine.length > 0) {
            lines.push({
                elements: currentLine,
                startX: isFirstLine ? startX + indentationWidth : startX
            })
        }
        
        return lines
    }

    /**
     * 计算行的行高
     */
    private calculateLineHeight(line: {elements: TextElement[], startX: number}, leading: number): number {
        if (line.elements.length === 0) {
            return 0
        }
        
        // 找到该行中最大的字体大小
        const maxFontSize = Math.max(...line.elements.map(element => element.options.size))
        
        // 行高 = 字体大小 * leading
        return maxFontSize * leading
    }

    /**
     * 调整段落的水平对齐
     */
    private adjustParagraphHorizontalAlignment(paragraph: TextParagraph, startX: number, maxWidth: number): void {
        const paragraphBounds = paragraph.getBounds()
        if (!paragraphBounds) return
        
        let offsetX = 0
        
        switch (paragraph.options.verticalAlign) {
            case 'CENTER':
                offsetX = (maxWidth - paragraphBounds.width) / 2
                break
            case 'RIGHT':
                offsetX = maxWidth - paragraphBounds.width
                break
            case 'LEFT':
            default:
                offsetX = 0
                break
        }
        
        // 调整段落内所有TextElement的位置
        for (const textElement of paragraph.texts) {
            const currentPos = textElement.getPosition()
            textElement.layout(new Point3(currentPos.x + offsetX, currentPos.y, currentPos.z))
        }
    }

    /**
     * 调整Texts的垂直对齐
     */
    private adjustTextsVerticalAlignment(texts: Texts, layoutArea: Rectangle): void {
        const textsBounds = texts.getBounds()
        if (!textsBounds) return
        
        let offsetY = 0
        
        switch (texts.options.verticalAlign) {
            case 'MIDDLE':
                offsetY = (layoutArea.height - textsBounds.height) / 2
                break
            case 'BOTTOM':
                offsetY = layoutArea.height - textsBounds.height
                break
            case 'TOP':
            default:
                offsetY = 0
                break
        }
        
        // 调整所有段落的位置
        for (const paragraph of texts.paragraphs) {
            const currentPos = paragraph.position
            paragraph.layout(new Point3(currentPos.x, currentPos.y + offsetY, currentPos.z))
        }
    }

    /**
     * 计算基于首字符宽度的缩进
     */
    private calculateIndentationWidth(paragraph: TextParagraph): number {
        if (paragraph.texts.length === 0) {
            return 0
        }
        
        // 获取首字符
        const firstTextElement = paragraph.texts[0]
        
        // 使用缓存的宽度，不再需要Canvas上下文
        const firstCharWidth = firstTextElement.getActualWidth()
        
        // 根据段落选项中的indentation值（作为倍数）计算实际缩进宽度
        return firstCharWidth * paragraph.options.indentation
    }

    /**
     * 设置选择框
     */
    public setSelectionBoxs(): void {
        // TODO: 根据当前选择状态设置选择框
        // 这里需要根据文本选择范围计算选择框的位置和大小
        this.selection.setSelectionBoxs([])
    }

    /**
     * 检查是否为文本视图
     */
    public isTextView(): Boolean {
        return true
    }

    // 1、供view初始化调用，再textView初始化最后会根据layoutArea更新包围盒和视口插件
    // 2、供视口裁剪判断调用
    public getContentBounds(): { x: number, y: number, width: number, height: number }  {
        if(this.layoutArea) {
            return this.layoutArea.getBounds()
        }
        return {
            x: 0,
            y: 0,
            width: 0, 
            height: 0 
        }
    }

    /**
     * 设置布局区域并更新视口插件
     */
    public setLayoutArea(layoutArea: Rectangle): void {
        this.layoutArea = layoutArea
        this.updateBoundsFromLayoutArea()
    }

    /**
     * 根据layoutArea更新bounds和视口插件
     */
    private updateBoundsFromLayoutArea(): void {
        if (this.layoutArea && this.boundingBox && this.viewport) {
            const bounds = this.layoutArea.getBounds()
            console.log(bounds);
            
            
            const viewWidth = Math.max(0, bounds.x + bounds.width)
            const viewHeight = Math.max(0, bounds.y + bounds.height)
        
            // 更新boundingBox的尺寸
            this.boundingBox.width = viewWidth
            this.boundingBox.height = viewHeight
            
            // 更新视口插件的尺寸
            this.viewport.width = viewWidth
            this.viewport.height = viewHeight
        }
    }

    public copy(): TextView {
        const newView = new TextView(this.content)
        
        // 复制基本属性
        newView.layer = this.layer
        newView.id = this.id
        newView.properties = { ...this.properties }
        newView.data = { ...this.data }
        newView.style = this.style.copy()
        newView.selected = this.selected
        newView.actived = this.actived
        newView.freezed = this.freezed
        newView.visible = this.visible
        newView.matrix = this.matrix.copy()

        // 复制TextView特有属性
        newView.layoutArea = this.layoutArea
        newView.underLine = this.underLine
        newView.deleteLine = this.deleteLine
        newView.fixedHeight = this.fixedHeight
        newView.fixedWidth = this.fixedWidth
        newView.shouldLayout = this.shouldLayout
        
        // 复制选择区域
        newView.selection = new Selection()
        newView.selection.setSelectionBoxs(this.selection.getSelectionBoxs())

        // 复制插件
        if (this.viewport) {
            newView.viewport = { ...this.viewport }
        }
        if (this.controlPoints) {
            newView.controlPoints = { ...this.controlPoints }
        }
        if (this.boundingBox) {
            newView.boundingBox = { ...this.boundingBox }
        }

        return newView
    }


}
