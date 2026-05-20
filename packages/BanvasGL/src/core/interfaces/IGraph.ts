/**
 * Graph 接口层 —— 零循环依赖
 *
 * 所有 Graph 子类的公共接口定义。
 * 外部消费者通过 interface + 类型守卫访问图形对象，
 * 而无需直接 import 具体 class 实现。
 *
 * 设计要点：
 *   - 接口中 `type` 保持为宽类型 `GRAPHTYPE`，使 class 能直接 implements
 *   - 窄化（判别联合）在 GraphTypeMap 中通过交叉类型 `& { readonly type: GRAPHTYPE.XXX }` 实现
 *   - 类型守卫 `isGraphType(graph, GRAPHTYPE.LINE)` 返回 `GraphTypeMap[GRAPHTYPE.LINE]`
 *     即 `ILine & { readonly type: GRAPHTYPE.LINE }`，同时拥有接口属性和窄 type
 */

import { GRAPHTYPE } from '@/core/constants'
import type { Matrix4, Point3, Vector3 } from '@/core/math'
import type Bounds from '@/core/graph/base/Bounds'
import type Style from '@/core/style/Style'
import type TextOptions from '@/core/graph/text/TextOptions'
import type ParagraphOptions from '@/core/graph/text/ParagraphOptions'
import type TextFieldsOptions from '@/core/graph/text/TextFieldsOptions'

// ────────────────────────────────────────────
//  基础接口
// ────────────────────────────────────────────

/** Graph 基类接口 —— 所有图形的公共契约 */
export interface IGraph {
    readonly id: string
    readonly type: GRAPHTYPE
    controlPoints: Point3[] | Float32Array
    style: Style
    bounds: Bounds
    transfromOrigin: Point3

    // 渲染
    renderPath(ctx: CanvasRenderingContext2D, dependent: Boolean): void
    render(ctx: CanvasRenderingContext2D): void
    copy(): IGraph
    updateBounds(orientationX?: boolean, orientationY?: boolean): Bounds
    layout(constraintBounds?: Bounds): IGraph | void

    // 几何查询
    isPointInPath(p: Point3, bufferCtx?: CanvasRenderingContext2D | null): Boolean
    getPointAt(t: number): Point3
    getTangentAt(t: number): Vector3
    getNormalAt(t: number): Vector3
    getClosestPoint(point: Point3): {
        distance: number
        closestPoint: Point3
        parameter: number
    }
    getLength(tStart: number, tEnd: number): number
    getTotalLength(): number
    isPointOnCurve(point: Point3, tolerance?: number): boolean
    getArea(): number
    getCentroid(): Point3

    // 变换
    transform(matrix: Matrix4): IGraph
    intersect(other: IGraph): Point3[]
    resize(
        fixedPoint: Point3,
        dynamicPoint: Point3,
        resizeVector: Vector3
    ): void

}

// ────────────────────────────────────────────
//  解析几何图形
// ────────────────────────────────────────────

/** AnalyticGraph 接口 */
export interface IAnalyticGraph extends IGraph {
    controlPoints: Point3[]
}

/** Line 接口 */
export interface ILine extends IAnalyticGraph {
    startPoint: Point3
    endPoint: Point3
}

/** Arc 接口 */
export interface IArc extends IAnalyticGraph {
    center: Point3
    xRadius: number
    yRadius: number
    rotation: number
    startAngle: number
    endAngle: number
    clockwise: boolean
    readonly startPoint: Point3
    readonly endPoint: Point3

    setCenter(center: Point3): IArc
    setXRadius(xRadius: number): IArc
    setYRadius(yRadius: number): IArc
    setRotation(rotation: number): IArc
    setAngles(startAngle: number, endAngle: number): IArc
    setClockwise(clockwise: boolean): IArc
}

/** Circle 接口 */
export interface ICircle extends IArc {
    readonly diameter: number
    readonly circumference: number

