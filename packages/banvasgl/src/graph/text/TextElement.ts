import { GraphType } from '@/foundation/constants'
import { Style, Color } from '@/foundation/style'
import TextOptions from './TextOptions'
import Graph from '@/graph/base/Graph'
import { MathUtils, Point3, Vector3, Matrix4 } from '@/foundation/math'
import Bounds from '@/graph/base/Bounds'
import { Rectangle } from '@/graph/combined'
import type { ITextElement, IPrintableTextElement, INonPrintableTextElement } from '@/types/graph/graph'
import type { ISerializable } from '@/types/foundation/serializable'
import { generateId } from '@/foundation/utils'

/**
 * 文字元素抽象基类。
 *
 * TextElement 是所有文字元素的公共基类，继承自 {@link Graph}，实现 {@link ITextElement} 接口。
 * 子类包括 {@link PrintableTextElement}（可打印的单字符元素）和 {@link NonPrintableTextElement}（不可打印的段落守卫）。
 *
 * **延迟测量机制**：文字尺寸的测量（`measureText`）依赖 Canvas 上下文，
 * 因此采用 **dirty flag + 延迟测量** 策略：
 * - 当 `content`/`options`/`style` 变化时，置 `_measureDirty = true`
 * - 在布局阶段由 `TextFields.layout()` 批量调用 {@link ensureMeasured}，传入 `bufferCtx` 执行实际测量
 * - 无 Canvas 上下文时（如 Node.js 后端环境）跳过测量并保持 dirty，等待后续有 ctx 时再执行
 *
 * **包围盒计算**（{@link updateBounds}）：
 * - 起点 `startPoint` = `(controlPoints[0].x, controlPoints[0].y - lineHeight + height, 0)`
 * - 宽度 = `width + letterSpacing`
 * - 高度 = `lineHeight`
 *
 * @abstract
 * @extends Graph
 * @implements ITextElement
 *
 * @example
 * ```ts
 * // TextElement 不可直接实例化，需通过子类使用
 * const ch = new PrintableTextElement('A', options, style);
 * ch.ensureMeasured(ctx); // 执行延迟测量
 * ch.applyLayout(new Point3(10, 30, 0), 24); // 设置布局位置
 * ```
 */
export default abstract class TextElement extends Graph implements ITextElement {
    /** 图形类型标识，由子类定义 */
    public abstract type: GraphType
    /** 控制点数组（文字元素通常只有一个控制点，表示文字位置） */
    public controlPoints: Point3[]
    /** 文字选项（字号、字体、颜色等） */
    public _options: TextOptions
    /** 文字内容 */
    public _content: string
    /** 是否已完成布局 */
    public isLayouted: boolean = false
    /** 文字宽度（测量后赋值） */
    public width: number = 0
    /** 文字高度（测量后赋值） */
    public height: number = 0
    /** 行高（由布局引擎赋值） */
    public lineHeight: number = 0
    /** 元素包围盒 */
    public bounds: Bounds

    /** 标记是否需要重新测量尺寸（延迟到 layout 阶段） */
    public _measureDirty: boolean = true

    /**
     * 判断图形是否闭合。文字元素为非闭合图形。
     *
     * @returns {boolean} 始终返回 `false`
     *
     * @example
     * ```ts
     * const ch = new PrintableTextElement('A', options, style);
     * ch.isClosed(); // false
     * ```
     */
    public isClosed(): boolean {
        return false;
    }

    /**
     * 创建文字元素实例。
     *
     * @param {string} content - 文字内容
     * @param {TextOptions} [options=TextOptions.DEFAULT] - 文字选项
     * @param {Style} [style=Style.DEFAULT] - 元素样式
     *
     * @example
     * ```ts
     * const ch = new PrintableTextElement('A', options, style);
     * ```
     */
    constructor(
        content: string,
        options: TextOptions = TextOptions.DEFAULT,
        _style?: Style
    ) {
        super()
        this._content = content
        this._options = options
        this.controlPoints = []
        this.bounds = Bounds.empty()
    }

