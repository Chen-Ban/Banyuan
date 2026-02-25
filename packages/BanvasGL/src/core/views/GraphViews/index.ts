import View, { ViewOptions, ViewContent } from "../View/View";
import { Graph } from "../../graph";
import { VIEWTYPE } from "@/core/constants";
import { Point3, Vector3 } from "../../math";
import { VertexAddonImpl, ViewAddonImpl } from "../addon";
import { getGlobalCanvasContext } from "../../renderer/CanvasContext";
import { InteractionMapBuilder } from "../addon";
import { Action, Cursor, ExtraData } from "../View/InteractionMapBuilder";
import Bounds from "@/core/graph/base/Bounds";

// 图形视图选项接口
export interface GraphViewOptions extends Omit<ViewOptions, "content"> {
  // 图形视图特有的选项可以在这里添加
}

/**
 * 图形视图 - 专门处理Graph类型内容
 */
export default class GraphView extends View {
  public type: VIEWTYPE = VIEWTYPE.GRAPHVIEW;
  public content: [Graph];
  public children: View[] = [];
  public controlPoints: VertexAddonImpl[] | null = null;

  constructor(graph: Graph, options: GraphViewOptions = {}) {
    // 将graph作为content传递给父类构造函数
    super({ ...options });
    this.content = [graph];
    // TODO：获取顶点插件
    this.controlPoints = this.content.map(graph => {
      const vertics = graph.controlPoints instanceof Float32Array ? Point3.fromArray(graph.controlPoints) : graph.controlPoints
      return new VertexAddonImpl(vertics)
    })
  }

  public renderContent(ctx: CanvasRenderingContext2D): void {
    this.content.forEach(graph => graph.render(ctx))
    // TOREVIEW: 容器独有的插件应该怎么渲染
    this.controlPoints?.forEach(addon => addon.render(ctx))
  }

  public getContentBounds(): Bounds {
    return this.content[0].bounds;
  }

  public interact(p: Point3): {
    view: View | null;
    content: ViewContent | ViewAddonImpl | null;
    extraData: ExtraData | null;
  } {
    const relativePoint = this.getMVPMatrix().inverse().multiply(p)
    const builder = new InteractionMapBuilder();

    const ctx = getGlobalCanvasContext()?.getBufferContext();
    if (!ctx) throw new Error("交互失败");

    // 检查控制点
    if (this.actived && this.controlPoints) {
      const extraDatas = this.controlPoints.map(addon => addon.interact(relativePoint))
      const index = extraDatas.findIndex(data => data !== null)
      if (index !== -1) {
        return builder.add(this, this.controlPoints[index], extraDatas[index] as ExtraData).build();
      }
    }

    // 检查内容
    if (this.content) {
      const hitContent =
        this.content[0].isPointInPath(relativePoint) || this.content[0].isPointOnCurve(relativePoint, 2);
      if (hitContent) {
        return builder.add(this, this.content, {
          cursorStyle: Cursor.Move,
          action: Action.MOVE,
        }).build();
      }
    }

    // 检查边界框
    if (this.actived && this.boundingBox) {
      const extraData = this.boundingBox.interact(relativePoint);
      if (extraData) {
        return builder.add(this, this.boundingBox, extraData).build();
      }
    }

    return builder.build();
  }

  public editPoint(point: Point3, vector: Vector3): void {

  }

  public copy(): GraphView {
    const newView = new GraphView(this.content[0]);

    // 复制基本属性
    newView.layer = this.layer;
    newView.id = this.id;
    newView.properties = { ...this.properties };
    newView.data = { ...this.data };
    newView.style = {
      ...this.style,
      content: this.style.content?.map(style => style.copy()),
      layoutArea: this.style.layoutArea?.copy()
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
      newView.controlPoints = this.controlPoints.map(addon => addon.copy());
    }
    if (this.boundingBox) {
      newView.boundingBox = this.boundingBox.copy();
    }

    return newView;
  }
}

export function isGraphView(view: any): view is GraphView {
  return view instanceof GraphView;
}
