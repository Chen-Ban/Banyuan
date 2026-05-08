import { Point3 } from '@/core/math'
import { Action, Cursor, ExtraData, IVertexAddon } from '@/core/interfaces'
import { ADDONTYPE } from '@/core/constants'

/**
 * 顶点样式主题（PPT 风格）
 */
const THEME = {
    /** 普通顶点：蓝色方块 */
    vertex: {
        fill: '#4A90D9',
        stroke: '#ffffff',
        strokeWidth: 1.5,
        size: 7,          // 方块边长
        activeSize: 9,
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

export default class VertexAddon implements IVertexAddon {
    public readonly type = ADDONTYPE.VERTEX
    public vertices: Point3[]
    public activeVertex: Point3 | null = null
    isEditing: boolean = true

    /**
     * 从此索引开始的顶点视为"圆角控制点"，用不同样式渲染。
     * 默认为 -1 表示所有顶点都是普通顶点。
     */
    public radiusControlStartIndex: number = -1

    constructor(vertices: Point3[] = [], radiusControlStartIndex: number = -1) {
        this.vertices = [...vertices]
        this.radiusControlStartIndex = radiusControlStartIndex
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

                if (isRadius) {
                    // 圆角控制点：菱形
                    this.renderDiamond(ctx, vertex, isActive)
                } else {
                    // 普通顶点：方块
                    this.renderSquare(ctx, vertex, isActive)
                }
            })
        } finally {
            ctx.restore()
        }
    }

    /**
     * 渲染方块顶点（普通控制点）
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
     */
    interact(p: Point3): ExtraData | null {
        const v = this.vertices.find((v) => v.subtract(p).length < 5)
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