    /**
     * 计算文字的实际宽高。由子类实现，使用 `ctx.measureText` 测量文字尺寸。
     *
     * @abstract
     * @protected
     * @param {CanvasRenderingContext2D} [ctx] - Canvas 2D 渲染上下文，用于 measureText
     *
     * @example
     * ```ts
     * // PrintableTextElement 中的实现：
     * protected calculateActualDimensions(ctx?: CanvasRenderingContext2D): void {
     *   ctx.font = this.options.fontString;
     *   const metrics = ctx.measureText(this._content);
     *   this.width = metrics.width;
     *   this.height = this.options.size;
     * }
     * ```
     */
    protected abstract calculateActualDimensions(ctx?: CanvasRenderingContext2D): void

    /**
     * 确保尺寸已测量（延迟测量的执行入口）。
     *
     * `TextFields.layout()` 在布局前批量调用此方法，传入 `bufferCtx` 避免依赖全局 CanvasContext。
     *
     * 当 `ctx` 为空时（如 Node.js 后端环境无 canvas），跳过测量并保持 dirty，
     * 等待后续有 ctx 时再执行。
     *
     * @param {CanvasRenderingContext2D} [ctx] - canvas context，用于 measureText
     *
     * @example
     * ```ts
     * const ch = new PrintableTextElement('A', options);
     * ch.ensureMeasured(ctx); // 若 dirty 则执行测量
     * ch._measureDirty; // false
     * ```
     */
    public ensureMeasured(ctx?: CanvasRenderingContext2D): void {
        if (!this._measureDirty) return
        if (!ctx) return // 无 context 时跳过，保持 dirty，后续渲染时重新触发
        this.calculateActualDimensions(ctx)
        this._measureDirty = false
    }

    /**
     * 应用布局位置和行高。由子类实现，在 `TextView` 布局阶段调用。
     *
     * @abstract
     * @param {Point3} point - 文字位置（控制点）
     * @param {number} lineHeight - 行高
     * @returns {this} 当前实例，支持链式调用
     *
     * @example
     * ```ts
     * ch.applyLayout(new Point3(10, 30, 0), 24);
     * ```
     */
    public abstract applyLayout(point: Point3, lineHeight: number): this

    /**
     * 计算文字元素在指定参数范围内的长度。文字元素长度始终为 0。
     *
     * @param {number} _tStart - 起始参数（未使用）
     * @param {number} _tEnd - 结束参数（未使用）
     * @returns {number} 始终返回 `0`
     *
     * @example
     * ```ts
     * ch.getLength(0, 1); // 0
     * ```
     */
    public getLength(_tStart: number, _tEnd: number): number {
        return 0
    }

    /**
     * 获取文字元素上指定参数 `t` 处的点。返回第一个控制点。
     *
     * @param {number} _t - 归一化参数（未使用）
     * @returns {Point3} 第一个控制点
     *
     * @example
     * ```ts
     * ch.getPointAt(0); // 控制点位置
     * ```
     */
    public getPointAt(_t: number): Point3 {
        return this.controlPoints[0]
    }

    /**
     * 更新文字元素的包围盒。
     *
     * 当元素已布局（`isLayouted` 且有控制点）时，基于 `controlPoints[0]`、`lineHeight`、`height` 和 `width + letterSpacing` 计算包围盒：
     * - 起点 `startPoint` = `(x, y - lineHeight + height, 0)` — 文字的基线位置经过行高修正
     * - 四个角点分别为 startPoint 及其向右、向下扩展
     *
     * 未布局时返回空包围盒。
     *
     * @returns {Bounds} 更新后的包围盒
     *
     * @example
     * ```ts
     * ch.applyLayout(new Point3(10, 30, 0), 24);
     * const bounds = ch.updateBounds();
     * // bounds.y ≈ 30 - 24 + height
     * ```
     */
    public updateBounds(): Bounds {
        if (this.isLayouted && this.controlPoints.length > 0) {
            const { x, y } = this.controlPoints[0]
            const startPoint = new Point3(
                x,
                y - this.lineHeight + this.height,
                0
            )
            const points = [
                startPoint,
                startPoint.add(
                    new Vector3(
                        this.width + this.options.letterSpacing,
                        0,
                        0
                    )
                ),
                startPoint.add(
                    new Vector3(
                        this.width + this.options.letterSpacing,
                        this.lineHeight,
                        0
                    )
                ),
                startPoint.add(new Vector3(0, this.lineHeight, 0)),
            ]
            return Bounds.fromPoints(points)
        } else {
            return Bounds.empty()
        }
    }

