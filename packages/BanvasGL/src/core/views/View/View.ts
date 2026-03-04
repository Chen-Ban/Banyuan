import { VIEWTYPE } from '../../constants'
import Matrix4 from '../../math/Matrix4'
import { getGlobalCanvasContext } from '../../renderer/CanvasContext'
import { v4 as uuidv4 } from 'uuid'
import { isScene, type Scene } from '../../scene/Scene'
import BaseCamera from '../../camera/BaseCamera'

// 导入图形相关类型
import { Graph, Rectangle } from '../../graph'

// 导入addon类型
import {
    BoundingBoxAddonImpl,
    ViewAddonImpl,
    InteractionMapBuilder,
} from '../addon'
import { Point3, Vector3 } from '../../math'
import { Action, Cursor, ExtraData } from './InteractionMapBuilder'
import Bounds from '../../graph/base/Bounds'

const RESIZE_MATRIX_MAP = [
    { x: true, y: true }, // 0: 同时移动x和y
    { x: false, y: true }, // 1: 只移动y
    { x: false, y: true }, // 2: 只移动y
    { x: false, y: false }, // 3: 不移动
    { x: false, y: false }, // 4: 不移动
    { x: false, y: false }, // 5: 不移动
    { x: true, y: false }, // 6: 只移动x
    { x: true, y: false }, // 7: 只移动x
]

const RESIZE_SIZE_MAP = [
    { width: true, height: true },
    { width: false, height: true },
    { width: true, height: true },
    { width: true, height: false },

    { width: true, height: true },
    { width: false, height: true },
    { width: true, height: true },
    { width: true, height: false },
]

export interface InteractResult {
    view: View | null
    content: Graph | ViewAddonImpl | null
    extraData: ExtraData | null
}

export interface ViewStyle {
    width?: number // 视口宽度
    height?: number // 视口高度
    overflow?: 'visible' | 'hidden' | 'scroll'
    scrollX?: number
    scrollY?: number
    transformOrigin?: Point3
}
// 视图选项接口
export interface ViewOptions<T extends object = any> {
    id?: string
    content?: Graph[]
    children?: View[]
    data?: T
    properties?: T
    style?: ViewStyle // TODO:继承关系和初始化，兼顾拓展性
    matrix?: Matrix4
    onCreated?: () => void
    onAttach?: () => void
    onDestroy?: () => void
    [funcName: string]: any
}

// TODO：不同容器的默认样式表
export default abstract class View<T extends object = any> {
    // 基本属性
    public layer: number = 0
    public id: string = ''
    public properties: T = {} as T
    public data: T = {} as T
    public content: Graph[] = []
    public children: View[] = []
    public parent: Scene | View | null = null

    // 样式和状态
    public style: ViewStyle = {}
    public selected: boolean = false
    public actived: boolean = false
    public freezed: boolean = false
    public visible: boolean = true
    // 边框图形
    public borderGraph: Rectangle | null = null
    // 滚动条图形
    public scrollBarHorization: Rectangle | null = null
    public scrollBarVertical: Rectangle | null = null

    // 变换矩阵
    public matrix: Matrix4 = Matrix4.identity()

    // 插件
    public boundingBox: BoundingBoxAddonImpl | null = null

    // 视口
    public viewport: Bounds | null = null
    // 内容布局区域
    public layoutArea: Bounds | null = null

    // 视口是否被内容区域撑开
    public needStructViewport: boolean

    // 类型
    public abstract readonly type: VIEWTYPE

    //抽象方法
    public abstract copy(): View

    public layoutContent(): Bounds {
        // 内容布局区域
        return Bounds.union(
            ...this.content.map((graph) => graph.bounds)
        ).expandToInclude(0, 0)
    }

    public layoutChildren(): Bounds {
        // 将子视口转换为矩形
        const childRects = this.children.map((child) => {
            if (!child.viewport) throw new Error('子视图必须设置viewport')
            return Rectangle.fromBounds(child.viewport)
        })
        // 应用对应容器变换
        childRects.forEach((childRect, i) =>
            childRect.transform(this.children[i].matrix)
        )
        // 获取包围盒
        const childrenBounds = Bounds.fromPoints(
            childRects.map((rect) => rect.vertices).flat()
        )
        // 将包围盒起点作为平移分量
        this.matrix = Matrix4.identity().translate(
            childrenBounds.x,
            childrenBounds.y,
            0
        )
        // 修改子容器变换矩阵
        this.children.forEach((child) => {
            child.matrix = this.matrix.multiply(child.matrix)
        })
        // 将子视图的布局区域平移回原点
        childrenBounds.setPosition(0, 0)
        return childrenBounds
    }

