import View, { InteractResult, ViewOptions } from "@/view/View/View";
import { Graph, Line } from "@/graph";
import { isAnalyticGraph, isCombinedGraph, IGraphView, ISerializable } from "@/types";
import { VIEWTYPE, GRAPHTYPE } from "@/foundation/constants";
import type { ViewType } from "@/foundation/constants";
import { generateId, generateName } from "@/foundation/utils";
import { Point3, Vector3 } from "@/foundation/math";
import { VertexAddon } from "@/view/addon";
import Bounds from "@/graph/base/Bounds";

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
  public type: ViewType = VIEWTYPE.GRAPHVIEW;
  public content: Graph;
  public controlPoints: VertexAddon | null = null;

  constructor(graph: Graph, options: GraphViewOptions = {}) {
    // 将graph作为content传递给父类构造函数
    super({ ...options });
    this.id = options.id || generateId(this.type);
    this.name = options.name || generateName(this.type);
    this.content = graph;

    // TOREVIEW: 多个插件的展示、交互、优先级是怎么样的
    if (isAnalyticGraph(graph) || isCombinedGraph(graph)) {
      this.boundingBox = null;
    }

    // graph独有的控制点插件
    const vertics =
      this.content.controlPoints instanceof Float32Array
        ? Point3.fromArray(this.content.controlPoints)
        : this.content.controlPoints;
    // RoundedRect: 前8个为尺寸控制点（4角+4边中点），后4个为圆角控制点
    const radiusStartIndex = graph.type === GRAPHTYPE.ROUNDED_RECT ? 8 : -1;
    this.controlPoints = new VertexAddon(vertics, radiusStartIndex);
  }

  protected interactPlugins(relativePoint: Point3, bufferCtx?: CanvasRenderingContext2D): InteractResult {
    // BoundingBox 优先（来自基类）
    const baseResult = super.interactPlugins(relativePoint, bufferCtx);
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

    // 移动约束
    const isRadiusControl = this.controlPoints.radiusControlStartIndex >= 0
      && index >= this.controlPoints.radiusControlStartIndex
    const isMidpoint = this.controlPoints.midpointIndices.includes(index)

    let dx = localDelta.x
    let dy = localDelta.y

    if (isRadiusControl) {
      // 圆角控制点：只允许水平方向移动
      dy = 0
    } else if (isMidpoint) {
      // 边中点约束：上/下边中点只允许垂直移动，左/右边中点只允许水平移动
      // index 1(上边中点), 5(下边中点) → 只改 y
      // index 3(右边中点), 7(左边中点) → 只改 x
      if (index === 1 || index === 5) {
        dx = 0
      } else {
        dy = 0
      }
    }

    // 计算新顶点位置
    const newVertex = new Point3(
      vertex.x + dx,
      vertex.y + dy,
      vertex.z
    )

    // 委托给 content.setControlPoint，由各子类处理自身约束（含 clamp）
    this.content.setControlPoint(index, newVertex)

    // setControlPoint 内部会 clamp，需要从 content 重新读取实际控制点位置
    const actualPoints = this.content.controlPoints instanceof Float32Array
      ? Point3.fromArray(this.content.controlPoints)
      : this.content.controlPoints
    this.controlPoints.vertices = actualPoints
    this.controlPoints.activeVertex = actualPoints[index]

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
    if (this.decoration) {
      newView.decoration = this.decoration.copy();
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
    view.restoreFromJSON(data);
    return view;
  }
}
