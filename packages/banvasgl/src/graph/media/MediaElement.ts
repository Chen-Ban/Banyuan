import Graph from '@/graph/base/Graph'
import { Point3, Vector3, Matrix4 } from '@/foundation/math'
import { Style } from '@/foundation/style'
import Bounds from '@/graph/base/Bounds'
import Rectangle from '@/graph/combined/Polygon/Rectangle'
import { IMediaElement } from '@/types'

/**
 * 媒体元素抽象基类。
 *
 * MediaElement 是所有矩形媒体元素（如图片 {@link ImageElement}、视频 {@link VideoElement}）的公共基类，
 * 继承自 {@link Graph}，并实现 {@link IMediaElement} 接口。
 *
 * 坐标系约定：以左上角 `(x, y)` 为定位原点，`width` 和 `height` 分别表示矩形的宽和高，
 * 四个控制点（{@link controlPoints}）按 **左上 → 右上 → 右下 → 左下** 的顺序排列。
 *
 * 本类提供了矩形周长上的参数化路径查询（{@link getPointAt}、{@link getTangentAt}、{@link getNormalAt}）、
 * 最近点计算（{@link getClosestPoint}）、矩阵变换（{@link transform}）、
 * 控制点同步（{@link syncFromControlPoints}）等核心能力。
 *
 * 子类需实现 {@link loadMedia}（加载媒体资源）、{@link renderPlaceholder}（占位渲染）和 {@link getImageData}（像素提取）。
 *
 * @abstract
 * @extends Graph
 * @implements IMediaElement
 *
 * @example
 * ```ts
 * // MediaElement 不可直接实例化，需通过子类使用
 * const img = new ImageElement('https://example.com/photo.jpg', 10, 20, 300, 200);
 * const point = img.getPointAt(0.25); // 矩形周长 25% 处的点
 * ```
 */
export default abstract class MediaElement extends Graph implements IMediaElement {
    /** 矩形四个角的控制点，顺序为：左上、右上、右下、左下 */
    public controlPoints: Point3[]
    /** 元素包围盒 */
    public bounds: Bounds

    /**
     * 判断图形是否闭合。媒体元素为矩形区域，始终闭合。
     *
     * @returns {boolean} 始终返回 `true`
     *
     * @example
     * ```ts
     * const img = new ImageElement('a.jpg', 0, 0, 100, 100);
     * img.isClosed(); // true
     * ```
     */
    public isClosed(): boolean {
        return true;
    }

    /** 矩形左上角 x 坐标 */
    public x: number
    /** 矩形左上角 y 坐标 */
    public y: number
    /** 矩形宽度，默认 100 */
    public width: number = 100
    /** 矩形高度，默认 100 */
    public height: number = 100
    /** 媒体原始宽度（加载完成后赋值） */
    public actualWidth: number = 0
    /** 媒体原始高度（加载完成后赋值） */
    public actualHeight: number = 0
    /** 媒体是否已加载完成 */
    public loaded: boolean = false
    /** 媒体资源 URL */
    public src: string = ''

    /**
     * 创建媒体元素实例。
     *
     * 构造时自动初始化四个角控制点、计算包围盒，并调用 {@link loadMedia} 开始异步加载媒体资源。
     *
     * @param {string} src - 媒体资源的 URL 地址
     * @param {number} x - 矩形左上角 x 坐标
     * @param {number} y - 矩形左上角 y 坐标
     * @param {number} width - 矩形宽度
     * @param {number} height - 矩形高度
     * @param {Style} [style=Style.DEFAULT] - 元素样式，默认为 `Style.DEFAULT`
     *
     * @example
     * ```ts
     * const img = new ImageElement('photo.jpg', 10, 20, 300, 200);
     * ```
     */
    constructor(
        src: string,
        x: number,
        y: number,
        width: number,
        height: number,
        _style?: Style
    ) {
        super()
        this.src = src
        this.x = x
        this.y = y
        this.width = width
        this.height = height

        // 初始化控制点（矩形四个角点）
        this.controlPoints = this.calculateControlPoints()

        this.bounds = this.updateBounds()
        this.loadMedia()
    }

