import View, { ViewOptions, ViewContent } from './View'
import { Texts } from '../graph/text'
import TextParagraph from '../graph/text/TextParagraph'
import TextElement from '../graph/text/TextElement'
import CanvasContext from '../renderer/CanvasContext'
import { Rectangle } from '../graph/combined/Polygon'
import { MathUtils, Point3 } from '../math'
import { world2Relative } from '@/utils/utils'
import { getGlobalCanvasContext } from '../renderer/CanvasContext'
import { ViewAddonImpl, InteractionResult, InteractionResultBuilder } from './addon'
import Selection from './Selection'
import { VIEWTYPE } from '@/constants'
import { PointUtils } from '../utils/PointUtils'
import { Color, StrokeStyle, Style } from '../style'
import { Line } from '../graph'

// 文本视图选项接口
export interface TextViewOptions extends Omit<ViewOptions, 'content'> {
    layoutArea?: Rectangle
    underLine?: Rectangle
    deleteLine?: Rectangle
    selection?: Selection
    fixedHeight?: Boolean
    fixedWidth?: Boolean
    shouldLayout?: Boolean
    fixedIndex?: TextIndex
    dynamicIndex?: TextIndex
}

export type TextIndex = [number,number]

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
    public fixedIndex: TextIndex | undefined
    public dynamicIndex: TextIndex | undefined

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
        this.fixedIndex = options?.fixedIndex 
        this.dynamicIndex = options?.dynamicIndex
        
        // 如果设置了layoutArea，更新bounds
        if (this.layoutArea) {
            this.updateBoundsFromLayoutArea()
            // 执行布局
            this.layout()
            //计算包围盒
            this.initBoundingBox()
            this.initBoundingBox()

            this.setSelection(this.fixedIndex,this.dynamicIndex)
        }
    }

    public renderContent(ctx: CanvasRenderingContext2D): void {
        // 渲染文本内容
        if (this.content && typeof this.content.render === 'function' && this.layoutArea) {
            this.layoutArea.render(ctx)
            this.content.render(ctx)
        }
        
        // 渲染选择区域
        this.selection.render(ctx)
    }

    public interact(p: Point3): { view: View | null, content: ViewContent | ViewAddonImpl | null } {
        if(!this.layoutArea)throw new Error('请在布局后交互')
        const relativePoint = world2Relative(p, this.matrix)
        const ctx = getGlobalCanvasContext()?.getBufferContext()
        if (!ctx) throw new Error('交互失败')
        
        const builder = new InteractionResultBuilder()

        // 命中控制点
        if (this.actived && this.controlPoints) {
            const hitCP = this.controlPoints.vertices.some(v => v.subtract(relativePoint).length < 5)
            if (hitCP) {
                return builder.add(this, this.controlPoints).build()
            }
        }

        // 命中文本内容 
        const hitTexts = this.content.isPointInPath(ctx,relativePoint)
        const hitLayout = this.layoutArea?.isPointInPath(ctx,relativePoint)
        if(hitLayout || hitTexts){
            for (const paragraph of this.content.paragraphs) {
                const hitPara = paragraph.isPointInPath(ctx, relativePoint)
                if (hitPara) {
                    // 深入到文字元素
                    for (const t of paragraph.texts) {
                        const tb = t.getBounds()
                        const tRect = new Rectangle(tb.x, tb.y, tb.width, tb.height)
                        const hitText = tRect.isPointInPath(ctx,relativePoint)
                        if (hitText) {
                            return builder.add(this, t).build()
                        }
                    }
                    // 行前行后的空隙中，探测左右
                    const ts = paragraph.texts
                    const len = ts.length
                    const [s,_,__,e] = ts[0].controlPoints
                    const t = MathUtils.distancePointToLineSegment(relativePoint,s,e,false) !== Infinity ?ts[0]:ts[len-1]
                    return builder.add(this, t).build()
                }
            }
            // 如果鼠标落在了段落之间探测上下
            
            const pIndex = this.content.paragraphs.findIndex(p=>p.controlPoints[0].y > relativePoint.y) - 1
            const p = this.content.paragraphs[pIndex]
            const ts = p.texts.filter(t=>t.controlPoints[0].y === p.texts[p.texts.length - 1].controlPoints[0].y)
            let tIndex = ts.findIndex(t=>t.controlPoints[0].x > relativePoint.x)
            tIndex = tIndex === -1 ? ts.length - 1 : tIndex - 1
            const t = ts[tIndex]
            return builder.add(this,t).build()
        }

        // 命中边界框（移动/缩放）
        if (this.actived && this.boundingBox) {
            const isMoving = this.boundingBox.region.graphs.some(edge => edge.distanceToPoint(relativePoint) < 5)
            const isResizing = this.boundingBox.handles.some(rec => rec.graphs.some(edge => edge.distanceToPoint(relativePoint) < 5))
            if (isMoving || isResizing) {
                return builder.add(this, this.boundingBox).build()
            }
        }

        return builder.build()
    }

    /**
     * 处理输入事件
     */
    public input(e: InputEvent): void {

    }

    /**
     * 设置选择框
     */
    public setSelection(fixedIndex:TextIndex | undefined,dynamicIndex?:TextIndex): void {
        const fixed = dynamicIndex ? fixedIndex : this.fixedIndex
        const dynamic = dynamicIndex ?? fixedIndex
        // 如果为undefined则表示未选中某一个序列，不出现光标
        if(!fixed || !dynamic){
            this.selection.setSelectionBoxs([])
            return
        }

        const start = fixed[0] < dynamic[0] ? fixed : fixed[0] > dynamic[0] ? dynamic : fixed[1] < dynamic[1] ? fixed : dynamic
        const end = start === fixed ? dynamic : fixed
        
        // 获取范围内所有rect
        const boxs = []
        for(let i = start[0]; i <= end[0]; i++){
            const _start = i === start[0] ? start[1] : 0
            const length = this.content.paragraphs[i].texts.length
            const _end = i === end[0] ? Math.min(end[1],length) : length
            for(let j = _start; j < _end; j++){
                const ps = this.content.paragraphs[i].texts[j].controlPoints 
                const p = ps[0]
                const width = PointUtils.distance(ps[0],ps[1])
                const height = PointUtils.distance(ps[1],ps[2])
                const box = new Rectangle(p.x,p.y,width,height)
                boxs.push(box)
            }
        }

        if(boxs.length === 0 ){
            const [i,j] = start
            const length = this.content.paragraphs[i].texts.length
            const _j = length <= j ? length - 1 : j
            const ps = this.content.paragraphs[i].texts[_j].controlPoints 
            const p = ps[1]
            const width = 2
            const height = PointUtils.distance(ps[1],ps[2])
            const box = new Rectangle(p.x,p.y,width,height)
            boxs.push(box)
        }

        

        this.selection.setSelectionBoxs(boxs)
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
                currentY += paragraphBounds.height +paragraph.options.preHeight+ paragraph.options.postHeight
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

        const actualStartY = startY + paragraph.options.preHeight
        
        
        // 布局段落内的所有TextElement，传递缩进信息
        this.layoutTextElementsInParagraph(paragraph, actualStartX, actualStartY, actualMaxWidth, indentationWidth)
        
        // 设置段落的布局状态（先设置位置，再调整对齐）
        paragraph.layout(new Point3(actualStartX, actualStartY, 0))
        
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
        let currentY = startY 
        
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex]
            
            // 计算当前行的行高（基于leading）
            const lineHeight = this.calculateLineHeight(line, paragraph.options.leading)
            
            // 第三步：设置该行所有TextElement的位置
            let currentX = line.startX
            
            for (const textElement of line.elements) {
                
                const position = new Point3(currentX, currentY, 0)
                textElement.layout(position)
                textElement.height = lineHeight
                
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
            
            const viewWidth = Math.max(0, bounds.x + bounds.width)
            const viewHeight = Math.max(0, bounds.y + bounds.height)
        
            // 更新boundingBox的尺寸
            this.boundingBox.setSize(viewWidth, viewHeight)
            
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
            newView.viewport = this.viewport.copy()
        }
        if (this.controlPoints) {
            newView.controlPoints = this.controlPoints.copy()
        }
        if (this.boundingBox) {
            newView.boundingBox = this.boundingBox.copy()
        }

        return newView
    }


}
