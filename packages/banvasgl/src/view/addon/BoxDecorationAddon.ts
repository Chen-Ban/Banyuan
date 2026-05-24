/**
 * BoxDecorationAddon —— 样式层核心插件
 *
 * 职责一（视觉装饰）：背景填充、边框、圆角、裁剪。
 * 职责二（样式管线）：持有 rawStyle → computedStyle 的单向管线，
 *   所有渲染和业务逻辑只读 computedStyle，原始值在 compute() 中消费。
 * 职责三（滚动行为）：overflow=scroll 时维护 scrollOffset 状态及滚动条图形渲染。
 *
 * 对标浏览器 CSSOM：
 *   IViewStyle（用户样式表）→ compute() → IComputedStyle（计算样式）→ 渲染引擎
 *
 * 设计要点：
 * - compute() 在每次 layout() 末尾由 View 调用一次，保持 computedStyle 最新
 * - scrollOffset 是 overflow=scroll 的派生状态，归属计算样式层而非独立 addon
 * - renderBackground() 在 clip 之前调用（第〇阶段，背景层）
 * - renderScrollBars() 在 renderPlugins 管线中调用（第二阶段，覆盖层）
 * - 原始装饰配置通过 decoration 字段存储，用于 copy/toJSON
 */

import type Bounds from '@/graph/base/Bounds.js'
import { Rectangle } from '@/graph/combined/Polygon/index.js'
import { AddonType } from '@/foundation/constants.js'
import { AddonCapability } from '@/types/index.js'
import type {
    IBoxDecorationAddon,
    IBoxDecorationOptions,
    IComputedStyle,
    IViewStyle,
    IFillStyleOptions,
    IStrokeStyleOptions,
    IShadowStyleOptions,
} from '@/types/index.js'
import { calculateScrollBarGeometry } from '@/view/View/utils.js'
import { SCROLLBAR_THICKNESS } from '@/view/View/constant.js'
import type { Point3 } from '@/foundation/math/index.js'
import type { ExtraData } from '@/types/index.js'
import FillStyle from '@/foundation/style/FillStyle.js'
import StrokeStyle from '@/foundation/style/StrokeStyle.js'
import ShadowStyle from '@/foundation/style/ShadowStyle.js'
import Style from '@/foundation/style/Style.js'
import Color from '@/foundation/style/Color.js'

// ────────────────────────────────────────────
//  BoxDecorationAddon 实现
// ────────────────────────────────────────────

/**
 * 样式层核心插件 —— 视觉装饰 + 计算样式管线 + 滚动行为
 *
 * 职责：RENDER + LOGIC
 * - RENDER（优先级 -10）：渲染背景/边框/圆角（在 clip 之前），以及滚动条（在 renderPlugins 中）
 * - LOGIC：维护 computedStyle，包括运行时 scrollOffset 状态
 *
 * 注意：renderBackground 不走 renderPlugins 管线（在 renderToOffScreen 第〇阶段单独调用），
 * renderScrollBars 走 renderPlugins 管线（capabilities 包含 RENDER）。
 */
export default class BoxDecorationAddon implements IBoxDecorationAddon {
    public readonly type = AddonType.BOX_DECORATION
    public readonly capabilities = [AddonCapability.RENDER, AddonCapability.LOGIC] as const
    /** priority -10：在 BoundingBoxAddon(0) 之前，作为最底层背景；滚动条也随此优先级在管线中渲染 */
    public readonly priority = -10

    // ── 原始装饰配置（用户传入，序列化来源） ──
    public decoration: IBoxDecorationOptions

    // ── 计算样式（渲染和逻辑的唯一数据源） ──
    private _computedStyle: IComputedStyle = {
        // 布局域
        overflow: 'visible',
        scrollOffset: { x: 0, y: 0 },
        // 容器装饰域
        opacity: 1,
        borderRadius: [0, 0, 0, 0],
        backgroundColor: 'transparent',
        borderWidth: 0,
        borderColor: 'transparent',
        clipContent: false,
        // 图形绘制域（null 表示使用 Graph 自身默认值）
        fill: null,
        stroke: null,
        shadow: null,
    }

    public get computedStyle(): IComputedStyle {
        return this._computedStyle
    }

    // ── 滚动条图形（仅 overflow=scroll 时有值） ──
    private _scrollBarH: Rectangle | null = null
    private _scrollBarV: Rectangle | null = null

    constructor(options: IBoxDecorationOptions = {}) {
        this.decoration = {
            backgroundColor: options.backgroundColor ?? 'transparent',
            borderWidth: options.borderWidth ?? 0,
            borderColor: options.borderColor ?? 'transparent',
            borderRadius: options.borderRadius ?? 0,
            clipContent: options.clipContent ?? false,
            opacity: options.opacity ?? 1,
        }
        // 初始化 computedStyle 中的装饰字段（不依赖 layout，可立即使用）
        this._syncDecorationToComputed()
    }

