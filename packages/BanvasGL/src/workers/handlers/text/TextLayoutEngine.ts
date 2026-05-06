/**
 * TextLayoutEngine - Worker 端文本布局计算引擎
 *
 * 完整复刻 TextFields.layout() 的逻辑，但基于纯数据操作：
 * 1. 批量测量所有字符宽度（通过 FontMeasurer）
 * 2. 贪心分行（breakTextIntoLines）
 * 3. 行内定位（计算每个字符的 x, y）
 * 4. 水平对齐调整
 * 5. 垂直对齐调整
 *
 * 与主线程 TextFields 的对应关系：
 * - TextFields.layout() → TextLayoutEngine.compute()
 * - TextFields.layoutParagraphs() → computeLayout()
 * - TextFields.layoutParagraph() → layoutParagraph()
 * - TextFields.layoutTextElementsInParagraph() → layoutElementsInParagraph()
 * - TextFields.breakTextIntoLines() → breakIntoLines()
 * - TextFields.adjustParagraphHorizontalAlignment() → adjustHorizontalAlign()
 * - TextFields.adjustParagraphVerticalAlignment() → adjustVerticalAlign()
 */

import FontMeasurer from './FontMeasurer'
import type {
    TextLayoutInput,
    TextLayoutOutput,
    ParagraphData,
    TextElementData,
    TextElementLayoutResult,
    ParagraphLayoutResult,
    BoundsData,
    LayoutAreaData,
    HorizontalAlign,
    VerticalAlign,
} from './types'

/** 内部行结构 */
interface LayoutLine {
    elements: MeasuredElement[]
    startX: number
}

/** 测量后的元素（带宽高信息） */
interface MeasuredElement {
    id: string
    char: string
    width: number
    height: number
    fontSize: number
    letterSpacing: number
    isNonPrintable: boolean
}

export default class TextLayoutEngine {
    private measurer: FontMeasurer

    constructor() {
        this.measurer = FontMeasurer.getInstance()
    }

    /**
     * 执行完整的文本布局计算
     * 对应主线程 TextFields.layout()
     */
    compute(input: TextLayoutInput): TextLayoutOutput {
        const { paragraphs, layoutArea, verticalAlign, fixedWidth } = input

        // 第一步：批量测量所有字符
        const measuredParagraphs = this.measureAllElements(paragraphs)

        // 第二步：确定实际布局宽度
        const actualLayoutArea = { ...layoutArea }
        if (!fixedWidth) {
            const widths = measuredParagraphs.map((mp, i) => {
                const totalWidth = mp.elements.reduce(
                    (sum, el) => sum + el.width + el.letterSpacing,
                    0
                )
                const preWidth = paragraphs[i].options.preWidth
                const indentWidth = i === 0
                    ? this.calculateIndentationWidth(mp.elements, paragraphs[i].options.indentation)
                    : 0
                return totalWidth + preWidth + indentWidth
            })
            const maxWidth = Math.max(...widths, 0)
            actualLayoutArea.width = Math.sign(actualLayoutArea.width) * maxWidth
        }

        // 第三步：执行布局
        const paragraphResults = this.computeLayout(
            measuredParagraphs,
            paragraphs,
            actualLayoutArea,
            verticalAlign
        )

        // 第四步：计算整体包围盒
        const bounds = this.computeOverallBounds(paragraphResults)

        return { paragraphs: paragraphResults, bounds }
    }

    /**
     * 批量测量所有段落中的字符
     */
    private measureAllElements(
        paragraphs: ParagraphData[]
    ): Array<{ elements: MeasuredElement[] }> {
        return paragraphs.map((paragraph) => {
            const elements: MeasuredElement[] = paragraph.elements.map((el) => {
                if (el.isNonPrintable) {
                    // 不可打印元素固定尺寸
                    return {
                        id: el.id,
                        char: el.char,
                        width: 2,
                        height: 0,
                        fontSize: el.fontSize,
                        letterSpacing: el.letterSpacing,
                        isNonPrintable: true,
                    }
                }

                // 使用 FontMeasurer 测量
                const measurement = this.measurer.measureChar(
                    el.char,
                    el.fontString,
                    el.fontSize
                )

                return {
                    id: el.id,
                    char: el.char,
                    width: measurement.width,
                    height: measurement.height,
                    fontSize: el.fontSize,
                    letterSpacing: el.letterSpacing,
                    isNonPrintable: false,
                }
            })

            return { elements }
        })
    }