    setRadius(radius: number): ICircle
    getPointOnCircle(angle: number): Point3
    getTangentDirection(angle: number): Point3
    getNormalDirection(angle: number): Point3
    intersects(other: ICircle): boolean
    isTangent(other: ICircle, tolerance: number): boolean
    contains(other: ICircle): boolean
}

/** Bezier 基础接口 */
export interface IBezier extends IAnalyticGraph {
    readonly startPoint: Point3
    readonly endPoint: Point3

    setControlPoints(controlPoints: Point3[]): IBezier
    getControlPoint(index: number): Point3 | null
    setControlPoint(index: number, point: Point3): void
    getBezierType(): string
}

/** QuadraticBezier 接口 */
export interface IQuadraticBezier extends IBezier {
    readonly controlPoint: Point3

    setQuadraticControlPoint(controlPoint: Point3): IQuadraticBezier
    isLinear(): boolean
}

/** CubicBezier 接口 */
export interface ICubicBezier extends IBezier {
    readonly controlPoint1: Point3
    readonly controlPoint2: Point3

    setControlPoint1(controlPoint1: Point3): ICubicBezier
    setControlPoint2(controlPoint2: Point3): ICubicBezier
    getInflectionPoints(): Point3[]
    isLinear(): boolean
}

// ────────────────────────────────────────────
//  组合图形
// ────────────────────────────────────────────

/** CombinedGraph 接口 */
export interface ICombinedGraph extends IGraph {
    controlPoints: Point3[]
    graphs: IGraph[]

    addGraph(graph: IGraph): ICombinedGraph
    addGraphs(graphs: IGraph[]): ICombinedGraph
    getGraphsByType(type: GRAPHTYPE): IGraph[]
}

/** Polygon 接口 */
export interface IPolygon extends ICombinedGraph {
    vertices: Point3[]
    isClosed: boolean
    fillMode: 'fill' | 'stroke' | 'both'

    setFillMode(mode: 'fill' | 'stroke' | 'both'): IPolygon
    getPolygonCenter(): Point3
    getPerimeter(): number
    containsPoint(point: Point3): boolean
}

/** Triangle 接口 */
export interface ITriangle extends IPolygon {
    getVertices(): { p1: Point3; p2: Point3; p3: Point3 }
    setVertices(p1: Point3, p2: Point3, p3: Point3): ITriangle
    getHeight(): number
    getTriangleType(): 'equilateral' | 'isosceles' | 'scalene' | 'right'
    getCircumcenter(): Point3
}

/** Quadrilateral 接口 — 自由四边形，4 个顶点无约束 */
export interface IQuadrilateral extends IPolygon {
    getQuadrilateralType(): 'rectangle' | 'square' | 'rhombus' | 'parallelogram' | 'trapezoid' | 'general'
    isRectangle(tolerance?: number): boolean
    isSquare(tolerance?: number): boolean
    isParallelogram(tolerance?: number): boolean
    isRhombus(tolerance?: number): boolean
    isTrapezoid(tolerance?: number): boolean
}

/** Rectangle 接口 */
export interface IRectangle extends IPolygon {

    width: number
    height: number

    getTopLeft(): Point3
    getBottomRight(): Point3
    getCenter(): Point3
    setPosition(x: number, y: number): IRectangle
    setSize(width: number, height: number): IRectangle
    move(dx: number, dy: number): IRectangle
    intersects(other: IRectangle): boolean
    getDiagonal(): number
    getAspectRatio(): number
}

/** RegularPolygon 接口 */
export interface IRegularPolygon extends IPolygon {
    center: Point3
    radius: number
    sides: number
    rotation: number

    setCenter(center: Point3): IRegularPolygon
    setRadius(radius: number): IRegularPolygon
    setSides(sides: number): IRegularPolygon
    getInteriorAngle(): number
    getExteriorAngle(): number
    getSideLength(): number
    getInradius(): number
    getVertex(index: number): Point3
}

// ────────────────────────────────────────────
//  圆角矩形
// ────────────────────────────────────────────