    public renderContent(ctx: CanvasRenderingContext2D): void {
        this.content.forEach((graph) => {
            graph.render(ctx)
        })
    }

    /**
     * 检查内容是否被命中，子类可以重写此方法实现自定义逻辑
     * @param builder 交互构建器
     * @param point 相对坐标点
     * @param needConstraint 是否需要约束（可选，TextView使用）
     */
    protected interactContent(point: Point3, needConstraint?: boolean) {
        const builder = new InteractionMapBuilder()
        this.content.forEach((content) => {
            const hitContent =
                content.isPointInPath(point) || content.isPointOnCurve(point, 5)
            if (hitContent) {
                builder.add(this, content, {
                    cursorStyle: Cursor.Move,
                    action: Action.MOVE,
                })
            }
        })
        return builder.build()
    }

    protected interactPlugins(relativePoint: Point3): InteractResult {
        return new InteractionMapBuilder().build()
    }

    /**
     * 统一交互方法
     * 优先级：1. 插件 -> 2. 内容 -> 3. 子视图
     * @param worldPoint 世界坐标点
     * @param needConstraint 是否需要约束到布局区域/视口中
     */
    public interact(
        worldPoint: Point3,
        needConstraint?: boolean
    ): InteractResult {
        const relativePoint = this.getMVPMatrix().inverse().multiply(worldPoint)
        const builder = new InteractionMapBuilder()

        const ctx = getGlobalCanvasContext()?.getBufferContext()
        if (!ctx) throw new Error('交互失败')

        // 1. 检查插件（边界框）
        if (this.actived && this.boundingBox) {
            const extraData = this.boundingBox.interact(relativePoint)
            if (extraData) {
                return builder.add(this, this.boundingBox, extraData).build()
            }
        }

        // 2. 检查独有插件
        const pluginsResult = this.interactPlugins(relativePoint)
        if (pluginsResult.view) return pluginsResult

        // 3. 检查内容（复杂图形由子类重写）
        const result = this.interactContent(relativePoint, needConstraint)
        if (result.view) return result

        // 4. 递归检查子视图
        for (const child of this.children) {
            const result = child.interact(worldPoint, needConstraint)
            if (result.view && result.content && result.extraData) {
                builder.add(result.view, result.content, result.extraData)
            }
        }

        return builder.build()
    }

    constructor(options: ViewOptions<T>) {
        if (new Set(options?.children?.map((view) => view.parent)).size > 1) {
            throw new Error('子视图必须属于同一个父视图')
        }

        this.id = options.id || this.generateId()
        this.data = options.data || ({} as T)
        this.properties = options.properties || ({} as T)
        this.style = { overflow: 'visible', ...(options.style || {}) }
        this.matrix = options.matrix || Matrix4.identity()
        this.content = options.content || []
        this.children = options.children || []
        this.needStructViewport = options.needStructViewport ?? false // 布局后是否将布局区域作为视口

        this.onCreated = options.onCreated || (() => {})
        this.onAttach = options.onAttach || (() => {})
        this.onDestroy = options.onDestroy || (() => {})

        Object.keys(options).forEach((key) => {
            this[key] = options[key]
        })

        // 步骤1: 初始化视口
        this.viewport = new Bounds(
            0,
            0,
            options.style?.width || 0,
            options.style?.height || 0
        )
        this.boundingBox = new BoundingBoxAddonImpl(this.viewport)

        // 步骤2: 初始化布局区域(使用视口大小作为初始值)
        this.layoutArea = new Bounds(
            0,
            0,
            options.style?.width || 0,
            options.style?.height || 0
        )

        // 步骤3: 执行布局，布局目的
        // 1、不同容器独有的布局（比如文本容器）
        // 2、获取实际布局区域
        // 3、让内容区域进行偏移
        this.layout()

        this.initRef(this.children)

        this.onCreated()
    }

    // 设置数据
    public setData(data: Partial<T>): void {
        this.data = { ...this.data, ...data }
    }

    // 生命周期回调
    public onCreated(): void {}