    // ────────────────────────────────────────
    //  compute() —— rawStyle → computedStyle
    // ────────────────────────────────────────

    /**
     * 将 rawStyle 计算为 computedStyle，同时更新 scrollOffset 和图形绘制域实例。
     * 在每次 layout() 末尾由 View 调用。
     *
     * 三域计算规则：
     *
     * 「域一：布局域」
     *   - overflow：直通
     *   - scrollOffset：仅 overflow=scroll 时按 clamp 公式计算
     *
     * 「域二：容器装饰域」
     *   - 从 rawStyle 直通视图容器的语义字段并 normalize borderRadius
     *   - 注：这些字段已从 IBoxDecorationOptions 迁移至 IViewStyle，
     *          decoration 字段保留以兼容序列化（copy/toJSON 的来源）。
     *
     * 「域三：图形绘制域」
     *   - 将 rawStyle.fill / .stroke / .shadow 实例化为对应 class
     *   - 未设置时写入 null，Graph.render() 看到 null 则使用自身内置默认样式
     */
    public compute(rawStyle: IViewStyle, viewport: Bounds, layoutArea: Bounds): void {
        // —— 域一：布局域 ——
        const overflow = rawStyle.overflow ?? 'visible'
        this._computedStyle.overflow = overflow

        if (overflow === 'scroll') {
            this._computeScroll(rawStyle, viewport, layoutArea)
        } else {
            this._computedStyle.scrollOffset = { x: 0, y: 0 }
            this._scrollBarH = null
            this._scrollBarV = null
        }

        // —— 域二：容器装饰域 ——
        // rawStyle 中的容器装饰字段优先，回退到 decoration（兼容旧序列化路径）
        const cs = this._computedStyle
        cs.backgroundColor = rawStyle.backgroundColor ?? this.decoration.backgroundColor ?? 'transparent'
        cs.borderWidth     = rawStyle.borderWidth     ?? this.decoration.borderWidth     ?? 0
        cs.borderColor     = rawStyle.borderColor     ?? this.decoration.borderColor     ?? 'transparent'
        cs.borderRadius    = this._normalizeRadii(
            rawStyle.borderRadius ?? this.decoration.borderRadius ?? 0
        )
        cs.clipContent     = rawStyle.clipContent     ?? this.decoration.clipContent     ?? false
        cs.opacity         = rawStyle.opacity         ?? this.decoration.opacity         ?? 1

        // —— 域三：图形绘制域 ——
        cs.fill   = rawStyle.fill   ? this._buildFillStyle(rawStyle.fill)     : null
        cs.stroke = rawStyle.stroke ? this._buildStrokeStyle(rawStyle.stroke) : null
        cs.shadow = rawStyle.shadow ? this._buildShadowStyle(rawStyle.shadow) : null
    }

    // ────────────────────────────────────────
    //  渲染方法
    // ────────────────────────────────────────

    /** 渲染背景填充和边框（在 content 之前调用，第〇阶段） */
    public renderBackground(ctx: CanvasRenderingContext2D, viewport: Bounds): void {
        if (!this.hasDecoration()) return

        const cs = this._computedStyle
        const { x, y, width, height } = viewport

        ctx.save()

        if (cs.opacity < 1) {
            ctx.globalAlpha *= cs.opacity
        }

        // 构建圆角矩形路径
        this._buildRoundedRectPath(ctx, x, y, width, height, cs.borderRadius)

        // 填充背景
        if (cs.backgroundColor !== 'transparent') {
            ctx.fillStyle = cs.backgroundColor
            ctx.fill()
        }

        // 绘制边框
        if (cs.borderWidth > 0 && cs.borderColor !== 'transparent') {
            ctx.strokeStyle = cs.borderColor
            ctx.lineWidth = cs.borderWidth
            ctx.stroke()
        }

        ctx.restore()
    }

    /**
     * 渲染滚动条（在 renderPlugins 管线中调用，第二阶段）。
     * overflow !== 'scroll' 时无图形，零开销。
     */
    /** 滚动条样式：半透明灰色填充 */
    private static readonly SCROLLBAR_STYLE = new Style({
        fillStyle: new FillStyle({ fillType: 'color', color: new Color(0, 0, 0, 0.3) }),
    })

    public renderScrollBars(ctx: CanvasRenderingContext2D): void {
        this._scrollBarH?.render(ctx, BoxDecorationAddon.SCROLLBAR_STYLE)
        this._scrollBarV?.render(ctx, BoxDecorationAddon.SCROLLBAR_STYLE)
    }

