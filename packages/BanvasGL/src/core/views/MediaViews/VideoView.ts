import View, { ViewContent, ViewOptions } from "../View";
import { VideoElement } from "../../graph/media";
import CanvasContext from "../../renderer/CanvasContext";
import { Point3, Vector3 } from "../../math";
import { InteractionMapBuilder, ViewAddonImpl } from "../addon";
import { ExtraData } from "../addon/InteractionMapBuilder";
import Bounds from "@/core/graph/base/Bounds";

// 视频视图选项接口
export interface VideoViewOptions extends Omit<ViewOptions, "content"> {
  // 视频视图特有的选项可以在这里添加
}

/**
 * 视频视图 - 专门处理VideoElement类型内容
 */
export default class VideoView extends View {
  public content: [VideoElement];
  public children: View<any>[] = [];

  constructor(video: VideoElement, options: VideoViewOptions = {}) {
    // 将video作为content传递给父类构造函数
    super({ ...options, content: [video] });
    this.content = [video];
    this.initBoundingBox()
    this.initViewport()
  }

  public renderContent(ctx: CanvasRenderingContext2D): void {
    if (this.content && typeof this.content[0].render === "function") {
      this.content[0].render(ctx);
    }
  }

  public getContentBounds(): Bounds {
    if (this.content) {
      return this.content[0].bounds;
    }
    return Bounds.empty()
  }

  public interact(p: Point3): {
    view: View | null;
    content: ViewContent | ViewAddonImpl | null;
    extraData: ExtraData | null;
  } {
    return new InteractionMapBuilder().build();
  }

  public resize(fixedIndex: number, dynamicIndex: number, vector: Vector3) {
    const fixedPoint = this.boundingBox?.handles[fixedIndex].getCenter();
    const dynamicPoint = this.boundingBox?.handles[dynamicIndex].getCenter();
    if (!fixedPoint || !dynamicPoint) throw new Error("固定点或动态点不存在");
    // this.content[0].resize(fixedPoint, dynamicPoint, vector);
    this.initBoundingBox();
  }

  public copy(): VideoView {
    const newView = new VideoView(this.content[0]);

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

export function isVideoView(view: any): view is VideoView {
  return view instanceof VideoView;
}
