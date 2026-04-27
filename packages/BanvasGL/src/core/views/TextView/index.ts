import View, { InteractResult, ViewOptions } from '@/core/views/View/View'
import TextParagraph from '@/core/graph/text/TextParagraph'
import TextElement from '@/core/graph/text/TextElement'
import { Rectangle } from '@/core/graph/combined/Polygon'
import { Point3, Vector3 } from '@/core/math'
import { Action, Cursor } from '@/core/interfaces'
import Selection from './Selection'
import { VERTICALALIGN, VIEWTYPE } from '@/core/constants'
import type { ITextView } from '@/core/interfaces'
import {
    NonPrintableTextElement,
    PrintableTextElement,
    TextFields,
    TextParagraphContent,
} from '@/index.backend'
import { TextIndex } from '@/core/graph/text/TextFields'

// 文本视图选项接口
export interface TextViewOptions extends Omit<ViewOptions, 'content'> {
    editable?: boolean
}

/**
 * 文本视图
 */
export default class TextView extends View implements ITextView {
    public readonly type: VIEWTYPE = VIEWTYPE.TEXTVIEW

    public content: TextFields
    public selection: Selection = new Selection(undefined, undefined)

    public editable: boolean

    constructor(text: TextFields, options: TextViewOptions = {}) {
        // 将text作为content传递给父类构造函数
        super({ ...options, content: text })
        this.content = text
        this.verticalAlign = options?.verticalAlign ?? VERTICALALIGN.TOP
        this.editable = options?.editable ?? true
    }

    public getContentText(): string[] {
        return this.content.textContent
    }

    public renderContent(ctx: CanvasRenderingContext2D): void {
        super.renderContent(ctx)
        // 渲染选择区域
        this.selection.render(ctx)
    }

    /**
     * 将超出段落区域的点约束到段落区域内
     * @param relativePoint 相对坐标点
     * @returns 约束后的相对坐标点
     */
    public constraintPoint(relativePoint: Point3): Point3 {
        return Rectangle.fromBounds(this.content.bounds).getClosestPoint(
            relativePoint
        ).closestPoint
    }

    public resize(
        fixedPoint: Point3,
        dynamicPoint: Point3,
        vector: Vector3,
        needResizeContent: boolean = false
    ) {
        super.resize(fixedPoint, dynamicPoint, vector, needResizeContent)
        this.layout()
    }

    /**
     * 检查内容是否被命中
     * @param relativePoint 相对坐标点
     * @returns 交互结果
     */
    protected interactContent(relativePoint: Point3): InteractResult {
        // 是否命中文本域
        const hitedFields =
            this.content.isPointInPath(relativePoint) ||
            this.content.isPointOnCurve(relativePoint, 5)

        // 已激活（正在编辑）时，将鼠标点约束到文本域边界
        const _relativePoint =
            this.actived && !hitedFields
                ? this.constraintPoint(relativePoint)
                : relativePoint

        const textElement = this.content.point2TextElement(_relativePoint)
        if (textElement) {
            return {
                view: this,
                content: textElement,
                extraData: { action: Action.TEXT_SELECTION, cursorStyle: Cursor.Text },
            }
        }
        return { view: null, content: null, extraData: null }
    }

    /**
     * 文本转换为TextIndex,p作为辅助判断是下一个还是当前
     * @param textElement 文本元素
     * @param p 世界坐标点
     */
    public element2Index(textElement: TextElement, p: Point3): TextIndex {
        const relativePoint = this.getMVPMatrix().inverse().multiply(p)
        return this.content.element2Index(textElement, relativePoint)
    }