/**
 * RoundedRect 接口 — 带圆角的矩形，与 Polygon 平级，直接继承 ICombinedGraph
 *
 * 控制点布局（共 8 个）：
 *   0=左上角点  1=右上角点  2=右下角点  3=左下角点   （拖拽改变宽高）
 *   4=左上圆角  5=右上圆角  6=右下圆角  7=左下圆角   （拖拽改变对应角半径）
 */
export interface IRoundedRect extends ICombinedGraph {
    x: number
    y: number
    width: number
    height: number
    /** 四个角的圆角半径 [左上, 右上, 右下, 左下] */
    radii: [number, number, number, number]

    setPosition(x: number, y: number): IRoundedRect
    setSize(width: number, height: number): IRoundedRect
    setRadius(index: 0 | 1 | 2 | 3, radius: number): IRoundedRect
    setAllRadii(radius: number): IRoundedRect
    getCenter(): Point3
}

// ────────────────────────────────────────────
//  轨迹
// ────────────────────────────────────────────

/** DenseTrajectory 接口 —— controlPoints 收窄为 Float32Array */
export interface IDenseTrajectory extends IGraph {
    controlPoints: Float32Array

    isDenseTrajectory(): boolean
}

// ────────────────────────────────────────────
//  媒体元素
// ────────────────────────────────────────────

/** MediaElement 基础接口 */
export interface IMediaElement extends IGraph {
    controlPoints: Point3[]
    x: number
    y: number
    width: number
    height: number
    actualWidth: number
    actualHeight: number
    loaded: boolean
    src: string

    setPosition(x: number, y: number): IMediaElement
    setSize(width: number, height: number): IMediaElement
    getImageData(): ImageData | null
}

/** ImageElement 接口 */
export interface IImageElement extends IMediaElement {
    image: HTMLImageElement | null

    setImageSrc(src: string): IImageElement
}

/** VideoElement 接口 */
export interface IVideoElement extends IMediaElement {
    video: HTMLVideoElement | null
    autoplay: boolean
    loop: boolean
    muted: boolean
    playing: boolean

    setVideoSrc(src: string): IVideoElement
    setPlayOptions(options: {
        autoplay?: boolean
        loop?: boolean
        muted?: boolean
    }): IVideoElement
    play(): Promise<void>
    pause(): void
    stop(): void
    setCurrentTime(time: number): void
    getCurrentTime(): number
    getDuration(): number
    setVolume(volume: number): void
    getVolume(): number
    containsPoint(point: Point3): boolean
    isVideoElement(): boolean
}

// ────────────────────────────────────────────
//  文本
// ────────────────────────────────────────────

/** TextElement 基础接口 */
export interface ITextElement extends IGraph {
    controlPoints: Point3[]
    isLayouted: boolean
    width: number
    height: number
    lineHeight: number
    options: TextOptions
    content: string

    applyLayout(point: Point3, lineHeight: number): ITextElement
}

/** PrintableTextElement 接口 */
export interface IPrintableTextElement extends ITextElement {}

/** NonPrintableTextElement 接口 */
export interface INonPrintableTextElement extends ITextElement {}

/** TextParagraphContent 类型 */
export type ITextParagraphContent = [
    ...IPrintableTextElement[],
    INonPrintableTextElement,
]

/** TextIndex 类型 */
export type TextIndex = [number, number, 0 | 1]

/** TextParagraph 接口 */
export interface ITextParagraph extends IGraph {
    controlPoints: Point3[]
    options: ParagraphOptions
    texts: ITextParagraphContent
    isLayouted: boolean
    readonly length: number

    addTextElement(textElement: IPrintableTextElement): ITextParagraph
    removeTextElement(textElement: IPrintableTextElement): ITextParagraph
    clearTextElements(): ITextParagraph
    addText(
        content: string,
        index: number,
        options?: TextOptions
    ): ITextParagraph
    applyLayout(position: Point3): ITextParagraph
}

