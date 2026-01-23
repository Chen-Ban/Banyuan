import { VIEWTYPE } from "@/core/constants";
import { Graph, Rectangle } from "../../graph";
import View, { ViewOptions, ViewContent } from "../View";
import { Matrix4, Point3, Vector3 } from "../../math";
import Bounds from "../../graph/base/Bounds";
import { world2Relative } from "@/utils/utils";
import { getGlobalCanvasContext } from "../../renderer/CanvasContext";
import { ViewAddonImpl } from "../addon";
import { InteractionMapBuilder } from "../addon";
import { Action, Cursor, ExtraData } from "../addon/InteractionMapBuilder";

// 组合视图选项接口
export interface CombinedViewOptions extends Omit<ViewOptions, "content"> {
  // 组合视图特有的选项可以在这里添加
}

/**
 * 组合视图 - 专门处理View[]类型内容，管理子View
 */
export default class CombinedView extends View {
  public type: VIEWTYPE = VIEWTYPE.COMBINEDVIEW;
  public content: Graph[];
  public children: View[];

  constructor(views: View[] = [], options: CombinedViewOptions = {}) {
    // 将views作为content传递给父类构造函数
    super({ ...options });
    this.content = options.graph ? [options.graph] : [];
    this.children = views;
    if(!options.matrix){
      this.initMatrix();
    }
    this.initRef();
    this.initBoundingBox();
    this.initViewport();
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
    // 优先命中子视图（从前到后或根据需要调整顺序）
    for (const child of this.children) {
      const { view, content, extraData } = child.interact(p);
      if (view && content && extraData) {
        // 添加子视图的交互结果
        builder.add(view, content, extraData);
      }
    }
    if (builder.size > 0) {
      return builder.build();
    }
    // 命中自身内容（如有）
    this.content.forEach((content) => {
      const hitContent = content.isPointInPath(relativePoint);
      if (hitContent) {
        builder.add(this, [content], {
          cursorStyle: Cursor.Move,
          action: Action.MOVE,
        });
      }
    });
    if (builder.size > 0) {
      return builder.build();
    }

    // 命中边界框（移动/缩放）
    if (this.actived && this.boundingBox) {
      const extraData = this.boundingBox.interact(relativePoint);
      if (extraData) {
        return builder.add(this, this.boundingBox, extraData).build();
      }
    }

    return builder.build();
  }

  public renderContent(ctx: CanvasRenderingContext2D): void {
    if (this.content[0]) {
      this.content[0].render(ctx);
    }
  }

  initRef() {
    this.children.forEach((view) => {
      view.parent = this;
    });
  }


  initMatrix() {
    const contentBounds = this.getContentBounds()
    this.matrix = Matrix4.translation(contentBounds.x,contentBounds.y,0)
  }

  // 组合容器的内容盒是子容器的包围盒
  public getContentBounds(): Bounds {
    // 同层级下view，将他们包围盒矩形转换到同一坐标系再计算包围盒
    const points = this.children.map(child=>{
      // view的包围盒插件是要包含容器起点的，至少比content包围盒大
      const boundingRect = Rectangle.fromBounds(child.boundingBox?.getBounds() ?? Bounds.empty())
      return boundingRect.vertices.map(point=>child.getWorldMatrix().multiply(point))
    }).flat()
    return Bounds.fromPoints(points)
  }

  public resize(fixedIndex: number, dynamicIndex: number, vector: Vector3) {

  }

  public copy(): CombinedView {
    const newView = new CombinedView(this.children.map((view) => view.copy()));

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

  // 子View管理方法
  public addChild(child: View): void {
    if (!this.children.includes(child)) {
      this.children.push(child);
      child.parent = this;
      child.onAttach();
    }
  }

  public removeChild(child: View): void {
    const index = this.children.indexOf(child);
    if (index > -1) {
      this.children.splice(index, 1);
      child.parent = null;
    }
  }

  public clear(): void {
    this.children.forEach((child) => {
      child.parent = null;
      child.onDestroy();
    });
    this.children = [];
  }
}

export function isCombinedView(view: any): view is CombinedView {
  return view instanceof CombinedView;
}