    /**
     * render() 实现 IAddonBase 的 RENDER 职责。
     * renderPlugins 管线调用此方法 → 渲染滚动条。
     * renderBackground 是独立调用，不走管线。
     */
    public render(ctx: CanvasRenderingContext2D): void {
        this.renderScrollBars(ctx)
    }

    /** 构建圆角裁剪路径（computedStyle.clipContent = true 时使用） */
    public buildClipPath(ctx: CanvasRenderingContext2D, viewport: Bounds): void {
        const { x, y, width, height } = viewport
        this._buildRoundedRectPath(ctx, x, y, width, height, this._computedStyle.borderRadius)
        ctx.clip()
    }

    /** 装饰层是否有视觉效果（false 时 renderBackground 零开销跳过） */
    public hasDecoration(): boolean {
        const cs = this._computedStyle
        return (
            cs.backgroundColor !== 'transparent' ||
            cs.borderWidth > 0 ||
            cs.borderColor !== 'transparent' ||
            cs.opacity < 1
        )
    }

    // ────────────────────────────────────────
    //  交互（不参与）
    // ────────────────────────────────────────

    public interact(_p: Point3, _bufferCtx?: CanvasRenderingContext2D): ExtraData | null {
        return null
    }

    // ────────────────────────────────────────
    //  复制与序列化
    // ────────────────────────────────────────

    public copy(): BoxDecorationAddon {
        const copy = new BoxDecorationAddon(this.decoration)
        // 复制 computedStyle（包含运行时 scrollOffset）
        copy._computedStyle = { ...this._computedStyle, scrollOffset: { ...this._computedStyle.scrollOffset } }
        return copy
    }

    /** 序列化：仅输出 decoration（非默认值），computedStyle 是运行时推导值，不持久化 */
    public toJSON(): any {
        const d = this.decoration
        const json: Record<string, unknown> = {}
        if (d.backgroundColor !== 'transparent') json.backgroundColor = d.backgroundColor
        if (d.borderWidth !== 0) json.borderWidth = d.borderWidth
        if (d.borderColor !== 'transparent') json.borderColor = d.borderColor
        if (d.borderRadius !== 0) json.borderRadius = d.borderRadius
        if (d.clipContent !== false) json.clipContent = d.clipContent
        if (d.opacity !== 1) json.opacity = d.opacity
        return json
    }

    /** 反序列化 */
    static fromJSON(data: any): BoxDecorationAddon {
        return new BoxDecorationAddon({
            backgroundColor: data.backgroundColor,
            borderWidth: data.borderWidth,
            borderColor: data.borderColor,
            borderRadius: data.borderRadius,
            clipContent: data.clipContent,
            opacity: data.opacity,
        })
    }

    // ────────────────────────────────────────
    //  私有方法
    // ────────────────────────────────────────

    /** 将 decoration 配置同步到 computedStyle 的容器装饰字段（不含 scroll 和图形绘制域）
     * 仅在构造时调用一次（提供初始值），运行时由 compute() 重新计算。
     */
    private _syncDecorationToComputed(): void {
        const d = this.decoration
        const cs = this._computedStyle
        cs.backgroundColor = d.backgroundColor ?? 'transparent'
        cs.borderWidth = d.borderWidth ?? 0
        cs.borderColor = d.borderColor ?? 'transparent'
        cs.borderRadius = this._normalizeRadii(d.borderRadius ?? 0)
        cs.clipContent = d.clipContent ?? false
        cs.opacity = d.opacity ?? 1
        // 图形绘制域在构造时暂无 rawStyle，初始为 null（compute() 调用后将被覆盖）
        cs.fill   = null
        cs.stroke = null
        cs.shadow = null
    }

    // ────────────────────────────────────────
    //  图形绘制域——options → class 实例化
    // ────────────────────────────────────────

    /**
     * 将 IFillStyleOptions 实例化为 FillStyle。
     * color 字段接受 CSS 色值字符串，通过 Color.fromCSSString() 解析。
     */
    private _buildFillStyle(opts: IFillStyleOptions): FillStyle {
        const fillType = opts.fillType ?? 'color'
        const color    = opts.color ? Color.fromCSSString(opts.color) : Color.WHITE
        return new FillStyle({
            fillType,
            color,
            linearGradient:  opts.linearGradient  ?? null,
            radialGradient:  opts.radialGradient  ?? null,
            conicGradient:   opts.conicGradient   ?? null,
            image:           opts.image           ?? null,
        })
    }

