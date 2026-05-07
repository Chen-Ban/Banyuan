import { GRAPHTYPE } from '@/core/constants'
import Style from '@/core/style/Style'
import { Point3, Vector3 } from '@/core/math'
import CombinedGraph from '@/core/graph/combined/CombinedGraph'
import Line from '@/core/graph/analytic/Line'
import Arc from '@/core/graph/analytic/Arc'
import { IRoundedRect, ISerializable } from '@/core/interfaces'
import { generateId } from '@/core/utils'

/**
 * RoundedRect — 圆角矩形
 *
 * 内部由 8 段图形组成（顺时针，从左上角切点出发）：
 *   Arc(左上) → Line(上边) → Arc(右上) → Line(右边)
 *   → Arc(右下) → Line(下边) → Arc(左下) → Line(左边)
 *
 * 控制点（共 8 个）：
 *   index 0 = 左上角点  (x,       y)
 *   index 1 = 右上角点  (x+w,     y)
 *   index 2 = 右下角点  (x+w,   y+h)
 *   index 3 = 左下角点  (x,     y+h)
 *   index 4 = 左上圆角切点（上边切点，位于左上角右侧 r[0] 处）
 *   index 5 = 右上圆角切点（上边切点，位于右上角左侧 r[1] 处）
 *   index 6 = 右下圆角切点（下边切点，位于右下角左侧 r[2] 处）
 *   index 7 = 左下圆角切点（下边切点，位于左下角右侧 r[3] 处）
 *
 * 拖拽角点（0-3）：改变宽高（矩形大小）
 * 拖拽圆角点（4-7）：改变对应角的圆角半径
 */
export default class RoundedRect extends CombinedGraph implements IRoundedRect, ISerializable {
    public type: GRAPHTYPE = GRAPHTYPE.ROUNDED_RECT

    public x: number
    public y: number
    public width: number
    public height: number
    /** [左上, 右上, 右下, 左下] */
    public radii: [number, number, number, number]

    constructor(
        x: number,
        y: number,
        width: number,
        height: number,
        radii: [number, number, number, number] | number = 0,
        style?: Style
    ) {
        super([], style)
        this.x = x
        this.y = y
        this.width = Math.max(0, width)
        this.height = Math.max(0, height)

        const r = typeof radii === 'number' ? [radii, radii, radii, radii] as [number, number, number, number] : radii
        this.radii = this._clampRadii(r)

        this._rebuild()
        this.id = generateId(this.type)
    }

    // ─────────────────────────────────────────────
    //  IRoundedRect 接口方法
    // ─────────────────────────────────────────────

    public setPosition(x: number, y: number): RoundedRect {
        this.x = x
        this.y = y
        this._rebuild()
        return this
    }

    public setSize(width: number, height: number): RoundedRect {
        this.width = Math.max(0, width)
        this.height = Math.max(0, height)
        this.radii = this._clampRadii(this.radii)
        this._rebuild()
        return this
    }

    public setRadius(index: 0 | 1 | 2 | 3, radius: number): RoundedRect {
        this.radii[index] = Math.max(0, radius)
        this.radii = this._clampRadii(this.radii)
        this._rebuild()
        return this
    }

    public setAllRadii(radius: number): RoundedRect {
        const r = Math.max(0, radius)
        this.radii = this._clampRadii([r, r, r, r])
        this._rebuild()
        return this
    }

    public getCenter(): Point3 {
        return new Point3(this.x + this.width / 2, this.y + this.height / 2, 0)
    }

    // ─────────────────────────────────────────────
    //  控制点
    // ─────────────────────────────────────────────

    /**
     * 返回 8 个控制点：
     *   0-3: 四个角点（左上、右上、右下、左下）
     *   4-7: 四个圆角切点（左上、右上、右下、左下各角的"上边"切点）
     */
    public get controlPoints(): Point3[] {
        const { x, y, width: w, height: h } = this
        const [rtl, rtr, rbr, rbl] = this.radii

        return [
            // 角点
            new Point3(x,     y,     0),   // 0 左上
            new Point3(x + w, y,     0),   // 1 右上
            new Point3(x + w, y + h, 0),   // 2 右下
            new Point3(x,     y + h, 0),   // 3 左下
            // 圆角切点（取各角"水平方向"切点，便于直观拖拽）
            new Point3(x + rtl,     y,     0),   // 4 左上圆角（上边切点）
            new Point3(x + w - rtr, y,     0),   // 5 右上圆角（上边切点）
            new Point3(x + w - rbr, y + h, 0),   // 6 右下圆角（下边切点）
            new Point3(x + rbl,     y + h, 0),   // 7 左下圆角（下边切点）
        ]
    }

