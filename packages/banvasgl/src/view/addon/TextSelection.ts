import { TextIndex } from '@/graph/text/TextFields'
import { Rectangle } from '@/graph/combined/Polygon'
import type { IDrawingContext, IDrawingGradient, IDrawingPattern } from "@/types/platform/drawing.js";

/**
 * 文本选区状态
 *
 * 管理光标模式（fixedIndex === dynamicIndex）和范围选中模式。
 * 与 TextSelectionAddon 高内聚：Addon 持有并操作此对象，
 * TextView 通过 selectionAddon.selection 访问。
 *
 * 后续文本容器支持嵌套图形、媒体、组合容器时，可在此扩展选区类型。
 */
export default class TextSelection {
    private selectionBoxs: Rectangle[]
    public fixedIndex: TextIndex | undefined
    public dynamicIndex: TextIndex | undefined

    constructor(
        fixedIndex: TextIndex | undefined,
        dynamicIndex: TextIndex | undefined
    ) {
        this.fixedIndex = fixedIndex
        this.dynamicIndex = dynamicIndex
        this.selectionBoxs = []
    }

    public get isSelection(): boolean {
        return this.fixedIndex !== undefined && this.dynamicIndex !== undefined
    }

    public static isCursor(
        fixedIndex: TextIndex | undefined,
        dynamicIndex: TextIndex | undefined
    ): boolean {
        if (!fixedIndex || !dynamicIndex) return false
        return Number(fixedIndex.join('')) === Number(dynamicIndex.join(''))
    }

    /**
     * 判断是否是光标状态（两个 TextIndex 是否相同）
     */
    public isCursor(): boolean {
        return TextSelection.isCursor(this.fixedIndex, this.dynamicIndex)
    }

    /**
     * 比较两个 TextIndex 的位置顺序
     * @returns index1 在 index2 之前返回 -1，相同返回 0，之后返回 1
     */
    public static compare(index1: TextIndex, index2: TextIndex): number {
        const num1 = Number(index1.join(''))
        const num2 = Number(index2.join(''))

        if (num1 < num2) return -1
        if (num1 > num2) return 1
        return 0
    }

    public compare(index1: TextIndex, index2: TextIndex): number {
        return TextSelection.compare(index1, index2)
    }

    /**
     * 将有方向的 TextIndex（fixedIndex, dynamicIndex）转换为无方向的（startIndex, endIndex）。
     * 确保 startIndex ≤ endIndex，任一参数为 undefined 时返回 [undefined, undefined]。
     */
    public static toDirectionlessIndex(
        fixedIndex: TextIndex | undefined,
        dynamicIndex: TextIndex | undefined
    ): [TextIndex | undefined, TextIndex | undefined] {
        if (!fixedIndex || !dynamicIndex) {
            return [undefined, undefined]
        }

        const compare = TextSelection.compare(fixedIndex, dynamicIndex)

        if (compare <= 0) {
            return [fixedIndex, dynamicIndex]
        } else {
            return [dynamicIndex, fixedIndex]
        }
    }

    public toDirectionlessIndex(): [
        TextIndex | undefined,
        TextIndex | undefined,
    ] {
        return TextSelection.toDirectionlessIndex(
            this.fixedIndex,
            this.dynamicIndex
        )
    }

    /**
     * 设置选区渲染矩形列表
     */
    public setSelectionBoxs(boxes: Rectangle[]): void {
        this.selectionBoxs = [...boxes]
    }

    /**
     * 渲染光标或选区高亮
     * @param ctx Canvas 渲染上下文
     * @param cursorOpacity 光标不透明度（0~1），仅光标模式生效；范围选中时忽略
     */
    public render(ctx: IDrawingContext, cursorOpacity: number = 1): void {
        if (this.selectionBoxs.length === 0) {
            return
        }

        const isCursorMode = this.isCursor()

        ctx.save()
        ctx.lineWidth = 1

        if (isCursorMode) {
            // 光标模式：纯色竖线，透明度由 cursorOpacity 控制
            ctx.globalAlpha = cursorOpacity
            ctx.fillStyle = 'rgba(0, 0, 0, 1)'
        } else {
            // 范围选中模式：半透明蓝色高亮，透明度固定
            ctx.fillStyle = 'rgba(0, 123, 255, .5)'
        }

        this.selectionBoxs.forEach((box) => {
            const topLeft = box.getTopLeft()
            ctx.fillRect(topLeft.x, topLeft.y, box.width, box.height)
        })

        ctx.restore()
    }

    /**
     * 清空选区矩形列表
     */
    public clear(): void {
        this.selectionBoxs = []
    }
}