    /**
     * 更新元素的包围盒。
     *
     * 根据当前的 `x`、`y`、`width`、`height` 计算四个角点，再由 {@link Bounds.fromPoints} 生成包围盒。
     *
     * @returns {Bounds} 更新后的包围盒
     *
     * @example
     * ```ts
     * const img = new ImageElement('a.jpg', 0, 0, 100, 50);
     * const bounds = img.updateBounds(); // { x: 0, y: 0, width: 100, height: 50 }
     * ```
     */
    public updateBounds(): Bounds {
        const points = [
            new Point3(this.x, this.y, 0),
            new Point3(this.x + this.width, this.y, 0),
            new Point3(this.x + this.width, this.y + this.height, 0),
            new Point3(this.x, this.y + this.height, 0),
        ]
        return Bounds.fromPoints(points)
    }

    /**
     * 加载媒体资源。由子类实现，负责创建 HTMLImageElement / HTMLVideoElement 并完成异步加载。
     *
     * @abstract
     * @returns {Promise<void>} 加载完成后 resolve，加载失败则 reject
     *
     * @example
     * ```ts
     * // ImageElement 中的实现会创建 Image 并设置 onload/onerror
     * protected async loadMedia(): Promise<void> { ... }
     * ```
     */
    protected abstract loadMedia(): Promise<void>

    /**
     * 设置矩形左上角的位置，并同步更新控制点和包围盒。
     *
     * @param {number} x - 新的左上角 x 坐标
     * @param {number} y - 新的左上角 y 坐标
     * @returns {this} 当前实例，支持链式调用
     *
     * @example
     * ```ts
     * const img = new ImageElement('a.jpg', 0, 0, 100, 100);
     * img.setPosition(50, 50); // 移动到 (50, 50)
     * ```
     */
    setPosition(x: number, y: number): this {
        this.x = x
        this.y = y
        this.updateControlPoints()
        return this
    }

    /**
     * 设置矩形的宽度和高度，并同步更新控制点和包围盒。
     *
     * @param {number} width - 新的宽度
     * @param {number} height - 新的高度
     * @returns {this} 当前实例，支持链式调用
     *
     * @example
     * ```ts
     * const img = new ImageElement('a.jpg', 0, 0, 100, 100);
     * img.setSize(200, 150); // 调整尺寸为 200×150
     * ```
     */
    setSize(width: number, height: number): this {
        this.width = width
        this.height = height
        this.updateControlPoints()
        return this
    }

    /**
     * 判断给定点是否在曲线上。媒体元素为矩形区域，不支持曲线判定，始终返回 `false`。
     *
     * @param {Point3} _point - 待检测的点
     * @param {number} _tolerance - 容差距离
     * @returns {boolean} 始终返回 `false`
     *
     * @example
     * ```ts
     * const img = new ImageElement('a.jpg', 0, 0, 100, 100);
     * img.isPointOnCurve(new Point3(50, 50, 0), 5); // false
     * ```
     */
    isPointOnCurve(_point: Point3, _tolerance: number): boolean {
        return false
    }

    /**
     * 计算矩形四个角点作为控制点。
     *
     * 控制点按 **左上 → 右上 → 右下 → 左下** 的顺序排列，
     * 每个控制点为三维 {@link Point3}，z 分量为 0。
     *
     * @protected
     * @returns {Point3[]} 四个角点的数组
     *
     * @example
     * ```ts
     * const img = new ImageElement('a.jpg', 10, 20, 100, 50);
     * const pts = img.calculateControlPoints();
     * // [Point3(10,20,0), Point3(110,20,0), Point3(110,70,0), Point3(10,70,0)]
     * ```
     */
    protected calculateControlPoints(): Point3[] {
        return [
            new Point3(this.x, this.y, 0), // 左上角
            new Point3(this.x + this.width, this.y, 0), // 右上角
            new Point3(this.x + this.width, this.y + this.height, 0), // 右下角
            new Point3(this.x, this.y + this.height, 0), // 左下角
        ]
    }

