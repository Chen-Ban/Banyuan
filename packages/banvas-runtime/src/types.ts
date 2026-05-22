/**
 * banvas-runtime 统一接口层 —— 平台无关的运行态契约
 *
 * 此文件定义所有平台适配（web / ios / android / desktop）需要实现的接口。
 * 类似 Flutter 的 dart:ui —— 定义"运行态需要什么能力"，不关心底层如何实现。
 *
 * 各平台适配包（如 @banyuan/banvas-runtime-web）实现这些接口，
 * 上层业务代码只依赖此契约包。
 */

import type { IApp, IAppOptions, IRendererOptions, IScene } from '@banyuan/banvasgl'

// ════════════════════════════════════════════════
//  基础类型
// ════════════════════════════════════════════════

/** Scene 序列化后的 JSON 字符串（由 Serializer.serialize() 生成） */
export type SerializedPageJSON = string

// ════════════════════════════════════════════════
//  渲染契约（Renderer Adapter）
// ════════════════════════════════════════════════

/**
 * 运行态画布初始化选项
 *
 * 各平台适配统一接受此配置来创建运行态画布。
 */
export interface IRuntimeCanvasOptions {
    /** 画布逻辑宽度（CSS 像素 / 逻辑点） */
    width: number
    /** 画布逻辑高度 */
    height: number
    /** App 实例选项 */
    appOptions?: IAppOptions
    /** 渲染器选项（dpr 由平台适配层自动获取） */
    rendererOptions?: Omit<IRendererOptions, 'dpr'>
}

/**
 * 运行态画布初始化结果
 *
 * 各平台适配在完成初始化后返回此结构，
 * 上层通过 app 实例操控画布。
 */
export interface IRuntimeCanvasResult {
    /** BanvasGL App 实例（平台无关的引擎核心） */
    app: IApp | null
    /** 销毁画布和 App 实例 */
    destroy(): void
}

/**
 * 运行态渲染适配器接口
 *
 * 每个平台实现此接口，负责：
 * - 创建平台原生的 Surface / Canvas
 * - 初始化 BanvasGL App 并绑定到平台 Surface
 * - 处理 DPR / 屏幕密度变化
 * - 响应容器尺寸变化
 */
export interface IRuntimeRendererAdapter {
    /** 初始化画布，加载序列化页面数据 */
    init(pages: SerializedPageJSON[], options: IRuntimeCanvasOptions): IRuntimeCanvasResult

    /** 响应尺寸变化 */
    resize(width: number, height: number): void

    /** 获取当前平台的设备像素比 */
    getDevicePixelRatio(): number

    /** 销毁适配器，释放平台资源 */
    destroy(): void
}

// ════════════════════════════════════════════════
//  事件契约（Event Bridge）
// ════════════════════════════════════════════════

/**
 * 运行态事件类型枚举
 *
 * 统一的事件语义，各平台将原生事件映射到此枚举。
 */
export enum RuntimeEventType {
    // 点击类
    Click = 'click',
    DoubleClick = 'doubleClick',
    ContextMenu = 'contextMenu',
    // 指针移动类（鼠标 / 触摸统一为 pointer）
    PointerDown = 'pointerDown',
    PointerUp = 'pointerUp',
    PointerMove = 'pointerMove',
    PointerEnter = 'pointerEnter',
    PointerLeave = 'pointerLeave',
    // 拖拽类
    DragStart = 'dragStart',
    Drag = 'drag',
    DragEnd = 'dragEnd',
    // 焦点类
    Focus = 'focus',
    Blur = 'blur',
}

/**
 * 平台无关的指针坐标
 *
 * 各平台将原生事件坐标转换为画布物理像素坐标后传入。
 */
export interface IRuntimePointerEvent {
    /** 事件类型 */
    type: RuntimeEventType
    /** 画布坐标 X（物理像素） */
    x: number
    /** 画布坐标 Y（物理像素） */
    y: number
    /** 原生事件对象（平台相关，可选，用于阻止默认行为等） */
    nativeEvent?: unknown
}

/**
 * 运行态事件桥接接口
 *
 * 各平台实现此接口，将原生平台事件转换为统一的 IRuntimePointerEvent，
 * 然后交由引擎核心做命中检测和 FlowSchema 触发。
 */
export interface IRuntimeEventBridge {
    /** 绑定事件监听到平台原生 Surface */
    bindEvents(app: IApp): void
    /** 解绑所有事件监听 */
    unbindEvents(): void
    /** 销毁事件桥接，释放资源 */
    destroy(): void
}

// ════════════════════════════════════════════════
//  运行态适配器（组合接口）
// ════════════════════════════════════════════════

/**
 * 运行态完整适配器接口
 *
 * 组合渲染适配 + 事件桥接，是各平台适配包的顶层导出契约。
 * Web 实现 = React Hook（useRuntimeBanvas）
 * 原生实现 = 平台 SDK 初始化函数
 */
export interface IRuntimeAdapter {
    readonly renderer: IRuntimeRendererAdapter
    readonly events: IRuntimeEventBridge
}
