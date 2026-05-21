/**
 * BoxDecorationAddon —— 视觉装饰插件
 *
 * 为任意 View 提供背景填充、边框、圆角、裁剪能力。
 * 对标 Flutter 的 BoxDecoration，与布局策略完全正交。
 *
 * 设计要点：
 * - 在渲染管线中位于 content 之前（作为背景层）
 * - 不参与交互检测（纯视觉表现）
 * - 所有属性为默认值时 renderBackground 零开销跳过
 * - 序列化仅输出非默认值属性（最小化 JSON 体积）
 */

import type Bounds from '@/graph/base/Bounds.js'
import { ADDONTYPE } from '@/foundation/constants.js'
import type { IBoxDecorationAddon } from '@/types/index.js'

// ────────────────────────────────────────────
//  BoxDecorationOptions
// ────────────────────────────────────────────

export interface BoxDecorationOptions {
    backgroundColor?: string
    borderWidth?: number
    borderColor?: string
    borderRadius?: number | [number, number, number, number]
    clipContent?: boolean
    opacity?: number
}

// ────────────────────────────────────────────
//  BoxDecorationAddon 实现
// ────────────────────────────────────────────

export default class BoxDecorationAddon implements IBoxDecorationAddon {
    public readonly type = ADDONTYPE.BOX_DECORATION

    public backgroundColor: string
    public borderWidth: number
    public borderColor: string
    public borderRadius: number | [number, number, number, number]
    public clipContent: boolean
    public opacity: number

    constructor(options: BoxDecorationOptions = {}) {
        this.backgroundColor = options.backgroundColor ?? 'transparent'
        this.borderWidth = options.borderWidth ?? 0
        this.borderColor = options.borderColor ?? 'transparent'
        this.borderRadius = options.borderRadius ?? 0
        this.clipContent = options.clipContent ?? false
        this.opacity = options.opacity ?? 1
    }

    // ────────────────────────────────────────
    //  公共方法
    // ────────────────────────────────────────

    /** 所有属性是否为默认值（是则渲染时跳过） */
    public isDefault(): boolean {
        return (
            this.backgroundColor === 'transparent' &&
            this.borderWidth === 0 &&
            this.borderColor === 'transparent' &&
            this.opacity === 1
        )
    }

    /** 渲染背景填充和边框（在 content 之前调用） */
    public renderBackground(ctx: CanvasRenderingContext2D, viewport: Bounds): void {
        if (this.isDefault()) return

        const { x, y, width, height } = viewport

        ctx.save()

        if (this.opacity < 1) {
            ctx.globalAlpha *= this.opacity
        }

        // 构建圆角矩形路径
        const radii = this._normalizeRadii()
        this._buildRoundedRectPath(ctx, x, y, width, height, radii)

        // 填充背景
        if (this.backgroundColor !== 'transparent') {
            ctx.fillStyle = this.backgroundColor
            ctx.fill()
        }

        // 绘制边框
        if (this.borderWidth > 0 && this.borderColor !== 'transparent') {
            ctx.strokeStyle = this.borderColor
            ctx.lineWidth = this.borderWidth
            ctx.stroke()
        }

        ctx.restore()
    }

    /** 构建圆角裁剪路径（clipContent = true 时使用） */
    public buildClipPath(ctx: CanvasRenderingContext2D, viewport: Bounds): void {
        const { x, y, width, height } = viewport
        const radii = this._normalizeRadii()
        this._buildRoundedRectPath(ctx, x, y, width, height, radii)
        ctx.clip()
    }

    // ────────────────────────────────────────
    //  复制与序列化
    // ────────────────────────────────────────

    public copy(): BoxDecorationAddon {
        return new BoxDecorationAddon({
            backgroundColor: this.backgroundColor,
            borderWidth: this.borderWidth,
            borderColor: this.borderColor,
            borderRadius: Array.isArray(this.borderRadius)
                ? [...this.borderRadius] as [number, number, number, number]
                : this.borderRadius,
            clipContent: this.clipContent,
            opacity: this.opacity,
        })
    }

    /** 序列化：仅输出非默认值属性 */
    public toJSON(): any {
        const json: Record<string, unknown> = {}
        if (this.backgroundColor !== 'transparent') json.backgroundColor = this.backgroundColor
        if (this.borderWidth !== 0) json.borderWidth = this.borderWidth
        if (this.borderColor !== 'transparent') json.borderColor = this.borderColor
        if (this.borderRadius !== 0) json.borderRadius = this.borderRadius
        if (this.clipContent !== false) json.clipContent = this.clipContent
        if (this.opacity !== 1) json.opacity = this.opacity
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

    private _normalizeRadii(): [number, number, number, number] {
        if (typeof this.borderRadius === 'number') {
            const r = this.borderRadius
            return [r, r, r, r]
        }
        return this.borderRadius
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