    /**
     * 重新计算控制点和包围盒。当位置或尺寸变化后调用以确保几何一致性。
     *
     * @protected
     *
     * @example
     * ```ts
     * this.x += 10;
     * this.updateControlPoints(); // 同步控制点和包围盒
     * ```
     */
    protected updateControlPoints(): void {
        this.controlPoints = this.calculateControlPoints()
        this.bounds = this.updateBounds()
    }

    /**
     * 将矩形的渲染路径绘制到 Canvas 上下文中。
     *
     * 路径按 **左上 → 右上 → 右下 → 左下 → 闭合** 的顺序绘制，
     * 当 `dependent` 为 `true` 时会先调用 `ctx.beginPath()` 开启新路径。
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 渲染上下文
     * @param {Boolean} dependent - 是否开启新路径（`true` 时调用 `beginPath`）
     *
     * @example
     * ```ts
     * img.renderPath(ctx, true);
     * ctx.stroke(); // 描边矩形路径
     * ```
     */
    public renderPath(ctx: CanvasRenderingContext2D, dependent: Boolean): void {
        dependent && ctx.beginPath()
        const x = this.x
        const y = this.y
        const width = this.width
        const height = this.height
        ctx.moveTo(x, y)
        ctx.lineTo(x + width, y)
        ctx.lineTo(x + width, y + height)
        ctx.lineTo(x, y + height)
        ctx.lineTo(x, y)
    }

    /**
     * 渲染占位符。当媒体资源尚未加载完成时，由子类实现具体的占位渲染逻辑
     * （如绘制灰色边框 + 加载提示文字或图标）。
     *
     * @abstract
     * @protected
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 渲染上下文
     *
     * @example
     * ```ts
     * // ImageElement 中的实现：灰色边框 + "Loading..." 文字
     * protected renderPlaceholder(ctx: CanvasRenderingContext2D): void { ... }
     * ```
     */
    protected abstract renderPlaceholder(ctx: CanvasRenderingContext2D): void

    /**
     * 获取媒体元素的像素数据。由子类实现，返回当前帧（图片）或当前播放帧（视频）的 ImageData。
     *
     * @abstract
     * @returns {ImageData | null} 像素数据；若媒体未加载则返回 `null`
     *
     * @example
     * ```ts
     * const img = new ImageElement('a.jpg', 0, 0, 100, 100);
     * await img.loadMedia();
     * const data = img.getImageData(); // ImageData { width: ..., height: ..., data: ... }
     * ```
     */
    public abstract getImageData(): ImageData | null

    /**
     * 获取矩形周长上参数 `t` 对应的点。
     *
     * 参数 `t` 的范围为 `[0, 1]`，按矩形周长顺时针方向映射：
     * - `t ∈ [0, w/P)` → 上边（从左到右）
     * - `t ∈ [w/P, (w+h)/P)` → 右边（从上到下）
     * - `t ∈ [(w+h)/P, (2w+h)/P)` → 下边（从右到左）
     * - `t ∈ [(2w+h)/P, 1]` → 左边（从下到上）
     *
     * 其中 `P = 2 × (width + height)` 为矩形周长。
     *
     * @param {number} t - 归一化参数，范围 `[0, 1]`
     * @returns {Point3} 周长上对应的点，z 分量为 0
     *
     * @example
     * ```ts
     * const img = new ImageElement('a.jpg', 0, 0, 200, 100);
     * img.getPointAt(0);    // Point3(0, 0, 0)   — 左上角
     * img.getPointAt(0.25); // 上边中间附近
     * img.getPointAt(0.5);  // 右边中间附近
     * ```
     */
    public getPointAt(t: number): Point3 {
        // 对于矩形媒体元素，按矩形边界计算
        const perimeter = 2 * (this.width + this.height)
        let currentLength = 0

        // 上边
        if (t * perimeter <= this.width) {
            return new Point3(this.x + t * perimeter, this.y, 0)
        }
        currentLength += this.width

        // 右边
        if (t * perimeter <= currentLength + this.height) {
            return new Point3(
                this.x + this.width,
                this.y + (t * perimeter - currentLength),
                0
            )
        }
        currentLength += this.height

        // 下边
        if (t * perimeter <= currentLength + this.width) {
            return new Point3(
                this.x + this.width - (t * perimeter - currentLength),
                this.y + this.height,
                0
            )
        }
        currentLength += this.width

        // 左边
        return new Point3(
            this.x,
            this.y + this.height - (t * perimeter - currentLength),
            0
        )
    }

