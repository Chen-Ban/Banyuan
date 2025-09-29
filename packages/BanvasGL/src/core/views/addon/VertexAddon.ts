import { Point3 } from '../../math'

/**
 * 顶点插件
 * 定义视图的顶点集合
 */
export interface VertexAddon {
    vertices: Point3[]
    [key: string]: any
}

export default class VertexAddonImpl implements VertexAddon {
    public vertices: Point3[]

    constructor(vertices: Point3[] = [], additionalProps: Record<string, any> = {}) {
        this.vertices = [...vertices]
        
        // 添加额外的属性
        Object.assign(this, additionalProps)
    }

    /**
     * 添加顶点
     */
    addVertex(vertex: Point3): VertexAddonImpl {
        this.vertices.push(vertex)
        return this
    }

    /**
     * 添加多个顶点
     */
    addVertices(vertices: Point3[]): VertexAddonImpl {
        this.vertices.push(...vertices)
        return this
    }

    /**
     * 移除顶点
     */
    removeVertex(index: number): Point3 | null {
        if (index >= 0 && index < this.vertices.length) {
            return this.vertices.splice(index, 1)[0]
        }
        return null
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
     * 清空所有顶点
     */
    clear(): VertexAddonImpl {
        this.vertices = []
        return this
    }

    /**
     * 获取顶点数组的副本
     */
    getVertices(): Point3[] {
        return [...this.vertices]
    }

    /**
     * 计算边界框
     */
    getBounds(): { x: number, y: number, width: number, height: number } | null {
        if (this.vertices.length === 0) {
            return null
        }

        let minX = this.vertices[0].x
        let maxX = this.vertices[0].x
        let minY = this.vertices[0].y
        let maxY = this.vertices[0].y

        for (const vertex of this.vertices) {
            minX = Math.min(minX, vertex.x)
            maxX = Math.max(maxX, vertex.x)
            minY = Math.min(minY, vertex.y)
            maxY = Math.max(maxY, vertex.y)
        }

        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        }
    }

    /**
     * 复制顶点插件
     */
    copy(): VertexAddonImpl {
        const additionalProps: Record<string, any> = {}
        for (const key in this) {
            if (key !== 'vertices') {
                additionalProps[key] = this[key]
            }
        }
        return new VertexAddonImpl(
            this.vertices.map(v => v.copy()),
            additionalProps
        )
    }
}
