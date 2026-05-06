/**
 * Worker 端 TextLayout 纯数据类型定义
 *
 * 设计原则：
 * - Worker 端不依赖主线程的类实例（Graph、TextElement 等）
 * - 所有数据通过 Structured Clone 传输，使用纯 JSON 对象
 * - 输入：主线程将 TextFields 数据扁平化为纯数据结构
 * - 输出：Worker 返回每个字符的位置和尺寸信息，主线程据此更新实例
 */

// ─── 对齐方式（与主线程 constants 保持一致的字符串值） ───

export type HorizontalAlign = 'LEFT' | 'CENTER' | 'RIGHT'
export type VerticalAlign = 'TOP' | 'MIDDLE' | 'BOTTOM'

// ─── 输入数据结构 ───

/**
 * 单个文字元素的输入数据
 */
export interface TextElementData {
    /** 元素唯一标识（用于结果映射回主线程实例） */
    id: string
    /** 字符内容（单字符） */
    char: string
    /** 字体字符串，如 "normal normal 16px Arial" */
    fontString: string
    /** 字体大小 */
    fontSize: number
    /** 字间距 */
    letterSpacing: number
    /** 是否为不可打印元素（段落末尾守卫） */
    isNonPrintable: boolean
}

/**
 * 段落选项数据
 */
export interface ParagraphOptionsData {
    horizontalAlign: HorizontalAlign
    /** 行高倍数 */
    leading: number
    /** 段前高度 */
    preHeight: number
    /** 段后高度 */
    postHeight: number
    /** 段前宽度 */
    preWidth: number
    /** 缩进倍数（基于首字符宽度） */
    indentation: number
}

/**
 * 段落输入数据
 */
export interface ParagraphData {
    /** 段落唯一标识 */
    id: string
    /** 段落内的文字元素列表 */
    elements: TextElementData[]
    /** 段落选项 */
    options: ParagraphOptionsData
}

/**
 * 布局区域数据
 */
export interface LayoutAreaData {
    x: number
    y: number
    width: number
    height: number
}

/**
 * TextLayout Worker 任务的完整输入
 */
export interface TextLayoutInput {
    /** 所有段落数据 */
    paragraphs: ParagraphData[]
    /** 布局约束区域 */
    layoutArea: LayoutAreaData
    /** 垂直对齐方式 */
    verticalAlign: VerticalAlign
    /** 是否固定宽度 */
    fixedWidth: boolean
    /** 是否固定高度 */
    fixedHeight: boolean
}

// ─── 输出数据结构 ───

/**
 * 单个文字元素的布局结果
 */
export interface TextElementLayoutResult {
    /** 元素唯一标识（与输入对应） */
    id: string
    /** 布局后的位置 x */
    x: number
    /** 布局后的位置 y */
    y: number
    /** 测量得到的宽度 */
    width: number
    /** 高度（= fontSize） */
    height: number
    /** 行高 */
    lineHeight: number
}

/**
 * 段落的布局结果
 */
export interface ParagraphLayoutResult {
    /** 段落唯一标识 */
    id: string
    /** 段落位置 x */
    x: number
    /** 段落位置 y */
    y: number
    /** 段落内所有元素的布局结果 */
    elements: TextElementLayoutResult[]
}

/**
 * 包围盒数据
 */
export interface BoundsData {
    x: number
    y: number
    width: number
    height: number
}

/**
 * TextLayout Worker 任务的完整输出
 */
export interface TextLayoutOutput {
    /** 所有段落的布局结果 */
    paragraphs: ParagraphLayoutResult[]
    /** 整体内容包围盒 */
    bounds: BoundsData
}