    /**
     * 获取矩形周长上参数 `t` 对应的切线向量。
     *
     * 切线方向按顺时针约定：
     * - 上边 → `(1, 0, 0)`（向右）
     * - 右边 → `(0, 1, 0)`（向下）
     * - 下边 → `(-1, 0, 0)`（向左）
     * - 左边 → `(0, -1, 0)`（向上）
     *
     * @param {number} t - 归一化参数，范围 `[0, 1]`
     * @returns {Vector3} 单位切线向量
     *
     * @example
     * ```ts
     * const img = new ImageElement('a.jpg', 0, 0, 200, 100);
     * img.getTangentAt(0);    // Vector3(1, 0, 0) — 上边向右
     * img.getTangentAt(0.5);  // 右边向下
     * ```
     */
    public getTangentAt(t: number): Vector3 {
        const perimeter = 2 * (this.width + this.height)
        let currentLength = 0

        // 上边：向右
        if (t * perimeter <= this.width) {
            return new Vector3(1, 0, 0)
        }
        currentLength += this.width

        // 右边：向下
        if (t * perimeter <= currentLength + this.height) {
            return new Vector3(0, 1, 0)
        }
        currentLength += this.height

        // 下边：向左
        if (t * perimeter <= currentLength + this.width) {
            return new Vector3(-1, 0, 0)
        }

        // 左边：向上
        return new Vector3(0, -1, 0)
    }

    /**
     * 获取矩形周长上参数 `t` 对应的法向量。
     *
     * 法向量由切线向量逆时针旋转 90° 得到，始终指向矩形外侧。
     *
     * @param {number} t - 归一化参数，范围 `[0, 1]`
     * @returns {Vector3} 法向量（指向外侧）
     *
     * @example
     * ```ts
     * const img = new ImageElement('a.jpg', 0, 0, 200, 100);
     * img.getNormalAt(0);  // Vector3(0, 1, 0) — 上边法向量向下（外侧）
     * ```
     */
    public getNormalAt(t: number): Vector3 {
        const tangent = this.getTangentAt(t)
        return new Vector3(-tangent.y, tangent.x, 0)
    }

    /**
     * 计算给定点到矩形边界的最近点、距离及对应参数。
     *
     * **投影策略**：先将点 clamp 到矩形边界上（`closestX`/`closestY`），
     * 然后判断 clamp 后的点落在矩形的哪条边上，按顺时针周长（上→右→下→左）计算归一化参数 `t`。
     * - 若点在矩形内部，则投影到最近的边上。
     *
     * @param {Point3} point - 待查询的三维点
     * @returns {{ distance: number; closestPoint: Point3; parameter: number }}
     *   - `distance`：点到最近点的欧几里得距离
     *   - `closestPoint`：矩形边界上距离最近的点
     *   - `parameter`：最近点对应的归一化周长参数 `t`，范围 `[0, 1]`
     *
     * @example
     * ```ts
     * const img = new ImageElement('a.jpg', 0, 0, 100, 100);
     * const result = img.getClosestPoint(new Point3(50, -10, 0));
     * // result.closestPoint → Point3(50, 0, 0)，投影到上边
     * // result.parameter → 0.25（上边中间）
     * ```
     */
    public getClosestPoint(point: Point3): {
        distance: number
        closestPoint: Point3
        parameter: number
    } {
        // 将点限制在矩形边界上找到最近点
        const closestX = Math.max(
            this.x,
            Math.min(point.x, this.x + this.width)
        )
        const closestY = Math.max(
            this.y,
            Math.min(point.y, this.y + this.height)
        )
        const closestPoint = new Point3(closestX, closestY, 0)
        const distance = point.distance(closestPoint)

        // 计算参数t：按周长顺时针方向（上→右→下→左）
        const perimeter = 2 * (this.width + this.height)
        let t = 0

        if (closestY === this.y && closestX >= this.x && closestX <= this.x + this.width) {
            // 上边
            t = (closestX - this.x) / perimeter
        } else if (closestX === this.x + this.width) {
            // 右边
            t = (this.width + (closestY - this.y)) / perimeter
        } else if (closestY === this.y + this.height) {
            // 下边
            t = (this.width + this.height + (this.x + this.width - closestX)) / perimeter
        } else {
            // 左边
            t = (this.width + this.height + this.width + (this.y + this.height - closestY)) / perimeter
        }

        return {
            distance,
            closestPoint,
            parameter: Math.max(0, Math.min(1, t)),
        }
    }

