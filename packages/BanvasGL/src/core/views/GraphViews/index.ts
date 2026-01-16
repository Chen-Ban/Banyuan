import View, { ViewOptions, ViewContent } from "../View";
import { Graph } from "../../graph";
import { VIEWTYPE } from "@/core/constants";
import { Point3, Vector3 } from "../../math";
import { ViewAddonImpl } from "../addon";
import { world2Relative } from "@/utils/utils";
import { getGlobalCanvasContext } from "../../renderer/CanvasContext";
import { InteractionMapBuilder } from "../addon";
import { Action, Cursor, ExtraData } from "../addon/InteractionMapBuilder";

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

  constructor(graph: Graph, options: GraphViewOptions = {}) {
    // 将graph作为content传递给父类构造函数
    super({ ...options });
    this.content = [graph];
    this.initBoundingBox();
    this.initViewport();
  }

  public renderContent(ctx: CanvasRenderingContext2D): void {
    if (this.content) {
      this.content[0].render(ctx);
    }
  }

  public getContentBounds(): {
    x: number;
    y: number;
    width: number;
    height: number;
  } {
    return this.content[0].getBounds();
  }

  public interact(p: Point3): {
    view: View | null;
    content: ViewContent | ViewAddonImpl | null;
    extraData: ExtraData | null;
  } {
    const relativePoint = world2Relative(p, this.getWorldMatrix());
    const builder = new InteractionMapBuilder();

    const ctx = getGlobalCanvasContext()?.getBufferContext();
    if (!ctx) throw new Error("交互失败");

    // 检查控制点
    if (this.actived && this.controlPoints) {
      const extraData = this.controlPoints.interact(relativePoint);
      if (extraData) {
        return builder.add(this, this.controlPoints, extraData).build();
      }
    }

    // 检查内容
    if (this.content) {
      const hitContent =
        this.content[0].isPointInPath(relativePoint) || this.content[0].isPointOnCurve(relativePoint, 2);
      if (hitContent) {
        return builder
          .add(this, this.content, {
            cursorStyle: Cursor.Move,
            action: Action.MOVE,
          })
          .build();
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

  public resize(fixedIndex: number, dynamicIndex: number, vector: Vector3) {
    const fixedPoint = this.boundingBox?.handles[fixedIndex].getCenter();
    const dynamicPoint = this.boundingBox?.handles[dynamicIndex].getCenter();
    if (!fixedPoint || !dynamicPoint) throw new Error("固定点或动态点不存在");

    let referenceVector = dynamicPoint.subtract(fixedPoint).normalized;

    // 变化介质尺寸
    let width = Math.abs(dynamicPoint.x - fixedPoint.x);
    let height = Math.abs(dynamicPoint.y - fixedPoint.y);
    // 单分量变化时，未变化方向介质尺寸为无穷大，表示后续计算中变化值为0
    if (width === 0) width = Infinity;
    if (height === 0) height = Infinity;

    // 变化比例
    const scaleX = this.center.x / width;
    const scaleY = this.center.y / height;

    // 带方向并且按照介质尺寸缩放的移动量
    const dx = Math.abs(vector.x) * Math.sign(vector.x * referenceVector.x) * scaleX;
    const dy = Math.abs(vector.y) * Math.sign(vector.y * referenceVector.y) * scaleY;

    const overflowX = Math.abs(dx) > width && Math.sign(dx) === -1;
    const overflowY = Math.abs(dy) > height && Math.sign(dy) === -1;

    this.content[0].resize([width, height], [dx, dy], [overflowX, overflowY]);
    this.initBoundingBox();
    this.initViewport();

    // 计算平移向量
    // 1.如果超出了介质尺寸，则计算新的fixedIndex和dynamicIndex，否则使用当前index
    // 2.根据新的index计算translateVector
    // 3.计算新的matrix
    if (overflowX) {
      if (fixedIndex % 2 === 0) {
      }
    }
  }

  public copy(): GraphView {
    const newView = new GraphView(this.content[0]);

    // 复制基本属性
    newView.layer = this.layer;
    newView.id = this.id;
    newView.properties = { ...this.properties };
    newView.data = { ...this.data };
    newView.style = this.style.copy();
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
}

export function isGraphView(view: any): view is GraphView {
  return view instanceof GraphView;
}
