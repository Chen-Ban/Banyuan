import View, { ViewOptions, ViewContent } from "../View";
import { ImageElement } from "../../graph/media";
import { Point3 } from "../../math";
import { InteractionMapBuilder, ViewAddonImpl } from "../addon";
import { Action, Cursor, ExtraData } from "../addon/InteractionMapBuilder";

// 图像视图选项接口
export interface ImageViewOptions extends Omit<ViewOptions, "content"> {
  // 图像视图特有的选项可以在这里添加
}

/**
 * 图像视图 - 专门处理ImageElement类型内容
 */
export default class ImageView extends View {
  public content: ImageElement;
  public children: View<any>[] = [];

  constructor(image: ImageElement, options: ImageViewOptions = {}) {
    // 将image作为content传递给父类构造函数
    super({ ...options, content: image });
    this.content = image;
  }

  public renderContent(ctx: CanvasRenderingContext2D): void {
    if (this.content && typeof this.content.render === "function") {
      this.content.render(ctx);
    }
  }

  public getContentBounds(): {
    x: number;
    y: number;
    width: number;
    height: number;
  } {
    if (this.content && typeof this.content.getBounds === "function") {
      return this.content.getBounds();
    }
    return { x: 0, y: 0, width: 0, height: 0 };
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

  public copy(): ImageView {
    const newView = new ImageView(this.content);

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
