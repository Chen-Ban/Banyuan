import View, { ViewContent, ViewOptions } from "../View/View";
import { VideoElement } from "../../graph/media";
import CanvasContext from "../../renderer/CanvasContext";
import { Point3, Vector3 } from "../../math";
import { InteractionMapBuilder, ViewAddonImpl } from "../addon";
import { ExtraData } from "../View/InteractionMapBuilder";
import Bounds from "@/core/graph/base/Bounds";
import { VIEWTYPE } from "@/index.backend";

// 视频视图选项接口
export interface VideoViewOptions extends Omit<ViewOptions, "content"> {
  // 视频视图特有的选项可以在这里添加
}

/**
 * 视频视图 - 专门处理VideoElement类型内容
 */
export default class VideoView extends View {
  public type: VIEWTYPE = VIEWTYPE.VIDEOVIEW;
  public content: [VideoElement];
  public children: View<any>[] = [];

  constructor(video: VideoElement, options: VideoViewOptions = {}) {
    // 将video作为content传递给父类构造函数
    super({ ...options, content: [video] });
    this.content = [video];
  }

  public renderContent(ctx: CanvasRenderingContext2D): void {
    this.content.forEach(graph => graph.render(ctx))
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

  public resize(fixedPoint: Point3, dynamicPoint: Point3, vector: Vector3) {
    this.content[0].resize(fixedPoint, dynamicPoint, vector);
    const referenceVector = dynamicPoint.subtract(fixedPoint)
    if (referenceVector.x < 0) {
      this.matrix.translate(vector.x, 0, 0)
    }
    if (referenceVector.y < 0) {
      this.matrix.translate(0, vector.y, 0)
    }
  }

  public copy(): VideoView {
    const newView = new VideoView(this.content[0]);

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