    public onDestroy(): void {
        // 清理引用
        this.parent = null
        this.content = []
        this.children.forEach((child) => child.onDestroy())
        this.children = []
        this.viewport = null
        this.layoutArea = null
        this.boundingBox = null
        this.controlPoints = null
        this.setEditingVertex(false)
        this.setEditingViewport(false)
        this.setEditingVertex(false)
    }

    public onAttach(): void {}

    initRef(children: View[]) {
        children.forEach((child) => {
            child.parent = this
        })
    }

    splitChildren() {
        this.children.forEach((child) => {
            child.parent = this.parent
            child.matrix = this.matrix.multiply(child.matrix)
        })
        if (this.parent) {
            this.parent.children = this.children
        }
    }

    // 自定义属性（索引签名）
    [funcName: string]: any

    /**
     * 尺寸变化方向由三个因素决定：
     * 1. 视口当前尺寸方向（正/负）
     * 2. 参考向量的方向（拖拽方向）
     * 3. 传入向量的方向（预期变化方向）
     */
    private calulateDimensionDelta(
        dimension: number,
        reference: number,
        delta: number
    ) {
        return Math.sign(dimension * reference * delta) * Math.abs(delta)
    }

    public resize(
        fixed: [number, Point3],
        dynamic: [number, Point3],
        vector: Vector3,
        needResizeContent?: boolean
    ) {
        // 修改视口(只会修改width和height，根据参考向量与vector的关系决定)
        const mvp = this.getMVPMatrix()
        const relativeVector = mvp.inverse().multiply(vector)
        const viewport = this.viewport
        if (!viewport) throw new Error('视口丢失')
        const referenceVector = dynamic[1].subtract(fixed[1])

        const deltaX = this.calulateDimensionDelta(
            viewport.width,
            referenceVector.x,
            relativeVector.x
        )
        const deltaY = this.calulateDimensionDelta(
            viewport.height,
            referenceVector.y,
            relativeVector.y
        )

        const canResize = RESIZE_SIZE_MAP[dynamic[0]]
        const newWidth = viewport.width + Number(canResize.width) * deltaX
        const newHeight = viewport.height + Number(canResize.height) * deltaY

        // 当resize结果为0时，不进行操作，避免后续计算出错
        // 1、calulateDimensionDelta出错导致视口不变化
        // 2、graph resize在边界时比例失调
        if (newWidth === 0 || newHeight === 0) return

        this.viewport?.setSize(newWidth, newHeight)

        this.boundingBox?.setSize(viewport.width, viewport.height)

        // 修改matrix（由dynamicIndex决定）
        const canTranslate = RESIZE_MATRIX_MAP[dynamic[0]]
        const translateVector = mvp.multiply(
            new Vector3(
                canTranslate.x ? -deltaX : 0, // 增大宽度，x需要变小
                canTranslate.y ? -deltaY : 0, // 增大高度，y需要变小
                0
            )
        )
        this.translate(translateVector.x, translateVector.y, translateVector.z)

        // 修改子容器
        this.children.forEach((view) => {
            view.resize(fixed, dynamic, vector, needResizeContent)
        })

        if (needResizeContent) {
            // 修改内容
            this.content.forEach((graph) =>
                graph.resize(fixed[1], dynamic[1], relativeVector)
            )
        }
    }

    // 渲染方法
    public render(): void {
        if (!this.visible) {
            return
        }
        this.rederToOffScreen()

        // TODO：这里可以利用离屏画布内容对每个容器做监控

        this.renderFromCache()
    }

    private rederToOffScreen(): void {
        const canvasContext = getGlobalCanvasContext()

        const offscreenCtx = canvasContext.getBufferContext()
        const viewport = this.viewport

        if (!viewport) {
            return
        }
        offscreenCtx.save()

        const transform = this.getMVPMatrix().transform
        offscreenCtx.setTransform(
            transform[0],
            transform[4],
            transform[1],
            transform[5],
            transform[3],
            transform[7]
        )

        // 渲染插件到离屏画布(不受裁剪作用的影响)
        this.renderPlugins(offscreenCtx)

        if (this.style.overflow !== 'visible') {
            // 设置视口裁剪区域,offset通过viewport和layoutArea计算得出
            offscreenCtx.beginPath()
            offscreenCtx.rect(
                viewport.x,
                viewport.y,
                viewport.width,
                viewport.height
            )
            offscreenCtx.clip()
        }

        // 渲染内容到离屏画布
        this.renderContent(offscreenCtx)
        // 渲染子节点
        this.children.forEach((view) => {
            view.render()
        })

        offscreenCtx.restore()
    }