    /**
     * 设置文字选项。修改后标记 `_measureDirty = true`，延迟到 layout 阶段重新测量。
     *
     * @param {TextOptions} options - 新的文字选项
     *
     * @example
     * ```ts
     * ch.options = new TextOptions({ size: 24 });
     * ch._measureDirty; // true
     * ```
     */
    set options(options: TextOptions) {
        this._options = options
        // 标记需要重新测量尺寸（延迟到 layout 阶段）
        this._measureDirty = true
    }

    /**
     * 获取文字选项。
     *
     * @returns {TextOptions} 当前文字选项
     *
     * @example
     * ```ts
     * const opts = ch.options;
     * opts.size; // 16
     * ```
     */
    get options() {
        return this._options
    }

    /**
     * 设置文字内容。修改后标记 `_measureDirty = true`，延迟到 layout 阶段重新测量。
     *
     * @param {string} content - 新的文字内容
     *
     * @example
     * ```ts
     * ch.content = 'B';
     * ch._measureDirty; // true
     * ```
     */
    set content(content: string) {
        this._content = content
        // 标记需要重新测量尺寸（延迟到 layout 阶段）
        this._measureDirty = true
    }

    /**
     * 获取文字内容。
     *
     * @returns {string} 当前文字内容
     *
     * @example
     * ```ts
     * ch.content; // 'A'
     * ```
     */
    get content() {
        return this._content
    }


    /**
     * 将文字元素的矩形路径绘制到 Canvas 上下文中。
     *
     * 路径按包围盒的四条边绘制，当 `dependent` 为 `true` 时先调用 `ctx.beginPath()`。
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 渲染上下文
     * @param {boolean} dependent - 是否开启新路径
     *
     * @example
     * ```ts
     * ch.renderPath(ctx, true);
     * ctx.stroke(); // 描边包围盒路径
     * ```
     */
    public renderPath(ctx: CanvasRenderingContext2D, dependent: boolean): void {
        dependent && ctx.beginPath()
        const bounds = this.bounds
        ctx.moveTo(bounds.x, bounds.y)
        ctx.lineTo(bounds.x + bounds.width, bounds.y)
        ctx.lineTo(bounds.x + bounds.width, bounds.y + bounds.height)
        ctx.lineTo(bounds.x, bounds.y + bounds.height)
        ctx.lineTo(bounds.x, bounds.y)
    }

    /**
     * 渲染文字元素。由子类实现具体的渲染逻辑。
     *
     * @abstract
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 渲染上下文
     *
     * @example
     * ```ts
     * ch.render(ctx); // 绘制文字
     * ```
     */
    public abstract render(ctx: CanvasRenderingContext2D, style: Style): void

    /**
     * 判断给定点是否在曲线上。文字元素不支持曲线判定，始终返回 `false`。
     *
     * @param {Point3} _point - 待检测的点（未使用）
     * @param {number} [_tolerance=MathUtils.EPSILON] - 容差距离（未使用）
     * @returns {boolean} 始终返回 `false`
     *
     * @example
     * ```ts
     * ch.isPointOnCurve(new Point3(10, 10, 0)); // false
     * ```
     */
    isPointOnCurve(_point: Point3, _tolerance: number = MathUtils.EPSILON): boolean {
        return false
    }

    /**
     * 获取文字元素上指定参数 `t` 处的切线向量。始终返回 `(1, 0, 0)`。
     *
     * @param {number} _t - 归一化参数（未使用）
     * @returns {Vector3} 默认切线向量 `(1, 0, 0)`
     *
     * @example
     * ```ts
     * ch.getTangentAt(0); // Vector3(1, 0, 0)
     * ```
     */
    public getTangentAt(_t: number): Vector3 {
        return new Vector3(1, 0, 0)
    }

    /**
     * 获取文字元素上指定参数 `t` 处的法向量。始终返回 `(0, 1, 0)`。
     *
     * @param {number} _t - 归一化参数（未使用）
     * @returns {Vector3} 默认法向量 `(0, 1, 0)`
     *
     * @example
     * ```ts
     * ch.getNormalAt(0); // Vector3(0, 1, 0)
     * ```
     */
    public getNormalAt(_t: number): Vector3 {
        return new Vector3(0, 1, 0)
    }

