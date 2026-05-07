import View, { InteractResult, ViewOptions } from "@/core/views/View/View";
import { Graph, Line } from "@/core/graph";
import { isAnalyticGraph, IGraphView, ISerializable } from "@/core/interfaces";
import { VIEWTYPE } from "@/core/constants";
import { generateId, generateName } from "@/core/utils";
import { Point3, Vector3 } from "@/core/math";
import { VertexAddon } from "@/core/views/addon";
import Matrix4 from "@/core/math/Matrix4";
import Bounds from "@/core/graph/base/Bounds";

// 图形视图选项接口
export interface GraphViewOptions extends Omit<ViewOptions, "content"> {
  // 图形视图特有的选项可以在这里添加
}

/**
 * 图形视图 - 专门处理Graph类型内容
 */
export default class GraphView
  extends View
  implements IGraphView, ISerializable
{
  public type: VIEWTYPE = VIEWTYPE.GRAPHVIEW;
  public content: Graph;
  public controlPoints: VertexAddon | null = null;

  constructor(graph: Graph, options: GraphViewOptions = {}) {
    // 将graph作为content传递给父类构造函数
    super({ ...options });
    this.id = options.id || generateId(this.type);
    this.name = options.name || generateName(this.type);
    this.content = graph;

    // TOREVIEW: 多个插件的展示、交互、优先级是怎么样的
    if (isAnalyticGraph(graph)) {
      this.boundingBox = null;
    }

    // graph独有的控制点插件
    const vertics =
      this.content.controlPoints instanceof Float32Array
        ? Point3.fromArray(this.content.controlPoints)
        : this.content.controlPoints;
    this.controlPoints = new VertexAddon(vertics);
  }

  protected interactPlugins(relativePoint: Point3): InteractResult {
    // BoundingBox 优先（来自基类）
    const baseResult = super.interactPlugins(relativePoint);
    if (baseResult.view) return baseResult;

    // VertexAddon（控制点编辑）
    if (this.actived && this.controlPoints) {
      const data = this.controlPoints.interact(relativePoint);
      if (data) {
        return { view: this, content: this.controlPoints, extraData: data };
      }
    }
    return { view: null, content: null, extraData: null };
  }

  public renderPlugins(ctx: CanvasRenderingContext2D): void {
    super.renderPlugins(ctx);
    if (!this.actived) return;
    this.controlPoints?.render(ctx);
  }

  /**
   * 编辑顶点：拖拽控制点时更新 VertexAddon 和 content
   * @param _point 当前鼠标位置（屏幕坐标，暂未使用）
   * @param delta 位移向量（屏幕坐标）
   */
  public editPoint(_point: Point3, delta: Vector3): void {
    if (!this.controlPoints?.activeVertex) return

    // 屏幕坐标 → 局部坐标：通过 MVP 逆矩阵转换 delta
    const mvp = this.getMVPMatrix()
    const inverseMVP = mvp.inverse()
    const originLocal = inverseMVP.multiply(Point3.origin)
    const deltaEndLocal = inverseMVP.multiply(new Point3(delta.x, delta.y, delta.z))
    const localDelta = deltaEndLocal.subtract(originLocal)

    // 找到活跃顶点在数组中的索引
    const vertex = this.controlPoints.activeVertex
    const index = this.controlPoints.vertices.indexOf(vertex)
    if (index < 0) return

    // 计算新顶点位置
    const newVertex = new Point3(
      vertex.x + localDelta.x,
      vertex.y + localDelta.y,
      vertex.z
    )

    // 更新 VertexAddon 中的顶点（保持 activeVertex 引用同步）
    this.controlPoints.vertices[index] = newVertex
    this.controlPoints.activeVertex = newVertex

    // 委托给 content.setControlPoint，由各子类处理自身约束
    this.content.setControlPoint(index, newVertex)

    // 重算 layoutArea
    this.layoutArea = Bounds.union(
      this.content.bounds ?? Bounds.empty(),
      this.measureChildren()
    )
    this.layout()
  }

  public getSnapObjects(): [Point3[], Line[]] {
    const [points, lines] = super.getSnapObjects();
    const mvpInverse = this.getMVPMatrix().inverse();
    let controlPoints = this.content.controlPoints;
    if (controlPoints instanceof Float32Array) {
      controlPoints = Point3.fromArray(controlPoints);
    }
    return [
      [...points, ...controlPoints.map((p) => mvpInverse.multiply(p))],
      lines,
    ];
  }

  public copy(): GraphView {
    const newView = new GraphView(this.content);

    // 复制基本属性（id 由构造器自动生成新的）
    newView.properties = { ...this.properties };
    newView.data = { ...this.data };
    newView.style = {
      ...this.style,
    };
    newView.selected = this.selected;
    newView.actived = this.actived;
    newView.freezed = this.freezed;
    newView.visible = this.visible;
    newView.matrix = this.matrix.copy();

    // 复制插件
    if (this.viewport) {
      newView.viewport = this.viewport.copy();
    }
    if (this.controlPoints) {
      newView.controlPoints = this.controlPoints.copy();
    }
    if (this.boundingBox) {
      newView.boundingBox = this.boundingBox.copy();
    }

    return newView;
  }

  // ==================== 序列化 ====================

  /**
   * 从纯数据对象恢复 GraphView 实例。
   * data.content 应由 Serializer 预先解析为 Graph 实例后传入。
   */
  static fromJSON(data: any): GraphView {
    const view = new GraphView(data.content);
    view.id = data.id;
    view.visible = data.visible;
    view.freezed = data.freezed;
    if (data.properties) view.properties = data.properties;
    if (data.data) view.data = data.data;
    if (data.style) view.style = data.style;
    if (data.matrix) view.matrix = Matrix4.fromJSON(data.matrix);
    if (data.viewport) view.viewport = Bounds.fromJSON(data.viewport);
    if (data.children) {
      data.children.forEach((child: View) => {
        view.children.push(child);
        child.parent = view;
        child.onAttach();
      });
    }
    return view;
  }
}
