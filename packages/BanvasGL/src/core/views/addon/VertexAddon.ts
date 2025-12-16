import { Point3 } from "../../math";
import { Action, Cursor, ExtraData } from "./InteractionMapBuilder";

/**
 * 顶点插件
 * 定义视图的顶点集合
 */
export interface VertexAddon {
  vertices: Point3[];
  render(ctx: CanvasRenderingContext2D): void;
}

export default class VertexAddonImpl implements VertexAddon {
  public vertices: Point3[];
  public activeVertex: Point3 | null = null;

  constructor(vertices: Point3[] = []) {
    this.vertices = [...vertices];
  }

  /**
   * 获取顶点数量
   */
  getVertexCount(): number {
    return this.vertices.length;
  }

  /**
   * 获取指定索引的顶点
   */
  getVertex(index: number): Point3 | null {
    if (index >= 0 && index < this.vertices.length) {
      return this.vertices[index];
    }
    return null;
  }

  /**
   * 设置指定索引的顶点
   */
  setVertex(index: number, vertex: Point3): boolean {
    if (index >= 0 && index < this.vertices.length) {
      this.vertices[index] = vertex;
      return true;
    }
    return false;
  }

  /**
   * 复制顶点插件
   */
  copy(): VertexAddonImpl {
    return new VertexAddonImpl(this.vertices.map((v) => v.copy()));
  }

  /**
   * 渲染顶点（控制点）
   */
  render(ctx: CanvasRenderingContext2D): void {
    if (!this.vertices || this.vertices.length === 0) {
      return;
    }
    ctx.save();
    try {
      ctx.fillStyle = "#ff0000";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      const radius = 4;
      const activeRadius = 6;
      this.vertices.forEach((vertex) => {
        ctx.beginPath();
        if (vertex === this.activeVertex) {
          ctx.arc(vertex.x, vertex.y, activeRadius, 0, 2 * Math.PI);
        } else {
          ctx.arc(vertex.x, vertex.y, radius, 0, 2 * Math.PI);
        }
        ctx.fill();
        ctx.stroke();
      });
    } finally {
      ctx.restore();
    }
  }

  /**
   * 交互接口
   */
  interact(p: Point3): ExtraData | null {
    const v = this.vertices.find((v) => v.subtract(p).length < 5);
    if (!v) {
      this.activeVertex = null;
      return null;
    }
    this.activeVertex = v;
    return {
      cursorStyle: Cursor.Grab,
      action: Action.EDIT_POINT,
      editPoint: v,
    };
  }
}

export function isVertexAddon(addon: any): addon is VertexAddonImpl {
  return addon instanceof VertexAddonImpl;
}