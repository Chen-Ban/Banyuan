import View, { ViewOptions, ViewContent } from "../View";
import { ImageElement } from "../../graph/media";
import { Point3, Vector3 } from "../../math";
import { InteractionMapBuilder, ViewAddonImpl } from "../addon";
import { Action, Cursor, ExtraData } from "../addon/InteractionMapBuilder";
import Bounds from "@/core/graph/base/Bounds";

// 图像视图选项接口
export interface ImageViewOptions extends Omit<ViewOptions, "content"> {
  // 图像视图特有的选项可以在这里添加
}

/**
 * 图像视图 - 专门处理ImageElement类型内容
 */
export default class ImageView extends View {
  public content: [ImageElement];
  public children: View<any>[] = [];

  constructor(image: ImageElement, options: ImageViewOptions = {}) {
    // 将image作为content传递给父类构造函数
    super({ ...options, content: [image] });
    this.content = [image];
    this.initBoundingBox()
    this.initViewport()
  }

  public renderContent(ctx: CanvasRenderingContext2D): void {
    if (this.content && typeof this.content[0].render === "function") {
      this.content[0].render(ctx);
    }
  }

  public getContentBounds():Bounds {
    if (this.content ) {
      return this.content[0].bounds.copy();
    }
    return Bounds.empty()
  }

  public interact(p: Point3): {
    view: View | null;
    content: ViewContent | ViewAddonImpl | null;
    extraData: ExtraData | null;
  } {
    const builder = new InteractionMapBuilder();
    return builder
      .add(this, this.content, {
        cursorStyle: Cursor.Default,
        action: Action.NONE,
      })
      .build();
  }
  public resize(fixedIndex: number, dynamicIndex: number, vector: Vector3) {
    const fixedPoint = this.boundingBox?.handles[fixedIndex].getCenter();
    const dynamicPoint = this.boundingBox?.handles[dynamicIndex].getCenter();
    if (!fixedPoint || !dynamicPoint) throw new Error("固定点或动态点不存在");
    // this.content[0].resize(fixedPoint, dynamicPoint, vector);
    this.initBoundingBox();
  }

  public copy(): ImageView {
    const newView = new ImageView(this.content[0]);

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

export function isImageView(view: any): view is ImageView {
  return view instanceof ImageView;
}