    /**
     * 计算给定点到文字元素的最近点。文字元素不支持路径查询，返回默认值。
     *
     * @param {Point3} point - 待查询的点
     * @returns {{ distance: number; closestPoint: Point3; parameter: number }}
     *   默认返回 `distance = 0`、`closestPoint = point`、`parameter = 0`
     *
     * @example
     * ```ts
     * const result = ch.getClosestPoint(new Point3(10, 10, 0));
     * // { distance: 0, closestPoint: Point3(10,10,0), parameter: 0 }
     * ```
     */
    public getClosestPoint(point: Point3): {
        distance: number
        closestPoint: Point3
        parameter: number
    } {
        return { distance: 0, closestPoint: point, parameter: 0 }
    }

    /**
     * 计算文字元素的面积。文字元素面积始终为 0。
     *
     * @returns {number} 始终返回 `0`
     *
     * @example
     * ```ts
     * ch.getArea(); // 0
     * ```
     */
    public getArea(): number {
        return 0
    }

    /**
     * 计算文字元素的质心。返回第一个控制点，若无控制点则返回原点。
     *
     * @returns {Point3} 质心点
     *
     * @example
     * ```ts
     * ch.applyLayout(new Point3(10, 30, 0), 24);
     * ch.getCentroid(); // Point3(10, 30, 0)
     * ```
     */
    public getCentroid(): Point3 {
        return this.controlPoints[0] ?? new Point3(0, 0, 0)
    }

    /**
     * 对文字元素应用矩阵变换。
     *
     * 仅对第一个控制点应用矩阵乘法，然后重新计算包围盒。
     *
     * @param {Matrix4} matrix - 4×4 变换矩阵
     * @returns {Graph} 当前实例
     *
     * @example
     * ```ts
     * const moveMatrix = Matrix4.translation(10, 20, 0);
     * ch.transform(moveMatrix); // 控制点平移 (10, 20)
     * ```
     */
    public transform(matrix: Matrix4): Graph {
        if (this.controlPoints.length > 0) {
            this.controlPoints[0] = matrix.multiply(this.controlPoints[0])
            this.bounds = this.updateBounds()
        }
        return this
    }

    /**
     * 计算与另一个图形的相交点。
     *
     * 将文字元素视为由包围盒构成的矩形，委托给 {@link Rectangle.fromBounds} 进行求交计算。
     *
     * @param {Graph} other - 另一个图形
     * @returns {Point3[]} 相交点数组
     *
     * @example
     * ```ts
     * const pts = ch.intersect(line);
     * ```
     */
    public intersect(other: Graph): Point3[] {
        return Rectangle.fromBounds(
            this.bounds ?? this.updateBounds()
        ).intersect(other)
    }

    /**
     * 按比例缩放调整文字元素的字号。
     *
     * 根据 `resizeVector` 的长度和方向调整 `options.size`，
     * 确保 `size` 不会小于 0。
     *
     * @param {Point3} fixedPoint - 缩放固定点
     * @param {Point3} dynamicPoint - 缩放动态点
     * @param {Vector3} resizeVector - 缩放方向和幅值向量
     *
     * @example
     * ```ts
     * ch.resize(
     *   new Point3(0, 0, 0),
     *   new Point3(10, 10, 0),
     *   new Vector3(0, 5, 0)  // 增大字号
     * );
     * ```
     */
    public resize(
        fixedPoint: Point3,
        dynamicPoint: Point3,
        resizeVector: Vector3
    ): void {
        this.options.size = Math.max(
            0,
            this.options.size +
                resizeVector.length *
                    Math.sign(
                        dynamicPoint.subtract(fixedPoint).y * resizeVector.y
                    )
        )
    }

    /**
     * 设置指定索引的控制点。文字元素不支持单点顶点编辑，此方法为空操作。
     *
     * @param {number} _index - 控制点索引（未使用）
     * @param {Point3} _point - 新的控制点位置（未使用）
     *
     * @example
     * ```ts
     * ch.setControlPoint(0, new Point3(10, 10, 0)); // 无效果
     * ```
     */
    public setControlPoint(_index: number, _point: Point3): void {}

    /**
     * 复制文字元素。由子类实现。
     *
     * @abstract
     * @returns {this} 新的文字元素实例
     *
     * @example
     * ```ts
     * const copy = ch.copy();
     * ```
     */
    public abstract copy(): this
}