    /**
     * 执行段落布局
     * 对应 TextFields.layoutParagraphs()
     */
    private computeLayout(
        measuredParagraphs: Array<{ elements: MeasuredElement[] }>,
        paragraphDatas: ParagraphData[],
        layoutArea: LayoutAreaData,
        verticalAlign: VerticalAlign
    ): ParagraphLayoutResult[] {
        const results: ParagraphLayoutResult[] = []
        let currentY = layoutArea.y

        for (let i = 0; i < measuredParagraphs.length; i++) {
            const measured = measuredParagraphs[i]
            const paragraphData = paragraphDatas[i]

            const result = this.layoutParagraph(
                measured.elements,
                paragraphData,
                layoutArea.x,
                currentY,
                layoutArea.width
            )

            results.push(result)

            // 计算段落高度，推进 Y
            const pBounds = this.computeParagraphBounds(result, paragraphData.options)
            currentY += pBounds.height
        }

        // 垂直对齐调整
        this.adjustVerticalAlign(results, paragraphDatas, layoutArea, verticalAlign)

        return results
    }

    /**
     * 布局单个段落
     * 对应 TextFields.layoutParagraph()
     */
    private layoutParagraph(
        elements: MeasuredElement[],
        paragraphData: ParagraphData,
        startX: number,
        startY: number,
        maxWidth: number
    ): ParagraphLayoutResult {
        const opts = paragraphData.options
        const indentationWidth = this.calculateIndentationWidth(elements, opts.indentation)

        const actualStartX = startX + opts.preWidth
        const actualMaxWidth = maxWidth - opts.preWidth
        const actualStartY = startY + opts.preHeight

        // 布局元素
        const elementResults = this.layoutElementsInParagraph(
            elements,
            actualStartX,
            actualStartY,
            actualMaxWidth,
            indentationWidth,
            opts.leading
        )

        // 水平对齐调整
        this.adjustHorizontalAlign(elementResults, opts.horizontalAlign, maxWidth)

        return {
            id: paragraphData.id,
            x: startX,
            y: startY,
            elements: elementResults,
        }
    }

    /**
     * 布局段落内的元素（分行 + 定位）
     * 对应 TextFields.layoutTextElementsInParagraph()
     */
    private layoutElementsInParagraph(
        elements: MeasuredElement[],
        startX: number,
        startY: number,
        maxWidth: number,
        indentationWidth: number,
        leading: number
    ): TextElementLayoutResult[] {
        // 分行
        const lines = this.breakIntoLines(elements, startX, maxWidth, indentationWidth)

        // 计算统一行高（所有行中最大行高）
        const lineHeight = Math.max(
            ...lines.map((line) => this.calculateLineHeight(line.elements, leading)),
            0
        )

        const results: TextElementLayoutResult[] = []
        let currentY = startY

        for (const line of lines) {
            let currentX = line.startX

            for (const element of line.elements) {
                const x = currentX
                const y = currentY + lineHeight - element.height

                results.push({
                    id: element.id,
                    x,
                    y,
                    width: element.width,
                    height: element.height,
                    lineHeight,
                })

                currentX += element.width + element.letterSpacing
            }

            currentY += lineHeight
        }

        return results
    }

    /**
     * 贪心分行算法
     * 对应 TextFields.breakTextIntoLines()
     */
    private breakIntoLines(
        elements: MeasuredElement[],
        startX: number,
        maxWidth: number,
        indentationWidth: number
    ): LayoutLine[] {
        const lines: LayoutLine[] = []

        if (elements.length === 0) {
            return lines
        }

        let currentLine: MeasuredElement[] = []
        let currentX = startX + indentationWidth
        let isFirstLine = true

        for (const element of elements) {
            const actualWidth = element.width

            if (currentLine.length === 0) {
                // 当前行为空，直接添加（即使超出边界）
                currentLine.push(element)
                currentX += actualWidth + element.letterSpacing
            } else {
                // 检查是否需要换行
                if (currentX + actualWidth > startX + maxWidth) {
                    // 保存当前行
                    lines.push({
                        elements: currentLine,
                        startX: isFirstLine ? startX + indentationWidth : startX,
                    })

                    // 开始新行
                    currentLine = [element]
                    currentX = startX + actualWidth + element.letterSpacing
                    isFirstLine = false
                } else {
                    // 添加到当前行
                    currentLine.push(element)
                    currentX += actualWidth + element.letterSpacing
                }
            }
        }

        // 添加最后一行
        if (currentLine.length > 0) {
            lines.push({
                elements: currentLine,
                startX: isFirstLine ? startX + indentationWidth : startX,
            })
        }

        return lines
    }