    /**
     * 将 IStrokeStyleOptions 实例化为 StrokeStyle。
     * color 字段接受 CSS 色值字符串。
     */
    private _buildStrokeStyle(opts: IStrokeStyleOptions): StrokeStyle {
        const strokeType = opts.strokeType ?? 'color'
        const color      = opts.color ? Color.fromCSSString(opts.color) : Color.BLACK
        return new StrokeStyle({
            strokeType,
            color,
            linearGradient:  opts.linearGradient  ?? null,
            radialGradient:  opts.radialGradient  ?? null,
            conicGradient:   opts.conicGradient   ?? null,
            pattern:         opts.pattern         ?? null,
            width:           opts.width           ?? 1,
            opacity:         opts.opacity         ?? 1,
            lineCap:         opts.lineCap         ?? 'butt',
            lineJoin:        opts.lineJoin        ?? 'miter',
            miterLimit:      opts.miterLimit      ?? 10,
            dashArray:       opts.dashArray       ?? [],
            dashOffset:      opts.dashOffset      ?? 0,
        })
    }

    /**
     * 将 IShadowStyleOptions 实例化为 ShadowStyle。
     * color 字段接受 CSS 色值字符串。
     */
    private _buildShadowStyle(opts: IShadowStyleOptions): ShadowStyle {
        const color = opts.color ? Color.fromCSSString(opts.color) : Color.BLACK
        return new ShadowStyle({
            color,
            offsetX: opts.offsetX ?? 0,
            offsetY: opts.offsetY ?? 0,
            blur:    opts.blur    ?? 0,
            opacity: opts.opacity ?? 0.5,
            enabled: opts.enabled ?? false,
        })
    }

    /** 计算 scrollOffset 和滚动条图形（仅 overflow=scroll 时调用） */
    private _computeScroll(rawStyle: IViewStyle, vp: Bounds, layoutArea: Bounds): void {
        const scrollX = rawStyle.scrollX ?? 0
        const scrollY = rawStyle.scrollY ?? 0

        const maxScrollX = Math.abs(layoutArea.width) - Math.abs(vp.width)
        const maxScrollY = Math.abs(layoutArea.height) - Math.abs(vp.height)

        // clamp 到合法区间，不可滚动方向归零
        const clampedScrollX = maxScrollX > 0 ? Math.max(0, Math.min(scrollX, maxScrollX)) : 0
        const clampedScrollY = maxScrollY > 0 ? Math.max(0, Math.min(scrollY, maxScrollY)) : 0

        // scroll 增大 → 内容向扩展方向的反方向移动
        this._computedStyle.scrollOffset = {
            x: -Math.sign(layoutArea.width) * clampedScrollX,
            y: -Math.sign(layoutArea.height) * clampedScrollY,
        }

        // 更新滚动条图形
        const { horizontal, vertical } = calculateScrollBarGeometry(
            vp,
            layoutArea,
            clampedScrollX,
            clampedScrollY,
            maxScrollX,
            maxScrollY,
            SCROLLBAR_THICKNESS,
        )

        this._scrollBarH = horizontal
            ? new Rectangle(horizontal.x, horizontal.y, horizontal.width, horizontal.height)
            : null
        this._scrollBarV = vertical
            ? new Rectangle(vertical.x, vertical.y, vertical.width, vertical.height)
            : null
    }

    private _normalizeRadii(r: number | [number, number, number, number]): [number, number, number, number] {
        if (typeof r === 'number') return [r, r, r, r]
        return r
    }

    /**
     * 构建圆角矩形路径
     * radii 顺序：[左上, 右上, 右下, 左下]
     */
    private _buildRoundedRectPath(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        w: number,
        h: number,
        radii: [number, number, number, number],
    ): void {
        const [tl, tr, br, bl] = radii

        ctx.beginPath()
        ctx.moveTo(x + tl, y)
        // 上边 → 右上角
        ctx.lineTo(x + w - tr, y)
        if (tr > 0) ctx.arcTo(x + w, y, x + w, y + tr, tr)
        else ctx.lineTo(x + w, y)
        // 右边 → 右下角
        ctx.lineTo(x + w, y + h - br)
        if (br > 0) ctx.arcTo(x + w, y + h, x + w - br, y + h, br)
        else ctx.lineTo(x + w, y + h)
        // 下边 → 左下角
        ctx.lineTo(x + bl, y + h)
        if (bl > 0) ctx.arcTo(x, y + h, x, y + h - bl, bl)
        else ctx.lineTo(x, y + h)
        // 左边 → 左上角
        ctx.lineTo(x, y + tl)
        if (tl > 0) ctx.arcTo(x, y, x + tl, y, tl)
        else ctx.lineTo(x, y)
        ctx.closePath()
    }
}