/**
 * 可打印文字元素类。
 *
 * PrintableTextElement 继承自 {@link TextElement}，实现 {@link IPrintableTextElement} 和 {@link ISerializable} 接口，
 * 表示 **单个可打印字符**，是文字布局系统中的最小单位。
 *
 * **单字符约束**：构造时强制要求 `content.length === 1`，否则抛出错误。
 * 这是因为排版引擎以单字符为粒度进行布局和换行计算。
 *
 * **尺寸测量**（{@link calculateActualDimensions}）：通过 `ctx.measureText` 测量字符宽度，
 * 高度直接取 `options.size`（即字号）。
 *
 * **布局**（{@link applyLayout}）：设置控制点位置和行高，然后重新计算包围盒。
 * 文字包围盒为 `options.size × lineHeight`，控制点不在包围盒左上角而在文字的绘制起点。
 *
 * **静态工厂方法**：
 * - {@link simple}：创建简单文字元素
 * - {@link title}：创建标题文字元素
 * - {@link bold}：创建粗体文字元素
 * - {@link italic}：创建斜体文字元素
 *
 * @extends TextElement
 * @implements IPrintableTextElement
 * @implements ISerializable
 *
 * @example
 * ```ts
 * const ch = PrintableTextElement.simple('A', 24, '#333333');
 * ch.ensureMeasured(ctx);
 * ch.applyLayout(new Point3(10, 30, 0), 28);
 * ch.render(ctx);
 * ```
 */
export class PrintableTextElement extends TextElement implements IPrintableTextElement, ISerializable {
    /** 图形类型标识 */
    public type: GraphType = GraphType.PRINTABLE_TEXTELEMENT

    /**
     * 创建可打印文字元素实例。
     *
     * @param {string} content - 单个字符内容（长度必须为 1）
     * @param {TextOptions} [options=TextOptions.DEFAULT] - 文字选项
     * @param {Style} [style=Style.DEFAULT] - 元素样式
     * @throws {Error} 当 `content.length !== 1` 时抛出错误
     *
     * @example
     * ```ts
     * const ch = new PrintableTextElement('A', options, style);
     * ```
     */
    constructor(
        content: string,
        options: TextOptions = TextOptions.DEFAULT,
        _style?: Style
    ) {
        super(content, options)

        if (content.length !== 1)
            throw new Error(
                'PrintableTextElement content must be a single character'
            )

        // 标记 dirty，延迟到 layout 阶段由 TextFields.layout() 批量测量
        this._measureDirty = true
        this.id = generateId(this.type)
    }

    /**
     * 计算文字的实际宽高。
     *
     * 使用 `ctx.measureText` 测量字符宽度，高度直接取 `options.size`（字号）。
     * 必须传入有效的 Canvas 上下文，否则抛出错误。
     *
     * @protected
     * @param {CanvasRenderingContext2D} [ctx] - Canvas 2D 渲染上下文，用于 measureText
     * @throws {Error} 当未传入 `ctx` 时抛出错误
     *
     * @example
     * ```ts
     * ch.calculateActualDimensions(ctx);
     * ch.width;  // 测量后的宽度
     * ch.height; // options.size
     * ```
     */
    protected calculateActualDimensions(ctx?: CanvasRenderingContext2D): void {
        if (!ctx) throw new Error('calculateActualDimensions: 需要传入 ctx')
        ctx.save()
        // 设置字体样式
        ctx.font = this.options.fontString

        // 测量文字尺寸
        const metrics = ctx.measureText(this._content)
        this.width = metrics.width
        this.height = this.options.size
        ctx.restore()
    }

    /**
     * 设置文字内容。覆写基类 setter，强制单字符约束。
     *
     * @param {string} content - 新的单字符内容（长度不能超过 1）
     * @throws {Error} 当 `content.length > 1` 时抛出错误
     *
     * @example
     * ```ts
     * ch.content = 'B';
     * ch.content = 'AB'; // Error: must be a single character
     * ```
     */
    set content(content: string) {
        if (content.length > 1)
            throw new Error(
                'PrintableTextElement content must be a single character'
            )
        super.content = content
    }

    /**
     * 获取文字内容。
     *
     * @returns {string} 当前单字符内容
     *
     * @example
     * ```ts
     * ch.content; // 'A'
     * ```
     */
    get content(): string {
        return super.content
    }