    /**
     * 计算矩形周长在指定参数范围 `[tStart, tEnd]` 内的弧长。
     *
     * 弧长 = `|tEnd - tStart| × 周长`，周长为 `2 × (width + height)`。
     *
     * @param {number} tStart - 起始归一化参数
     * @param {number} tEnd - 结束归一化参数
     * @returns {number} 对应的弧长
     *
     * @example
     * ```ts
     * const img = new ImageElement('a.jpg', 0, 0, 100, 50);
     * img.getLength(0, 0.5); // 150（半周长 = 100 + 50）
     * ```
     */
    public getLength(tStart: number, tEnd: number): number {
        const perimeter = 2 * (this.width + this.height)
        return Math.abs(tEnd - tStart) * perimeter
    }

    /**
     * 计算矩形的面积。
     *
     * @returns {number} 面积值，`width × height`
     *
     * @example
     * ```ts
     * const img = new ImageElement('a.jpg', 0, 0, 100, 50);
     * img.getArea(); // 5000
     * ```
     */
    public getArea(): number {
        return this.width * this.height
    }

    /**
     * 计算矩形的质心（几何中心）。
     *
     * @returns {Point3} 质心点，坐标为 `(x + width/2, y + height/2, 0)`
     *
     * @example
     * ```ts
     * const img = new ImageElement('a.jpg', 0, 0, 100, 50);
     * img.getCentroid(); // Point3(50, 25, 0)
     * ```
     */
    public getCentroid(): Point3 {
        return new Point3(this.x + this.width / 2, this.y + this.height / 2, 0)
    }

    /**
     * 对媒体元素应用矩阵变换。
     *
     * 变换流程：对四个角控制点逐一应用 `matrix` 乘法，然后调用 {@link syncFromControlPoints}
     * 从变换后的控制点反推 `x`/`y`/`width`/`height`，最后重新计算包围盒。
     *
     * > ⚠️ 注意：对非刚性变换（如剪切、非等比缩放），反推得到的矩形可能无法精确表示变换后的四边形。
     *
     * @param {Matrix4} matrix - 4×4 变换矩阵
     * @returns {Graph} 当前实例
     *
     * @example
     * ```ts
     * const img = new ImageElement('a.jpg', 0, 0, 100, 100);
     * const moveMatrix = Matrix4.translation(50, 50, 0);
     * img.transform(moveMatrix); // 整体平移 (50, 50)
     * ```
     */
    public transform(matrix: Matrix4): Graph {
        for (const [i] of this.controlPoints.entries()) {
            this.controlPoints[i] = matrix.multiply(this.controlPoints[i])
        }
        this.syncFromControlPoints()
        this.bounds = this.updateBounds()
        return this
    }