    /**
     * 设置选择框
     * @param fixedIndex 固定光标,当第二个为undefined时，代表动态光标
     * @param dynamicIndex 动态光标
     * @description 两个都为undefined时，不出现光标
     */
    public setSelection(
        fixedIndex: TextIndex | undefined,
        dynamicIndex: TextIndex | undefined
    ): void {
        const [start, end] = Selection.toDirectionlessIndex(
            fixedIndex,
            dynamicIndex
        )
        if (!start || !end) {
            this.selection.setSelectionBoxs([])
            return
        }

        const boxs = []
        // 选中光标
        if (Selection.isCursor(start, end)) {
            const textElement =
                this.content.paragraphs[start[0]].texts[start[1]]
            const bounds = textElement.bounds
            const x = start[2] === 0 ? bounds.x - 2 : bounds.x + bounds.width
            boxs.push(new Rectangle(x, bounds.y, 2, bounds.height))
        } else {
            if (start[2] === 1) {
                start[1]++
                start[2] = 0
            }
            if (end[2] === 1) {
                end[1]++
                end[2] = 0
            }
            const startPriorityNum = Number(start.join(''))
            const endPriorityNum = Number(end.join(''))

            // 获取范围内所有rect(范围选中)
            for (const [i, paragraph] of this.content.paragraphs.entries()) {
                for (const [j, textElement] of paragraph.texts.entries()) {
                    const curPriorityNum = Number([i, j, 0].join(''))
                    if (
                        curPriorityNum >= startPriorityNum &&
                        curPriorityNum < endPriorityNum
                    ) {
                        const bounds = textElement.bounds
                        boxs.push(
                            new Rectangle(
                                bounds.x,
                                bounds.y,
                                bounds.width,
                                bounds.height
                            )
                        )
                    }
                }
            }
        }
        this.selection.setSelectionBoxs(boxs)

        this.selection.fixedIndex = fixedIndex
        this.selection.dynamicIndex = dynamicIndex
    }

    // ==================== 编辑相关方法 ====================
    // 以下方法仅在 editable=true 时有效

    /**
     * 处理输入事件
     * @param content 输入的文本内容
     * @param isComposition 是否是合成输入（中文输入法等）
     * @description 完整流程：删除选中范围->插入新文本->重新布局->设置selection
     * @description 如果isComposition为true，则selection包含输入的内容，否则selection不包含输入的内容，置于输入内容的结束位置
     */
    public input(content: string, isComposition: boolean): void {
        if (!this.editable) return

        // 没有选中文本内容，不进行输入
        if (!this.selection.isSelection || content.length === 0) return

        let insertIndex: TextIndex | undefined

        // 如果有选中范围，先删除选中内容
        if (!this.selection.isCursor()) {
            // 删除选中范围，获取新的插入位置索引
            insertIndex = this.deleteSelection()
        } else {
            // 使用当前光标位置作为插入位置
            const [startIndex] = this.selection.toDirectionlessIndex()
            insertIndex = startIndex
        }

        if (!insertIndex) return

        const textOptions = this.content.getTextOptionsByIndex(insertIndex)

        const [paragraphIndex, textIndex, position] = insertIndex
        const paragraph = this.content.paragraphs[paragraphIndex]
        const textInsertIndex = textIndex + position
        paragraph.addText(content, textInsertIndex, textOptions)

        // 重新布局
        this.layout()

        // 更新光标位置（布局后设置selection，因为selectionBoxs依赖于文字的包围盒）
        if (isComposition) {
            // 合成输入时：fixedIndex 保持不变，dynamicIndex 根据输入长度动态更新
            const newDynamicIndex: TextIndex = [
                paragraphIndex,
                textInsertIndex + content.length,
                0,
            ]
            this.setSelection(insertIndex, newDynamicIndex)
        } else {
            // 非合成输入时：fixedIndex 和 dynamicIndex 都更新到插入文本的末尾
            const newCursorIndex = textInsertIndex + content.length
            const newIndex: TextIndex = [paragraphIndex, newCursorIndex, 0]
            this.setSelection(newIndex, [...newIndex])
        }
    }

    /**
     * 删除文本
     * @param isBackspace true 表示 Backspace（删除光标前），false 表示 Delete（删除光标后）
     */
    public delete(isBackspace: boolean): void {
        if (!this.editable) return
        if (!this.selection.isSelection) return
        let newIndex: TextIndex | undefined

        if (!this.selection.isCursor()) {
            // 有选中范围，删除选中范围
            newIndex = this.deleteSelection()
        } else {
            // 没有选中范围，删除光标位置的字符
            newIndex = this.deleteAtCursor(isBackspace)
        }

        // 重新布局
        this.layout()

        // 布局后设置selection（因为selectionBoxs依赖于文字的包围盒）
        if (newIndex) {
            this.setSelection(newIndex, [...newIndex])
        }
    }