    /**
     * 设置控制点：
     *   index 0-3: 角点 → 调整宽高（以对角为锚点）
     *   index 4-7: 圆角切点 → 调整对应角的圆角半径
     */
    public setControlPoint(index: number, point: Point3): void {
        const { x, y, width: w, height: h } = this

        if (index === 0) {
            // 左上角：右下角固定
            const newW = (x + w) - point.x
            const newH = (y + h) - point.y
            this.x = point.x
            this.y = point.y
            this.width = Math.max(0, newW)
            this.height = Math.max(0, newH)
        } else if (index === 1) {
            // 右上角：左下角固定
            const newW = point.x - x
            const newH = (y + h) - point.y
            this.y = point.y
            this.width = Math.max(0, newW)
            this.height = Math.max(0, newH)
        } else if (index === 2) {
            // 右下角：左上角固定
            this.width = Math.max(0, point.x - x)
            this.height = Math.max(0, point.y - y)
        } else if (index === 3) {
            // 左下角：右上角固定
            const newW = (x + w) - point.x
            const newH = point.y - y
            this.x = point.x
            this.width = Math.max(0, newW)
            this.height = Math.max(0, newH)
        } else if (index === 4) {
            // 左上圆角：水平距离 = 切点 x - 矩形左边
            const r = Math.max(0, point.x - this.x)
            this.radii[0] = r
        } else if (index === 5) {
            // 右上圆角：水平距离 = 矩形右边 - 切点 x
            const r = Math.max(0, (this.x + this.width) - point.x)
            this.radii[1] = r
        } else if (index === 6) {
            // 右下圆角：水平距离 = 矩形右边 - 切点 x
            const r = Math.max(0, (this.x + this.width) - point.x)
            this.radii[2] = r
        } else if (index === 7) {
            // 左下圆角：水平距离 = 切点 x - 矩形左边
            const r = Math.max(0, point.x - this.x)
            this.radii[3] = r
        }

        this.radii = this._clampRadii(this.radii)
        this._rebuild()
    }

    // ─────────────────────────────────────────────
    //  渲染
    // ─────────────────────────────────────────────

    public render(ctx: CanvasRenderingContext2D): void {
        const bounds = this.bounds
        ctx.save()
        this.style.applyToContext(ctx, bounds.width, bounds.height)
        ctx.beginPath()
        this._buildPath(ctx)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
        ctx.restore()
    }

    public renderPath(ctx: CanvasRenderingContext2D, dependent: Boolean): void {
        dependent && ctx.beginPath()
        this._buildPath(ctx)
        ctx.closePath()
    }

    // ─────────────────────────────────────────────
    //  resize（整体缩放）
    // ─────────────────────────────────────────────

    public resize(fixedPoint: Point3, dynamicPoint: Point3, resizeVector: Vector3): void {
        const referenceVector = dynamicPoint.subtract(fixedPoint)
        const w = Math.abs(referenceVector.x) || Infinity
        const h = Math.abs(referenceVector.y) || Infinity
        const scaleX = 1 + resizeVector.x * Math.sign(referenceVector.x) / w
        const scaleY = 1 + resizeVector.y * Math.sign(referenceVector.y) / h

        this.x *= scaleX
        this.y *= scaleY
        this.width = Math.max(0, this.width * scaleX)
        this.height = Math.max(0, this.height * scaleY)
        // 圆角半径等比缩放（取两轴最小缩放比，保持视觉一致）
        const scale = Math.min(Math.abs(scaleX), Math.abs(scaleY))
        this.radii = this._clampRadii(this.radii.map(r => r * scale) as [number, number, number, number])

        this._rebuild()
        const orientX = referenceVector.x - resizeVector.x > 0
        const orientY = referenceVector.y - resizeVector.y > 0
        this.bounds = this.updateBounds(orientX, orientY)
    }

    // ─────────────────────────────────────────────
    //  序列化
    // ─────────────────────────────────────────────

    public toJSON(): any {
        return {
            id: this.id,
            type: this.type,
            x: this.x,
            y: this.y,
            width: this.width,
            height: this.height,
            radii: [...this.radii],
            style: this.style.toJSON(),
        }
    }

    public static fromJSON(data: any): RoundedRect {
        const rr = new RoundedRect(
            data.x,
            data.y,
            data.width,
            data.height,
            data.radii as [number, number, number, number],
            data.style ? Style.fromJSON(data.style) : undefined
        )
        rr.id = data.id
        return rr
    }

    public copy(): this {
        return new RoundedRect(
            this.x,
            this.y,
            this.width,
            this.height,
            [...this.radii] as [number, number, number, number],
            this.style.copy()
        ) as this
    }

    // ─────────────────────────────────────────────
    //  私有辅助
    // ─────────────────────────────────────────────