    /**
     * 应用布局位置和行高，在 `TextView` 布局阶段调用。
     *
     * 设置控制点位置、标记已布局、赋值行高，然后重新计算包围盒。
     *
     * @param {Point3} position - 文字绘制起点
     * @param {number} lineHeight - 行高
     * @returns {this} 当前实例，支持链式调用
     *
     * @example
     * ```ts
     * ch.applyLayout(new Point3(10, 30, 0), 24);
     * ch.isLayouted; // true
     * ```
     */
    public applyLayout(position: Point3, lineHeight: number): this {
        this.isLayouted = true
        this.controlPoints = [position.copy()]
        this.lineHeight = lineHeight
        // 计算包围盒并设置正确的controlPoints
        this.bounds = this.updateBounds()
        return this
    }

    /**
     * 渲染可打印文字元素。
     *
     * 设置字体样式和文字基线（`textBaseline = 'top'`），应用元素样式，
     * 使用 `options.color` 作为文字颜色（在应用样式后设置，确保不被覆盖），
     * 然后调用 `ctx.fillText` 在控制点位置绘制字符。
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 渲染上下文
     *
     * @example
     * ```ts
     * ch.render(ctx); // 在画布上绘制字符
     * ```
     */
    public render(ctx: CanvasRenderingContext2D, style: Style): void {
        ctx.save()

        // 设置字体样式
        ctx.font = this.options.fontString
        //字体基线
        ctx.textBaseline = 'top'

        // 应用样式（但不覆盖文字颜色）
        const bounds = this.bounds
        style.applyToContext(ctx, Math.abs(bounds.width), Math.abs(bounds.height))

        // 设置文字颜色（在应用样式后设置，确保不被覆盖）
        ctx.fillStyle = this.options.color.rgba
        // 绘制文字
        ctx.fillText(
            super.content,
            this.controlPoints[0].x,
            this.controlPoints[0].y
        )
        ctx.restore()
    }

    /**
     * 复制可打印文字元素。
     *
     * 创建一个相同内容、选项和样式的新实例，若原实例已布局则同步布局信息。
     *
     * @returns {this} 新的可打印文字元素实例
     *
     * @example
     * ```ts
     * const copy = ch.copy();
     * copy.content; // 与原实例相同
     * ```
     */
    public copy(): this {
        const newElement = new PrintableTextElement(
            super.content,
            super.options.copy(),
        )

        if (this.isLayouted) {
            newElement.applyLayout(this.controlPoints[0].copy(), this.lineHeight)
        }
        return newElement as this
    }

    /**
     * 静态工厂方法 — 创建简单文字元素。
     *
     * @param {string} content - 单字符内容
     * @param {number} [size=16] - 字号，默认 16
     * @param {string} [color='#000000'] - 文字颜色（十六进制），默认黑色
     * @returns {PrintableTextElement} 新的可打印文字元素
     *
     * @example
     * ```ts
     * const ch = PrintableTextElement.simple('A', 24, '#333333');
     * ```
     */
    static simple(
        content: string,
        size: number = 16,
        color: string = '#000000'
    ): PrintableTextElement {
        const options = new TextOptions()
        options.size = size
        // 从字符串创建Color对象
        const colorObj = Color.fromHex(color)
        options.color = colorObj

        return new PrintableTextElement(content, options)
    }

    // ── 序列化 ──

    /**
     * 将可打印文字元素序列化为 JSON 对象，用于持久化存储。
     *
     * @returns {any} 包含 id、type、$class、content、options 和 style 的 JSON 对象
     *
     * @example
     * ```ts
     * const json = ch.toJSON();
     * // { id: '...', type: 7, $class: 'PrintableTextElement', content: 'A', options: {...}, style: {...} }
     * ```
     */
    toJSON(): any {
        return {
            id: this.id,
            type: this.type,
            $class: 'PrintableTextElement',
            content: super.content,
            options: super.options.toJSON(),
        }
    }

    /**
     * 从 JSON 对象反序列化创建可打印文字元素。
     *
     * @param {any} data - 序列化后的 JSON 数据
     * @returns {PrintableTextElement} 恢复的可打印文字元素实例
     *
     * @example
     * ```ts
     * const ch = PrintableTextElement.fromJSON(jsonData);
     * ```
     */
    static fromJSON(data: any): PrintableTextElement {
        // 容错：content 必须是单字符（构造函数会校验），历史 / 异常数据可能为
        // 空串或多字符，此处回退到一个空格占位，避免反序列化整棵 appJSON 时抛错白屏。
        const rawContent = typeof data?.content === 'string' ? data.content : ''
        const content = rawContent.length === 1 ? rawContent : (rawContent[0] ?? ' ')
        const el = new PrintableTextElement(
            content,
            TextOptions.fromJSON(data?.options),
        )
        if (data?.id) el.id = data.id
        return el
    }