    /**
     * 计算与另一个图形的相交点。
     *
     * 将当前媒体元素视为由包围盒构成的矩形，委托给 {@link Rectangle.fromBounds} 进行求交计算。
     *
     * @param {Graph} other - 另一个图形
     * @returns {Point3[]} 相交点数组
     *
     * @example
     * ```ts
     * const img = new ImageElement('a.jpg', 0, 0, 100, 100);
     * const line = new Line(new Point3(-10, 50, 0), new Point3(110, 50, 0));
     * const pts = img.intersect(line); // [Point3(0, 50, 0), Point3(100, 50, 0)]
     * ```
     */
    public intersect(other: Graph): Point3[] {
        return Rectangle.fromBounds(this.bounds).intersect(other)
    }

    /**
     * 按比例缩放调整媒体元素的尺寸。
     *
     * 根据固定点（`fixedPoint`）和动态点（`dynamicPoint`）确定的参考矩形，
     * 计算每个控制点到固定点的相对比例，再将 `resizeVector` 按该比例分配给各控制点，
     * 最后通过 {@link syncFromControlPoints} 反推新的 `x`/`y`/`width`/`height`。
     *
     * @param {Point3} fixedPoint - 缩放固定点（对角点）
     * @param {Point3} dynamicPoint - 缩放动态点（被拖拽的角点）
     * @param {Vector3} resizeVector - 缩放方向和幅值向量
     *
     * @example
     * ```ts
     * const img = new ImageElement('a.jpg', 0, 0, 100, 100);
     * img.resize(
     *   new Point3(0, 0, 0),     // 固定左上角
     *   new Point3(100, 100, 0), // 右下角为动态点
     *   new Vector3(10, 10, 0)   // 向右下方扩展
     * );
     * ```
     */
    public resize(
        fixedPoint: Point3,
        dynamicPoint: Point3,
        resizeVector: Vector3
    ): void {
        const width = Math.abs(fixedPoint.x - dynamicPoint.x) || Infinity
        const height = Math.abs(fixedPoint.y - dynamicPoint.y) || Infinity

        for (const [i, p] of this.controlPoints.entries()) {
            // 变化比例
            const scaleX = Math.abs(p.x - fixedPoint.x) / width
            const scaleY = Math.abs(p.y - fixedPoint.y) / height

            // 带方向并且按照介质尺寸缩放的移动量
            const dx = resizeVector.x * scaleX
            const dy = resizeVector.y * scaleY

            this.controlPoints[i] = p.add(new Vector3(dx, dy, 0))
        }
        this.syncFromControlPoints()
        this.bounds = this.updateBounds()
    }

    /**
     * 设置指定索引的控制点。媒体元素不支持单点顶点编辑，此方法为空操作。
     *
     * @param {number} _index - 控制点索引
     * @param {Point3} _point - 新的控制点位置
     *
     * @example
     * ```ts
     * const img = new ImageElement('a.jpg', 0, 0, 100, 100);
     * img.setControlPoint(0, new Point3(10, 10, 0)); // 无效果
     * ```
     */
    public setControlPoint(_index: number, _point: Point3): void {}

    /**
     * 从四个角控制点反推矩形的位置和尺寸。
     *
     * 取 `controlPoints[0]`（左上角）和 `controlPoints[2]`（右下角），
     * 直接计算 `x`、`y`、`width`、`height`。
     * 当控制点数量不足 4 个时跳过同步。
     *
     * @protected
     *
     * @example
     * ```ts
     * // 手动修改控制点后调用 syncFromControlPoints 以同步位置和尺寸
     * this.controlPoints[0] = new Point3(10, 20, 0);
     * this.controlPoints[2] = new Point3(110, 120, 0);
     * this.syncFromControlPoints();
     * // this.x = 10, this.y = 20, this.width = 100, this.height = 100
     * ```
     */
    protected syncFromControlPoints(): void {
        if (this.controlPoints.length < 4) return
        const topLeft = this.controlPoints[0]
        const bottomRight = this.controlPoints[2]
        this.x = topLeft.x
        this.y = topLeft.y
        this.width = bottomRight.x - topLeft.x
        this.height = bottomRight.y - topLeft.y
    }
}