    /**
     * 限制圆角半径：每个角的半径不超过相邻两边长度的一半
     * 若两角半径之和超过对应边长，则等比缩小
     */
    private _clampRadii(radii: [number, number, number, number]): [number, number, number, number] {
        let [rtl, rtr, rbr, rbl] = radii.map(r => Math.max(0, r))
        const w = this.width
        const h = this.height

        // 水平方向：左上+右上 ≤ width，左下+右下 ≤ width
        const topScale = rtl + rtr > w ? w / (rtl + rtr) : 1
        const botScale = rbl + rbr > w ? w / (rbl + rbr) : 1
        // 垂直方向：左上+左下 ≤ height，右上+右下 ≤ height
        const leftScale = rtl + rbl > h ? h / (rtl + rbl) : 1
        const rightScale = rtr + rbr > h ? h / (rtr + rbr) : 1

        const s = Math.min(topScale, botScale, leftScale, rightScale)
        return [rtl * s, rtr * s, rbr * s, rbl * s]
    }

    /**
     * 重建内部 graphs（4 段 Arc + 4 段 Line）并更新 bounds
     *
     * 顺序（顺时针）：
     *   Arc(左上) → Line(上) → Arc(右上) → Line(右)
     *   → Arc(右下) → Line(下) → Arc(左下) → Line(左)
     */
    private _rebuild(): void {
        const { x, y, width: w, height: h, style } = this
        const [rtl, rtr, rbr, rbl] = this.radii

        // 各角圆心
        const cTL = new Point3(x + rtl,     y + rtl,     0)
        const cTR = new Point3(x + w - rtr, y + rtr,     0)
        const cBR = new Point3(x + w - rbr, y + h - rbr, 0)
        const cBL = new Point3(x + rbl,     y + h - rbl, 0)

        // 各角弧的切点（顺时针，起点/终点）
        // 左上角：从左边切点（上方）→ 上边切点（右方），角度 π → 3π/2（顺时针即 anticlockwise=false）
        // Canvas arc: clockwise=false 表示逆时针，clockwise=true 表示顺时针
        // 我们用 Arc 类，clockwise=false 表示逆时针（Canvas 默认）
        // 顺时针绘制圆角矩形，每个角弧都是顺时针 90°

        const PI = Math.PI

        // 左上角弧：圆心 cTL，从 π（左）到 3π/2（上），顺时针
        const arcTL = new Arc(cTL, rtl, rtl, 0, PI,       PI * 1.5, false, style)
        // 右上角弧：圆心 cTR，从 3π/2（上）到 0（右），顺时针
        const arcTR = new Arc(cTR, rtr, rtr, 0, PI * 1.5, PI * 2,   false, style)
        // 右下角弧：圆心 cBR，从 0（右）到 π/2（下），顺时针
        const arcBR = new Arc(cBR, rbr, rbr, 0, 0,        PI * 0.5, false, style)
        // 左下角弧：圆心 cBL，从 π/2（下）到 π（左），顺时针
        const arcBL = new Arc(cBL, rbl, rbl, 0, PI * 0.5, PI,       false, style)

        // 四条直线（连接相邻弧的端点）
        // 上边：arcTL 终点 → arcTR 起点
        const linTop = new Line(
            new Point3(x + rtl,     y,     0),
            new Point3(x + w - rtr, y,     0),
            style
        )
        // 右边：arcTR 终点 → arcBR 起点
        const linRight = new Line(
            new Point3(x + w, y + rtr,     0),
            new Point3(x + w, y + h - rbr, 0),
            style
        )
        // 下边：arcBR 终点 → arcBL 起点（从右到左）
        const linBot = new Line(
            new Point3(x + w - rbr, y + h, 0),
            new Point3(x + rbl,     y + h, 0),
            style
        )
        // 左边：arcBL 终点 → arcTL 起点（从下到上）
        const linLeft = new Line(
            new Point3(x, y + h - rbl, 0),
            new Point3(x, y + rtl,     0),
            style
        )

        this.graphs = [arcTL, linTop, arcTR, linRight, arcBR, linBot, arcBL, linLeft]
        this.bounds = this.updateBounds(true, true)
        this.transfromOrigin = this.getCenter()
    }

    /**
     * 直接用 Canvas API 绘制圆角矩形路径（比逐段渲染更精确）
     */
    private _buildPath(ctx: CanvasRenderingContext2D): void {
        const { x, y, width: w, height: h } = this
        const [rtl, rtr, rbr, rbl] = this.radii
        const PI = Math.PI

        ctx.moveTo(x + rtl, y)
        ctx.lineTo(x + w - rtr, y)
        ctx.arc(x + w - rtr, y + rtr,     rtr, PI * 1.5, PI * 2,   false)
        ctx.lineTo(x + w, y + h - rbr)
        ctx.arc(x + w - rbr, y + h - rbr, rbr, 0,        PI * 0.5, false)
        ctx.lineTo(x + rbl, y + h)
        ctx.arc(x + rbl,     y + h - rbl, rbl, PI * 0.5, PI,       false)
        ctx.lineTo(x, y + rtl)
        ctx.arc(x + rtl,     y + rtl,     rtl, PI,       PI * 1.5, false)
    }
}