    /**
     * 静态工厂方法 — 创建标题文字元素。
     *
     * 使用 `TextOptions.title()` 选项，字号默认 24。
     *
     * @param {string} content - 单字符内容
     * @param {number} [size=24] - 字号，默认 24
     * @returns {PrintableTextElement} 标题文字元素
     *
     * @example
     * ```ts
     * const ch = PrintableTextElement.title('H', 32);
     * ```
     */
    static title(content: string, size: number = 24): PrintableTextElement {
        const options = TextOptions.title()
        options.size = size

        return new PrintableTextElement(content, options)
    }

    /**
     * 静态工厂方法 — 创建粗体文字元素。
     *
     * 使用 `TextOptions.bold()` 选项，字号默认 16。
     *
     * @param {string} content - 单字符内容
     * @param {number} [size=16] - 字号，默认 16
     * @returns {PrintableTextElement} 粗体文字元素
     *
     * @example
     * ```ts
     * const ch = PrintableTextElement.bold('B');
     * ```
     */
    static bold(content: string, size: number = 16): PrintableTextElement {
        const options = TextOptions.bold()
        options.size = size

        return new PrintableTextElement(content, options)
    }

    /**
     * 静态工厂方法 — 创建斜体文字元素。
     *
     * 使用 `TextOptions.italic()` 选项，字号默认 16。
     *
     * @param {string} content - 单字符内容
     * @param {number} [size=16] - 字号，默认 16
     * @returns {PrintableTextElement} 斜体文字元素
     *
     * @example
     * ```ts
     * const ch = PrintableTextElement.italic('I');
     * ```
     */
    static italic(content: string, size: number = 16): PrintableTextElement {
        const options = TextOptions.italic()
        options.size = size

        return new PrintableTextElement(content, options)
    }
}

/**
 * 不可打印文字元素类。
 *
 * NonPrintableTextElement 继承自 {@link TextElement}，实现 {@link INonPrintableTextElement} 和 {@link ISerializable} 接口，
 * 用作 **段落守卫** — 在文字布局系统中占据空行位置，不会渲染到屏幕上。
 *
 * **使用场景**：空行占位与交互。在排版引擎中，段落之间的空行由 NonPrintableTextElement 表示，
 * 确保光标定位和选区操作能正确跨越空行。
 *
 * **固定尺寸**：`width = 2`，`height = 0`。`height` 始终为 0 是有意设计：
 * 在 `layoutTextElementsInParagraph` 中 `currentY + lineHeight - textElement.height` 的计算
 * 在每次重新布局时都保持一致。
 *
 * **包围盒**（{@link updateBounds}）：高度通过 `lineHeight` 表达，与 {@link PrintableTextElement} 的模式对齐。
 * `bounds.y = controlPoints[0].y - lineHeight`，`bounds.height = lineHeight`。
 *
 * @extends TextElement
 * @implements INonPrintableTextElement
 * @implements ISerializable
 *
 * @example
 * ```ts
 * const guard = new NonPrintableTextElement();
 * guard.applyLayout(new Point3(10, 50, 0), 24);
 * guard.render(ctx); // 不渲染任何内容
 * ```
 */
export class NonPrintableTextElement extends TextElement implements INonPrintableTextElement, ISerializable {
    /** 图形类型标识 */
    public type: GraphType = GraphType.NONPRINTABLE_TEXTELEMENT

    /**
     * 创建不可打印文字元素实例。
     *
     * 内容为空字符串，使用默认选项和样式，立即计算固定尺寸（`width = 2, height = 0`），
     * 标记 `_measureDirty = false`（固定尺寸，无需延迟测量）。
     *
     * @example
     * ```ts
     * const guard = new NonPrintableTextElement();
     * guard.width;  // 2
     * guard.height; // 0
     * ```
     */
    constructor() {
        super('', TextOptions.DEFAULT)
        this.calculateActualDimensions()
        this._measureDirty = false  // 固定尺寸，无需延迟
        this.id = generateId(this.type)
    }

    // ── 序列化 ──

    /**
     * 将不可打印文字元素序列化为 JSON 对象，用于持久化存储。
     *
     * @returns {any} 仅包含 id、type 和 $class 的 JSON 对象
     *
     * @example
     * ```ts
     * const json = guard.toJSON();
     * // { id: '...', type: 8, $class: 'NonPrintableTextElement' }
     * ```
     */
    toJSON(): any {
        return {
            id: this.id,
            type: this.type,
            $class: 'NonPrintableTextElement',
        }
    }