    /**
     * 计算行高
     * 对应 TextFields.calculateLineHeight()
     */
    private calculateLineHeight(elements: MeasuredElement[], leading: number): number {
        if (elements.length === 0) return 0
        const maxFontSize = Math.max(...elements.map((el) => el.fontSize))
        return maxFontSize * leading
    }

    /**
     * 计算缩进宽度
     * 对应 TextFields.calculateIndentationWidth()
     */
    private calculateIndentationWidth(elements: MeasuredElement[], indentation: number): number {
        if (elements.length === 0 || indentation === 0) return 0
        const firstElement = elements[0]
        return firstElement.width * indentation
    }

    /**
     * 水平对齐调整
     * 对应 TextFields.adjustParagraphHorizontalAlignment()
     */
    private adjustHorizontalAlign(
        elementResults: TextElementLayoutResult[],
        horizontalAlign: HorizontalAlign,
        maxWidth: number
    ): void {
        if (horizontalAlign === 'LEFT' || elementResults.length === 0) return

        // 计算段落内容宽度（包围盒）
        const minX = Math.min(...elementResults.map((el) => el.x))
        const maxX = Math.max(...elementResults.map((el) => el.x + el.width))
        const contentWidth = maxX - minX

        let offsetX = 0
        switch (horizontalAlign) {
            case 'CENTER':
                offsetX = (maxWidth - contentWidth) / 2
                break
            case 'RIGHT':
                offsetX = maxWidth - contentWidth
                break
        }

        if (offsetX === 0) return

        for (const el of elementResults) {
            el.x += offsetX
        }
    }

    /**
     * 垂直对齐调整
     * 对应 TextFields.adjustParagraphVerticalAlignment()
     */
    private adjustVerticalAlign(
        paragraphResults: ParagraphLayoutResult[],
        paragraphDatas: ParagraphData[],
        layoutArea: LayoutAreaData,
        verticalAlign: VerticalAlign
    ): void {
        if (verticalAlign === 'TOP' || paragraphResults.length === 0) return

        // 计算所有段落的总高度
        const allElements = paragraphResults.flatMap((p) => p.elements)
        if (allElements.length === 0) return

        const minY = Math.min(...allElements.map((el) => el.y))
        const maxY = Math.max(...allElements.map((el) => el.y + el.lineHeight))
        const totalHeight = maxY - minY

        let offsetY = 0
        switch (verticalAlign) {
            case 'MIDDLE':
                offsetY = (layoutArea.height - totalHeight) / 2
                break
            case 'BOTTOM':
                offsetY = layoutArea.height - totalHeight
                break
        }

        if (offsetY === 0) return

        for (const paragraphResult of paragraphResults) {
            paragraphResult.y += offsetY
            for (const el of paragraphResult.elements) {
                el.y += offsetY
            }
        }
    }

    /**
     * 计算段落包围盒（含 preHeight/postHeight/preWidth）
     */
    private computeParagraphBounds(
        result: ParagraphLayoutResult,
        options: { preHeight: number; postHeight: number; preWidth: number }
    ): BoundsData {
        if (result.elements.length === 0) {
            return { x: result.x, y: result.y, width: 0, height: options.preHeight + options.postHeight }
        }

        const minX = Math.min(...result.elements.map((el) => el.x))
        const minY = Math.min(...result.elements.map((el) => el.y))
        const maxX = Math.max(...result.elements.map((el) => el.x + el.width + 0 /* letterSpacing already in positioning */))
        const maxY = Math.max(...result.elements.map((el) => el.y + el.lineHeight))

        return {
            x: minX - options.preWidth,
            y: minY - options.preHeight,
            width: (maxX - minX) + options.preWidth,
            height: (maxY - minY) + options.preHeight + options.postHeight,
        }
    }

    /**
     * 计算整体内容包围盒
     */
    private computeOverallBounds(paragraphResults: ParagraphLayoutResult[]): BoundsData {
        const allElements = paragraphResults.flatMap((p) => p.elements)

        if (allElements.length === 0) {
            return { x: 0, y: 0, width: 0, height: 0 }
        }

        const minX = Math.min(...allElements.map((el) => el.x))
        const minY = Math.min(...allElements.map((el) => el.y))
        const maxX = Math.max(...allElements.map((el) => el.x + el.width))
        const maxY = Math.max(...allElements.map((el) => el.y + el.lineHeight))

        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
        }
    }
}
