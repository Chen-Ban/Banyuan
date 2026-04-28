import { TextIndex } from '@/core/graph/text/TextFields'
import { Rectangle } from '@/core/graph/combined/Polygon'

/**
 * 选择区域类 - 管理选择状态（目前仅文本容器选择文字时支持）
 * 后续文本容器嵌套图形、媒体、组合容器时支持选择这些容器
 */
export default class Selection {
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
     * @param index1 第一个 TextIndex
     * @param index2 第二个 TextIndex
     * @returns 如果两个 index 相同返回 true，否则返回 false
     */
    public isCursor(): boolean {
        return Selection.isCursor(this.fixedIndex, this.dynamicIndex)
    }
    /**
     * 比较两个 TextIndex 的位置顺序
     * @param index1 第一个 TextIndex
     * @param index2 第二个 TextIndex
     * @returns 如果 index1 在 index2 之前返回 -1，相同返回 0，之后返回 1
     */
    public static compare(index1: TextIndex, index2: TextIndex): number {
        const num1 = Number(index1.join(''))
        const num2 = Number(index2.join(''))

        if (num1 < num2) return -1
        if (num1 > num2) return 1
        return 0
    }
    public compare(index1: TextIndex, index2: TextIndex): number {
        return Selection.compare(index1, index2)
    }

    /**
     * 将有方向的 TextIndex（fixedIndex, dynamicIndex）转换为无方向的 TextIndex（startIndex, endIndex）
     * @param fixedIndex 固定索引（选择起点）
     * @param dynamicIndex 动态索引（选择终点）
     * @returns 返回按顺序排列的 [startIndex, endIndex]，如果任一参数为 undefined 返回 [undefined, undefined]
     */
    public static toDirectionlessIndex(
        fixedIndex: TextIndex | undefined,
        dynamicIndex: TextIndex | undefined
    ): [TextIndex | undefined, TextIndex | undefined] {
        if (!fixedIndex || !dynamicIndex) {
            return [undefined, undefined]
        }

        // 比较两个索引的位置
        const compare = Selection.compare(fixedIndex, dynamicIndex)

        if (compare <= 0) {
            // fixedIndex 在 dynamicIndex 之前或相同，startIndex = fixedIndex, endIndex = dynamicIndex
            return [fixedIndex, dynamicIndex]
        } else {
            // fixedIndex 在 dynamicIndex 之后，startIndex = dynamicIndex, endIndex = fixedIndex
            return [dynamicIndex, fixedIndex]
        }
    }
    public toDirectionlessIndex(): [
        TextIndex | undefined,
        TextIndex | undefined,
    ] {
        return Selection.toDirectionlessIndex(
            this.fixedIndex,
            this.dynamicIndex
        )
    }

    /**
     * 设置选择框
     */
    public setSelectionBoxs(boxes: Rectangle[]): void {
        this.selectionBoxs = [...boxes]
    }

    /**
     * 渲染选择区域
     */
    public render(ctx: CanvasRenderingContext2D): void {
        if (this.selectionBoxs.length === 0) {
            return
        }

        ctx.save()
        ctx.fillStyle = 'rgba(0, 123, 255, .5)' // 半透明蓝色
        ctx.lineWidth = 1

        this.selectionBoxs.forEach((box) => {
            const topLeft = box.getTopLeft()
            ctx.fillRect(topLeft.x, topLeft.y, box.width, box.height)
        })

        ctx.restore()
    }

    /**
     * 清空选择
     */
    public clear(): void {
        this.selectionBoxs = []
    }
}
