import { Point3 } from '@/foundation/math'
import { Action, AddonCapability, Cursor, ExtraData, IVertexAddon } from '@/types'
import { AddonType } from '@/foundation/constants'

/**
 * 顶点样式主题（PPT 风格）
 */
const THEME = {
    /** 普通顶点（角点）：蓝色方块 */
    vertex: {
        fill: '#4A90D9',
        stroke: '#ffffff',
        strokeWidth: 1.5,
        size: 7,          // 方块边长
        activeSize: 9,
    },
    /** 边中点：蓝色小圆 */
    midpoint: {
        fill: '#4A90D9',
        stroke: '#ffffff',
        strokeWidth: 1.5,
        size: 6,          // 圆直径
        activeSize: 8,
    },
    /** 圆角控制点：橙色菱形 */
    radiusControl: {
        fill: '#F5A623',
        stroke: '#ffffff',
        strokeWidth: 1.5,
        size: 7,          // 菱形对角线的一半
        activeSize: 9,
    },
} as const

/**
 * 当圆角控制点与角点重合时，渲染偏移量（像素）。
 * 将圆角控制点向内侧偏移，使其始终可见可操作。
 */
const RADIUS_COLLAPSED_OFFSET = 12

/**
 * 顶点插件 —— 图形控制点编辑
 *
 * 职责：RENDER + INTERACT
 * - RENDER：选中时渲染角点方块、边中点圆、圆角菱形控制点
 * - INTERACT：选中时检测控制点命中，触发顶点编辑
 *
 * 优先级：10（在 BoundingBox 之后执行）
 */
export default class VertexAddon implements IVertexAddon {
    public readonly type = AddonType.VERTEX
    public readonly capabilities = [
        AddonCapability.RENDER,
        AddonCapability.INTERACT,
    ] as const
    public readonly priority = 10
    public vertices: Point3[]
    public activeVertex: Point3 | null = null
    isEditing: boolean = true

    /**
     * 从此索引开始的顶点视为"圆角控制点"，用不同样式渲染。
     * 默认为 -1 表示所有顶点都是普通顶点。
     */
    public radiusControlStartIndex: number = -1

    /**
     * 边中点索引列表（奇数索引：1,3,5,7）
     * 仅当 radiusControlStartIndex > 0 时有意义（表示存在结构化控制点布局）
     */
    public midpointIndices: number[] = []

    constructor(vertices: Point3[] = [], radiusControlStartIndex: number = -1) {
        this.vertices = [...vertices]
        this.radiusControlStartIndex = radiusControlStartIndex
        // 如果有圆角控制点布局（8 尺寸 + 4 圆角），边中点为索引 1,3,5,7
        if (radiusControlStartIndex === 8) {
            this.midpointIndices = [1, 3, 5, 7]
        }
    }

    /**
     * 获取顶点数量
     */
    getVertexCount(): number {
        return this.vertices.length
    }

    /**
     * 获取指定索引的顶点
     */
    getVertex(index: number): Point3 | null {
        if (index >= 0 && index < this.vertices.length) {
            return this.vertices[index]
        }
        return null
    }

    /**
     * 设置指定索引的顶点
     */
    setVertex(index: number, vertex: Point3): boolean {
        if (index >= 0 && index < this.vertices.length) {
            this.vertices[index] = vertex
            return true
        }
        return false
    }

    /**
     * 复制顶点插件
     */
    copy(): VertexAddon {
        const addon = new VertexAddon(
            this.vertices.map((v) => v.copy()),
            this.radiusControlStartIndex,
        )
        return addon
    }

    /**
     * 判断指定索引的顶点是否为圆角控制点
     */
    private isRadiusControl(index: number): boolean {
        return this.radiusControlStartIndex >= 0 && index >= this.radiusControlStartIndex
    }

    /**
     * 判断指定索引是否为边中点
     */
    private isMidpoint(index: number): boolean {
        return this.midpointIndices.includes(index)
    }

    /**
     * 判断圆角控制点是否与对应角点重合（radius≈0 时会重合）
     * 返回对应的角点索引，若不重合返回 -1
     */
    private getCollapsedCornerIndex(radiusIndex: number): number {
        if (!this.isRadiusControl(radiusIndex)) return -1
        // 圆角控制点 8→角0(左上), 9→角2(右上), 10→角4(右下), 11→角6(左下)
        const radiusLocalIndex = radiusIndex - this.radiusControlStartIndex
        // 对应的角点索引（角点在 0,2,4,6）
        const cornerIndex = radiusLocalIndex * 2
        if (cornerIndex < 0 || cornerIndex >= this.radiusControlStartIndex) return -1
        const corner = this.vertices[cornerIndex]
        const radiusPoint = this.vertices[radiusIndex]
        if (!corner || !radiusPoint) return -1
        if (corner.subtract(radiusPoint).length < 0.5) {
            return cornerIndex
        }
        return -1
    }