    /**
     * 删除选中范围的文本（可能跨段落）
     * @returns 删除后的新光标位置索引，如果删除失败则返回undefined
     * @description 只修改文本内容，不设置selection，不更新布局
     */
    private deleteSelection(): TextIndex | undefined {
        if (!this.selection.isSelection) return undefined

        // 使用 toDirectionlessIndex 转换为无方向的索引
        const [startIndex, endIndex] = this.selection.toDirectionlessIndex()

        if (!startIndex || !endIndex) return undefined

        const [startPara, startText, startPos] = startIndex
        const [endPara, endText, endPos] = endIndex

        const startParagraphIndex = startPara
        const startTextIndex = startText + startPos
        const endParagraphIndex = endPara
        const endTextIndex = endText + endPos

        if (startParagraphIndex === endParagraphIndex) {
            // 同一段落内删除
            const paragraph = this.content.paragraphs[startParagraphIndex]
            if (!paragraph) return undefined

            const deleteCount = endTextIndex - startTextIndex
            paragraph.texts.splice(startTextIndex, deleteCount)

            // 返回新的光标位置索引
            return [startParagraphIndex, startTextIndex, 0]
        } else {
            // 跨段落删除
            const startParagraph = this.content.paragraphs[startParagraphIndex]
            const endParagraph = this.content.paragraphs[endParagraphIndex]
            if (!startParagraph || !endParagraph) return undefined

            // 删除起始段落中从起始位置到末尾的内容
            const startDeleteCount =
                startParagraph.texts.length - startTextIndex
            startParagraph.texts.splice(startTextIndex, startDeleteCount)

            // 删除结束段落中从开头到结束位置的内容
            const endDeleteCount = endTextIndex
            endParagraph.texts.splice(0, endDeleteCount)

            // 将结束段落剩余的内容合并到起始段落
            if (endParagraph.texts.length > 0) {
                startParagraph.texts.push(...endParagraph.texts)
            }

            // 删除中间的所有段落和结束段落
            const paragraphsToDelete = endParagraphIndex - startParagraphIndex
            this.content.paragraphs.splice(
                startParagraphIndex + 1,
                paragraphsToDelete
            )

            // 返回新的光标位置索引
            return [startParagraphIndex, startText, startPos]
        }
    }