/** TextFields 接口 */
export interface ITextFields extends IGraph {
    controlPoints: Point3[]
    options: TextFieldsOptions
    paragraphs: ITextParagraph[]
    readonly paragraphCount: number
    readonly textContent: string[]

    addParagraph(paragraph: ITextParagraph): ITextFields
    insertParagraph(index: number, paragraph: ITextParagraph): ITextFields
    removeParagraph(paragraph: ITextParagraph): ITextFields
    removeParagraphAt(index: number): ITextFields
    clearParagraphs(): ITextFields
    getParagraph(index: number): ITextParagraph | undefined
    getTextOptionsByIndex(textIndex: TextIndex): TextOptions
    layout(constraintBounds?: Bounds): ITextFields
    point2TextElement(relativePoint: Point3, bufferCtx?: CanvasRenderingContext2D | null): ITextElement | null
    element2Index(
        textElement: ITextElement,
        relativePoint: Point3
    ): TextIndex
}

// ────────────────────────────────────────────
//  GraphTypeMap —— 枚举值 → 接口 + 窄 type 的映射
//  类型守卫通过交叉类型同时获得接口属性和窄 type 字面量
// ────────────────────────────────────────────

export interface GraphTypeMap {
    [GRAPHTYPE.GRAPH]: IGraph
    [GRAPHTYPE.ANALYTICGRAPH]: IAnalyticGraph & { readonly type: GRAPHTYPE.ANALYTICGRAPH }
    [GRAPHTYPE.LINE]: ILine & { readonly type: GRAPHTYPE.LINE }
    [GRAPHTYPE.ARC]: IArc & { readonly type: GRAPHTYPE.ARC }
    [GRAPHTYPE.CIRCLE]: ICircle & { readonly type: GRAPHTYPE.CIRCLE }
    [GRAPHTYPE.BEZIER]: IBezier & { readonly type: GRAPHTYPE.BEZIER }
    [GRAPHTYPE.QUADRATIC_BEZIER]: IQuadraticBezier & { readonly type: GRAPHTYPE.QUADRATIC_BEZIER }
    [GRAPHTYPE.CUBIC_BEZIER]: ICubicBezier & { readonly type: GRAPHTYPE.CUBIC_BEZIER }
    [GRAPHTYPE.COMBINED_GRAPH]: ICombinedGraph & { readonly type: GRAPHTYPE.COMBINED_GRAPH }
    [GRAPHTYPE.POLYGON]: IPolygon & { readonly type: GRAPHTYPE.POLYGON }
    [GRAPHTYPE.TRIANGLE]: ITriangle & { readonly type: GRAPHTYPE.TRIANGLE }
    [GRAPHTYPE.QUADRILATERAL]: IQuadrilateral & { readonly type: GRAPHTYPE.QUADRILATERAL }
    [GRAPHTYPE.RECTANGLE]: IRectangle & { readonly type: GRAPHTYPE.RECTANGLE }
    [GRAPHTYPE.REGULAR_POLYGON]: IRegularPolygon & { readonly type: GRAPHTYPE.REGULAR_POLYGON }
    [GRAPHTYPE.ROUNDED_RECT]: IRoundedRect & { readonly type: GRAPHTYPE.ROUNDED_RECT }
    [GRAPHTYPE.DENSETRAJECTORY]: IDenseTrajectory & { readonly type: GRAPHTYPE.DENSETRAJECTORY }
    [GRAPHTYPE.IMAGE]: IImageElement & { readonly type: GRAPHTYPE.IMAGE }
    [GRAPHTYPE.VIDEO]: IVideoElement & { readonly type: GRAPHTYPE.VIDEO }
    [GRAPHTYPE.TEXTELEMENT]: ITextElement & { readonly type: GRAPHTYPE.TEXTELEMENT }
    [GRAPHTYPE.TEXTPARAGRAPH]: ITextParagraph & { readonly type: GRAPHTYPE.TEXTPARAGRAPH }
    [GRAPHTYPE.TEXTFIELDS]: ITextFields & { readonly type: GRAPHTYPE.TEXTFIELDS }
}