    /**
     * 从 JSON 对象反序列化创建不可打印文字元素。
     *
     * @param {any} data - 序列化后的 JSON 数据
     * @returns {NonPrintableTextElement} 恢复的不可打印文字元素实例
     *
     * @example
     * ```ts
     * const guard = NonPrintableTextElement.fromJSON(jsonData);
     * ```
     */
    static fromJSON(data: any): NonPrintableTextElement {
        const el = new NonPrintableTextElement()
        el.id = data.id
        return el
    }

    /**
     * 应用布局位置和行高，在 `TextView` 布局阶段调用。
     *
     * 注意：不修改 `this.height`（始终保持为 0），这样 `layoutTextElementsInParagraph`
     * 中 `currentY + lineHeight - textElement.height` 的计算在每次重新布局时都一致。
     * 包围盒的高度通过 `lineHeight` 表达，与 {@link PrintableTextElement} 的模式对齐。
     *
     * @param {Point3} position - 文字位置（控制点）
     * @param {number} lineHeight - 行高
     * @returns {this} 当前实例，支持链式调用
     *
     * @example
     * ```ts
     * guard.applyLayout(new Point3(10, 50, 0), 24);
     * guard.isLayouted; // true
     * ```
     */
    public applyLayout(position: Point3, lineHeight: number): this {
        this.isLayouted = true
        this.controlPoints = [position.copy()]
        this.lineHeight = lineHeight
        // 计算包围盒并设置正确的controlPoints
        this.bounds = this.updateBounds()
        return this
    }

    /**
     * 计算文字的实际宽高（固定尺寸，不需要 ctx）。
     *
     * 固定设置 `width = 2`、`height = 0`。
     * `height = 0` 是有意设计，确保布局引擎在重新布局时计算一致。
     *
     * @protected
     * @param {CanvasRenderingContext2D} [_ctx] - 未使用
     *
     * @example
     * ```ts
     * guard.calculateActualDimensions();
     * guard.width;  // 2
     * guard.height; // 0
     * ```
     */
    protected calculateActualDimensions(_ctx?: CanvasRenderingContext2D): void {
        this.width = 2
        this.height = 0
    }

    /**
     * 计算包围盒。
     *
     * NonPrintable 的 `height` 始终为 0，`position.y = currentY + lineHeight`（由布局引擎设置）。
     * 包围盒 `y` 起点 = `position.y - lineHeight = currentY`，高度 = `lineHeight`。
     * 这与 {@link PrintableTextElement} 的 `updateBounds` 逻辑等价：
     *   `startPoint.y = position.y - lineHeight + height`
     * 当 `height = 0` 时简化为 `position.y - lineHeight`。
     *
     * @returns {Bounds} 包围盒
     *
     * @example
     * ```ts
     * guard.applyLayout(new Point3(10, 50, 0), 24);
     * guard.updateBounds(); // Bounds { x: 10, y: 26, width: 2, height: 24 }
     * ```
     */
    public updateBounds(): Bounds {
        return new Bounds(
            this.controlPoints[0].x,
            this.controlPoints[0].y - this.lineHeight,
            this.width + this.options.letterSpacing,
            this.lineHeight
        )
    }

    /**
     * 渲染文字元素。不可打印元素不渲染任何内容，方法体为空。
     *
     * @param {CanvasRenderingContext2D} _ctx - Canvas 2D 渲染上下文（未使用）
     *
     * @example
     * ```ts
     * guard.render(ctx); // 无任何绘制
     * ```
     */
    public render(_ctx: CanvasRenderingContext2D, _style: Style): void {
        // 不可打印元素不渲染任何内容
    }

    /**
     * 复制不可打印文字元素。
     *
     * 创建一个新的 {@link NonPrintableTextElement} 实例，若原实例已布局则同步布局信息。
     *
     * @returns {this} 新的不可打印文字元素实例
     *
     * @example
     * ```ts
     * const copy = guard.copy();
     * ```
     */
    public copy(): this {
        const newElement = new NonPrintableTextElement()

        if (this.isLayouted) {
            newElement.applyLayout(this.controlPoints[0].copy(), this.lineHeight)
        }
        return newElement as this
    }
}