    // 从缓存渲染到主画布
    private renderFromCache(): void {
        const canvasContext = getGlobalCanvasContext()
        const mainCtx = canvasContext.getMainContext()
        const offscreenCtx = canvasContext.getBufferContext()
        if (!offscreenCtx) return
        const canvas = offscreenCtx.canvas as unknown as OffscreenCanvas
        // 将离屏画布内容绘制到主画布
        /**
         * 注意
         * 需要将主画布的变换清零
         * 让缓冲区内容能够绘制到正确的地方
         */
        canvasContext.save()
        canvasContext.setTransform([1, 0, 0, 1, 0, 0])
        mainCtx.drawImage(canvas.transferToImageBitmap(), 0, 0)
        canvasContext.restore()
    }

    // 渲染插件
    protected renderPlugins(ctx: CanvasRenderingContext2D): void {
        if (!this.actived) return
        this.boundingBox?.render(ctx)
    }

    // 获取世界矩阵（考虑父view的matrix）
    public getWorldMatrix(parent?: View): Matrix4 {
        if (
            this.parent &&
            this.parent instanceof View &&
            this.parent !== parent
        ) {
            // 如果有父view，则世界矩阵 = 父view的世界矩阵 * 当前view的matrix
            return this.parent.getWorldMatrix().copy().multiply(this.matrix)
        } else {
            // 如果没有父view，则世界矩阵就是当前view的matrix
            return this.matrix.copy()
        }
    }

    public getMVPMatrix() {
        return (
            this.getCamera()?.viewProjectionMatrix.multiply(
                this.getWorldMatrix()
            ) || this.getWorldMatrix()
        )
    }

    // 变换方法
    public translate(x: number, y: number, z: number = 0): View {
        this.matrix.translate(x, y, z)
        return this
    }

    public scale(
        x: number,
        y: number,
        z: number = 1,
        origin: Point3 = new Point3(0, 0, 0)
    ): View {
        const _o = this.matrix.multiply(origin)
        this.matrix.translate(-_o.x, -_o.y, -_o.z)
        this.matrix.scale(x, y, z)
        this.matrix.translate(_o.x, _o.y, _o.z)
        return this
    }

    public rotate(
        x: number,
        y: number,
        z: number,
        origin: Point3 = new Point3(0, 0, 0)
    ): View {
        const _o = this.matrix.multiply(origin)

        this.matrix.translate(-_o.x, -_o.y, -_o.z)
        this.matrix.rotate(x, y, z)
        this.matrix.translate(_o.x, _o.y, _o.z)
        return this
    }

    // 状态管理
    public setVisible(visible: boolean): View {
        this.visible = visible
        return this
    }

    public setSelected(selected: boolean): View {
        this.selected = selected
        return this
    }

    public setActived(actived: boolean): View {
        this.actived = actived
        return this
    }

    public setFreezed(freezed: boolean): View {
        this.freezed = freezed
        return this
    }

    public setLayer(layer: number): View {
        this.layer = layer
        return this
    }

    // 布局管理
    public layout(): void {
        // 1、执行布局,获取最新的内容布局区域并更新
        const contentBound = this.layoutContent()
        const childrenBound = this.layoutChildren()
        this.layoutArea = Bounds.union(contentBound, childrenBound)
        if (this.needStructViewport) {
            this.viewport = this.layoutArea.copy()
            this.boundingBox = new BoundingBoxAddonImpl(this.viewport)
        }
        // 2、应用scroll偏移
        if (this.style.overflow === 'scroll') {
            const { scrollX, scrollY } = this.style
            // 判断是否可滚动（内容区域大于了视口）
            // 计算合理滚动距离（带方向）
            // 移动内容和子视图
            // 更新滚动条
        }
    }

    // 获取当前视图所属场景的相机
    private getCamera(): BaseCamera | null {
        // 向上查找父级，直到找到 Scene
        let current: Scene | View | null = this.parent
        while (current) {
            if (isScene(current)) {
                return current.camera
            }
            current = current.parent
        }
        return null
    }

    // 销毁视图
    public destroy(): void {
        this.onDestroy()
    }

    // 生成唯一ID
    private generateId(): string {
        return uuidv4()
    }
}