    /**
     * 删除光标位置的字符
     * @param isBackspace true 表示 Backspace（删除光标前），false 表示 Delete（删除光标后）
     * @returns 删除后的新光标位置索引，如果删除失败则返回undefined
     * @description 只修改文本内容，不设置selection，不更新布局
     */
    private deleteAtCursor(isBackspace: boolean): TextIndex | undefined {
        if (!this.selection.fixedIndex) return undefined
        const [fixedParagraphIndex, fixedTextIndex, fixedPosition] =
            this.selection.fixedIndex
        const cursorIndex = fixedTextIndex + fixedPosition
        const paragraph = this.content.paragraphs[fixedParagraphIndex]
        if (!paragraph) return undefined

        if (isBackspace) {
            // Backspace：删除光标前的字符
            if (cursorIndex > 0) {
                // 删除光标前的一个字符
                paragraph.texts.splice(cursorIndex - 1, 1)

                // 返回新的光标位置索引
                return [fixedParagraphIndex, cursorIndex - 1, 0]
            } else {
                // 光标在段落开头，尝试合并到上一个段落
                if (fixedParagraphIndex > 0) {
                    const prevParagraph =
                        this.content.paragraphs[fixedParagraphIndex - 1]
                    const currentParagraph = paragraph
                    const prevTextCount = prevParagraph.texts.length
                    prevParagraph.texts = prevParagraph.texts
                        .slice(0, -1)
                        .concat(currentParagraph.texts) as TextParagraphContent

                    // 删除当前段落
                    this.content.paragraphs.splice(fixedParagraphIndex, 1)

                    // 返回新的光标位置索引
                    return [fixedParagraphIndex - 1, prevTextCount, 0]
                } else {
                    // 已经是第一个段落，无法删除
                    return undefined
                }
            }
        } else {
            // Delete：删除光标后的字符
            if (cursorIndex < paragraph.length) {
                // 删除光标后的一个字符
                paragraph.texts.splice(cursorIndex, 1)

                // 返回新的光标位置索引（光标位置保持不变）
                return [fixedParagraphIndex, cursorIndex, 0]
            } else {
                // 光标在段落末尾，尝试合并下一个段落
                if (fixedParagraphIndex < this.content.paragraphs.length - 1) {
                    const currentParagraph = paragraph
                    const nextParagraph =
                        this.content.paragraphs[fixedParagraphIndex + 1]
                    const currentTextCount = currentParagraph.texts.length

                    // 将下一个段落的内容合并到当前段落
                    currentParagraph.texts = currentParagraph.texts
                        .slice(0, -1)
                        .concat(nextParagraph.texts) as TextParagraphContent

                    // 删除下一个段落
                    this.content.paragraphs.splice(fixedParagraphIndex + 1, 1)

                    // 返回新的光标位置索引（光标位置保持不变）
                    return [fixedParagraphIndex, cursorIndex, 0]
                } else {
                    // 已经是最后一个段落，无法删除
                    return undefined
                }
            }
        }
    }

    /**
     * 换行（创建新段落）
     */
    public newLine(): void {
        if (!this.editable) return

        const [startIndex] = this.selection.toDirectionlessIndex()
        if (!startIndex) return

        const [paragraphIndex, textIndex, position] = startIndex
        const splitIndex = textIndex + position
        const paragraph = this.content.paragraphs[paragraphIndex]
        if (!paragraph) return

        // 获取当前段落的选项和样式
        const paragraphOptions = paragraph.options.copy()
        const paragraphStyle = paragraph.style

        // 创建新段落，包含分割点后的内容
        const newParagraph = new TextParagraph(
            [new NonPrintableTextElement()],
            paragraphOptions,
            paragraphStyle
        )
        if (splitIndex < paragraph.texts.length) {
            // 将分割点后的文本移动到新段落
            const textsToMove = paragraph.texts
                .splice(splitIndex)
                .filter((text) => text instanceof PrintableTextElement)
            paragraph.texts.push(new NonPrintableTextElement())
            newParagraph.texts.splice(0, 0, ...textsToMove)
        }

        // 插入新段落到内容数组
        this.content.paragraphs.splice(paragraphIndex + 1, 0, newParagraph)

        // 重新布局
        this.layout()

        // 布局后设置selection（因为selectionBoxs依赖于文字的包围盒）
        const newIndex: TextIndex = [paragraphIndex + 1, 0, 0]
        this.setSelection(newIndex, [...newIndex])
    }

    // ==================== 编辑方法结束 ====================

    public copy(): TextView {
        const newView = new TextView(this.content, { editable: this.editable })

        // 复制基本属性
        newView.layer = this.layer
        newView.id = this.id
        newView.properties = { ...this.properties }
        newView.data = { ...this.data }
        newView.style = {
            ...this.style,
        }
        newView.selected = this.selected
        newView.actived = this.actived
        newView.freezed = this.freezed
        newView.visible = this.visible
        newView.matrix = this.matrix.copy()

        // 复制TextView特有属性
        newView.layoutArea = this.layoutArea
        newView.fixedWidth = this.fixedWidth
        newView.verticalAlign = this.verticalAlign

        // 复制选择区域
        newView.selection = new Selection(
            this.selection.fixedIndex,
            this.selection.dynamicIndex
        )

        // 复制插件
        if (this.viewport) {
            newView.viewport = this.viewport.copy()
        }
        if (this.boundingBox) {
            newView.boundingBox = this.boundingBox.copy()
        }

        return newView
    }
}

