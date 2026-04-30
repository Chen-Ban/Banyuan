import Serializer from '@/core/serializer'
import type { VERTICALALIGN } from '@/core/constants'
import { WorkerHandler, WorkerHandlerResult } from '@/workers/types'
import Bounds from '@/core/graph/base/Bounds'

/**
 * 文本布局相关任务（纯 handler）：
 * - TextView 内部的段落布局（换行、对齐）
 * - TextElement 宽高测量
 *
 * 传输方式：TextParagraph[] 和 Rectangle 通过 Serializer 序列化为 JSON 字符串传输，
 * Worker 端反序列化重建实例后执行布局计算。
 */

export interface TextLayoutPayload {
    /** Serializer.serialize() 后的 TextParagraph[] JSON 字符串 */
    paragraphs: string
    /** Serializer.serialize() 后的 Rectangle JSON 字符串 */
    layoutArea: string
    verticalAlign?: VERTICALALIGN
    fixedWidth?: boolean
    fixedHeight?: boolean
}

export interface TextLayoutResult {
    /** 布局后的 TextParagraph[] 序列化 JSON 字符串 */
    paragraphs: string
    bounds: {
        x: number
        y: number
        width: number
        height: number
    } | null
}

export const textLayoutHandler: WorkerHandler<
    TextLayoutPayload,
    TextLayoutResult
> = (payload): WorkerHandlerResult<TextLayoutResult> => {
    const serializer = Serializer.getInstance()
    const {
        paragraphs: paragraphsJson,
        layoutArea: layoutAreaJson,
        verticalAlign,
        fixedWidth,
        fixedHeight,
    } = payload

    // Worker 端反序列化重建实例
    const paragraphs = serializer.deserialize(paragraphsJson)
    const layoutArea = serializer.deserialize(layoutAreaJson)

    // TODO: 待完整实现时启用，当前占位
    void verticalAlign; void fixedWidth; void fixedHeight; void layoutArea

    // TODO: 当 Worker 环境支持 CanvasContext 时启用完整布局
    // 当前返回空布局结果，因为 Worker 中没有 Canvas 上下文
    const bounds = Bounds.empty()

    return {
        result: {
            paragraphs: serializer.serialize(paragraphs),
            bounds,
        },
    }
}