    /**
     * 计算圆角控制点渲染时的实际显示位置。
     * 当圆角控制点与角点重合时，向矩形内部偏移一定距离，使其始终可见。
     */
    private getRadiusRenderPosition(index: number): Point3 {
        const point = this.vertices[index]
        const collapsedCornerIdx = this.getCollapsedCornerIndex(index)

        if (collapsedCornerIdx < 0) {
            // 未重合，原位渲染
            return point
        }

        // 重合时：向矩形内部偏移
        // 圆角控制点 8,11 在左侧（向右偏移），9,10 在右侧（向左偏移）
        const radiusLocalIndex = index - this.radiusControlStartIndex
        const offsetX = (radiusLocalIndex === 0 || radiusLocalIndex === 3)
            ? RADIUS_COLLAPSED_OFFSET
            : -RADIUS_COLLAPSED_OFFSET

        return new Point3(point.x + offsetX, point.y, point.z)
    }

    /**
     * 渲染顶点（控制点）
     */
    render(ctx: CanvasRenderingContext2D): void {
        if (!this.vertices || this.vertices.length === 0 || !this.isEditing) {
            return
        }
        ctx.save()
        try {
            this.vertices.forEach((vertex, index) => {
                const isActive = vertex === this.activeVertex
                const isRadius = this.isRadiusControl(index)
                const isMid = this.isMidpoint(index)

                if (isRadius) {
                    // 圆角控制点：菱形（可能带偏移）
                    const renderPos = this.getRadiusRenderPosition(index)
                    this.renderDiamond(ctx, renderPos, isActive)
                } else if (isMid) {
                    // 边中点：小圆
                    this.renderCircle(ctx, vertex, isActive)
                } else {
                    // 普通顶点（角点）：方块
                    this.renderSquare(ctx, vertex, isActive)
                }
            })
        } finally {
            ctx.restore()
        }
    }

    /**
     * 渲染方块顶点（角点控制点）
     */
    private renderSquare(ctx: CanvasRenderingContext2D, vertex: Point3, isActive: boolean): void {
        const { fill, stroke, strokeWidth, size, activeSize } = THEME.vertex
        const half = (isActive ? activeSize : size) / 2

        ctx.fillStyle = fill
        ctx.strokeStyle = stroke
        ctx.lineWidth = strokeWidth

        ctx.beginPath()
        ctx.rect(vertex.x - half, vertex.y - half, half * 2, half * 2)
        ctx.fill()
        ctx.stroke()
    }

    /**
     * 渲染小圆（边中点控制点）
     */
    private renderCircle(ctx: CanvasRenderingContext2D, vertex: Point3, isActive: boolean): void {
        const { fill, stroke, strokeWidth, size, activeSize } = THEME.midpoint
        const radius = (isActive ? activeSize : size) / 2

        ctx.fillStyle = fill
        ctx.strokeStyle = stroke
        ctx.lineWidth = strokeWidth

        ctx.beginPath()
        ctx.arc(vertex.x, vertex.y, radius, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
    }

    /**
     * 渲染菱形顶点（圆角控制点）
     */
    private renderDiamond(ctx: CanvasRenderingContext2D, vertex: Point3, isActive: boolean): void {
        const { fill, stroke, strokeWidth, size, activeSize } = THEME.radiusControl
        const half = (isActive ? activeSize : size) / 2

        ctx.fillStyle = fill
        ctx.strokeStyle = stroke
        ctx.lineWidth = strokeWidth

        ctx.beginPath()
        ctx.moveTo(vertex.x, vertex.y - half)       // 上
        ctx.lineTo(vertex.x + half, vertex.y)       // 右
        ctx.lineTo(vertex.x, vertex.y + half)       // 下
        ctx.lineTo(vertex.x - half, vertex.y)       // 左
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
    }

    /**
     * 交互接口
     * 注意：圆角控制点可能有视觉偏移，hit test 使用偏移后的渲染位置
     */
    interact(p: Point3): ExtraData | null {
        const v = this.vertices.find((v, index) => {
            const isRadius = this.isRadiusControl(index)
            if (isRadius) {
                // 圆角控制点：使用渲染位置进行 hit test
                const renderPos = this.getRadiusRenderPosition(index)
                return renderPos.subtract(p).length < 5
            }
            return v.subtract(p).length < 5
        })
        if (!v) {
            this.activeVertex = null
            return null
        }
        this.activeVertex = v
        return {
            cursorStyle: Cursor.Grab,
            action: Action.EDIT_POINT,
            editPoint: v,
        }
    }
}
