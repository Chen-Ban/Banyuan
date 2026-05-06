import { WorkerHandler, WorkerHandlerResult } from '@/workers/types'
import TextLayoutEngine from './text/TextLayoutEngine'
import type { TextLayoutInput, TextLayoutOutput } from './text/types'

/**
 * 文本布局 Worker Handler（路径B：测量 + 布局一体化）
 *
 * 职责：
 * 1. 接收主线程传来的纯数据（段落字符列表 + 字体信息 + 布局约束）
 * 2. 使用 OffscreenCanvas 进行字符宽度测量
 * 3. 执行完整的布局计算（分行、定位、对齐）
 * 4. 返回每个字符的最终位置和尺寸
 *
 * 输入格式（TextLayoutInput）：
 * - paragraphs: 段落数组，每个段落包含元素列表（char + fontString + fontSize + letterSpacing）
 * - layoutArea: 布局约束区域 { x, y, width, height }
 * - verticalAlign: 垂直对齐方式
 * - fixedWidth: 是否固定宽度
 * - fixedHeight: 是否固定高度
 *
 * 输出格式（TextLayoutOutput）：
 * - paragraphs: 段落布局结果，每个元素包含 { id, x, y, width, height, lineHeight }
 * - bounds: 整体内容包围盒
 *
 * 主线程使用方式（后续整体替换时）：
 * 1. 将 TextFields 的段落数据序列化为 TextLayoutInput
 * 2. 通过 WorkerExecutor 发送 "text/layout" 任务
 * 3. 收到 TextLayoutOutput 后，遍历结果调用各 TextElement.applyLayout()
 */

// 布局引擎单例（复用 FontMeasurer 缓存）
let engine: TextLayoutEngine | null = null

function getEngine(): TextLayoutEngine {
    if (!engine) {
        engine = new TextLayoutEngine()
    }
    return engine
}

export const textLayoutHandler: WorkerHandler<
    TextLayoutInput,
    TextLayoutOutput
> = (payload): WorkerHandlerResult<TextLayoutOutput> => {
    const layoutEngine = getEngine()
    const result = layoutEngine.compute(payload)

    return { result }
}

// ─── 保留旧接口类型导出（兼容性，后续整体替换时移除） ───

/** @deprecated 使用 TextLayoutInput 替代 */
export interface TextLayoutPayload {
    /** Serializer.serialize() 后的 TextParagraph[] JSON 字符串 */
    paragraphs: string
    /** Serializer.serialize() 后的 Rectangle JSON 字符串 */
    layoutArea: string
    verticalAlign?: string
    fixedWidth?: boolean
    fixedHeight?: boolean
}

/** @deprecated 使用 TextLayoutOutput 替代 */
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
