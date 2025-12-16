import { VIEWTYPE } from "@/core/constants";
import { Graph, Rectangle } from "../../graph";
import View, { ViewOptions, ViewContent } from "../View";
import { Point3, Vector3 } from "../../math";
import Bounds from "../../graph/base/Bounds";
import { world2Relative } from "@/utils/utils";
import { getGlobalCanvasContext } from "../../renderer/CanvasContext";
import { ViewAddonImpl } from "../addon";
import { InteractionMapBuilder } from "../addon";
import { Action, Cursor, ExtraData } from "../addon/InteractionMapBuilder";

type Extreme = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

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

  private _contentBounds: Bounds;
  private _extreme: Extreme;
  constructor(views: View[] = [], options: CombinedViewOptions = {}) {
    // 将views作为content传递给父类构造函数
    super({ ...options });
    this.content = options.graph ? [options.graph] : [];
    this.children = views;

    this._extreme = this.computeExtreme();
    this.initMatrix();
    this._contentBounds = this.initContentBox();
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
    this.content.forEach(content=>{
      const hitContent = content.isPointInPath(relativePoint);
      if (hitContent) {
        builder
          .add(this, [content], {
            cursorStyle: Cursor.Move,
            action: Action.MOVE,
          })
      }
    })
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

  computeExtreme() {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const child of this.children) {
      const childBounds = child.boundingBox?.getBounds();
      if (!childBounds) throw new Error("Child bounding box is not set");
      const points = new Rectangle(childBounds.x, childBounds.y, childBounds.width, childBounds.height).controlPoints;
      const transformedPoint = points.map((p) => child.matrix.multiply(p));

      minX = Math.min(...[minX, ...transformedPoint.map((p) => p.x)]);
      minY = Math.min(...[minY, ...transformedPoint.map((p) => p.y)]);
      maxX = Math.max(...[maxX, ...transformedPoint.map((p) => p.x)]);
      maxY = Math.max(...[maxY, ...transformedPoint.map((p) => p.y)]);
    }

    if (minX === Infinity || minY === Infinity || maxX === -Infinity || maxY === -Infinity) {
      throw new Error("initContentBox error");
    }
    return {
      minX,
      minY,
      maxX,
      maxY,
    };
  }

  initMatrix() {
    if (!this.children.length) return;
    this.matrix.translate(this._extreme.minX, this._extreme.minY, 0);
  }
  initContentBox(): Bounds {
    const { minX, minY, maxX, maxY } = this._extreme;
    return new Bounds(0, 0, maxX - minX, maxY - minY);
  }

  public getContentBounds(): Bounds {
    if (!this._contentBounds) {
      this._contentBounds = this.initContentBox();
    }
    return this._contentBounds;
  }

  public resize(fixedPoint: Point3, dynamicPoint: Point3, vector: Vector3): void {
    //将固定点、动态点映射到对应的子view对应的固定点、动态点，避免变换介质的尺寸失真
    this.children.forEach(child=>{
      const fixedIndex = child.boundingBox?.handles.findIndex(handle=>handle.isPointInPath(fixedPoint));
      const dynamicIndex = child.boundingBox?.handles.findIndex(handle=>handle.isPointInPath(dynamicPoint));
      if (fixedIndex !== undefined && dynamicIndex !== undefined) {
        const fixed = child.boundingBox?.handles[fixedIndex];
        const dynamic = child.boundingBox?.handles[dynamicIndex];
        if (fixed && dynamic) {
          child.resize(fixed.getCenter(), dynamic.getCenter(), vector);
        }
      }
    })
    this.initBoundingBox();
    this.initViewport();
    this._contentBounds = this.initContentBox();
    this._extreme = this.computeExtreme();
    this.initMatrix();
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
      child.parent = this as any;
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

  public getChildren(): View[] {
    return [...this.children];
  }

  public getChildCount(): number {
    return this.children.length;
  }

  public clear(): void {
    this.children.forEach((child) => {
      child.parent = null;
      child.onDestroy();
    });
    this.children = [];
  }

  public isCombinedView() {
    return true;
  }

  // 重写contains方法以支持子View
  public contains(view: View): boolean {
    if (this === view) {
      return true;
    }
    return this.children.some((child) => child.contains(view));
  }
}

export function isCombinedView(view: any): view is CombinedView {
  return view instanceof CombinedView;
}