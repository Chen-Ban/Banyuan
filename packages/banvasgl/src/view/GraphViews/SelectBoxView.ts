import GraphView from "./index";
import { Rectangle } from "@/graph";
import { ViewType } from "@/foundation/constants";
import { generateId, generateName } from "@/foundation/utils";
import { Point3 } from "@/foundation/math";
import { Color, FillStyle, StrokeStyle, Style } from "@/foundation/style";
import type { ISelectBoxView } from '@/types/view/view'
import type { ISelectBoxViewOptions } from '@/types/view/view'
import type { IDrawingContext } from '@/types/platform/drawing.js'
import type { IGradient } from '@/types/foundation/gradient.js'
import type { IPattern } from '@/types/foundation/pattern.js';
/**
 * 框选视图 - 专门用于矩形框选操作
 * 继承自 GraphView，但具有特殊的类型标识，不参与交互
 */

/** SelectBox 专用渲染样式（框选矩形） */
const SELECTION_STYLE = new Style({
  fillStyle: FillStyle.fromRGBA(0, 0, 144, 0.1),
  strokeStyle: StrokeStyle.dashed(new Color(100, 150, 255, 0.8), 1, [5, 5]),
});

export default class SelectBoxView extends GraphView implements ISelectBoxView {
  public type: ViewType = ViewType.SELECTBOXVIEW;
  declare public content: Rectangle;

  constructor(options: ISelectBoxViewOptions = {}) {
    const selectionRect = new Rectangle(0, 0, 0, 0);

    super(selectionRect, options);

    this.id = options.id || generateId(this.type);
    this.name = options.name || generateName(this.type);
    // 框选视图不应该被激活或选中
    this.actived = false;
    this.selected = false;
    this.freezed = true; // 冻结框选视图，防止被操作
  }

  /**
   * 重写渲染内容，使用 SelectBox 专用样式
   */
  public override renderContent(ctx: IDrawingContext): void {
    this.content?.render(ctx, SELECTION_STYLE);
  }

  /**
   * 框选视图不参与交互
   */
  public interact(): {
    view: null;
    content: null;
    extraData: null;
  } {
    return {
      view: null,
      content: null,
      extraData: null,
    };
  }

  /**
   * 更新框选矩形的尺寸
   * @param dynamicWorldPoint 当前鼠标位置（世界坐标 = canvas 物理像素坐标）
   *
   * SelectBoxView.matrix 的平移分量编码了锚点（mouseDown 落点）的世界坐标，
   * 矩形的左上角固定为本地坐标 (0, 0)。
   * 将 dynamicWorldPoint 变换到本地坐标系后，得到相对锚点的偏移量，
   * 即为矩形的宽高（取绝对值支持四方向拖拽）。
   * 不需要调用 setPosition，位置已由 matrix 平移分量确定。
   */
  public updateSelect(dynamicWorldPoint: Point3): void {
    // 世界点 → 本地坐标（相对锚点的偏移，可为负）
    const local = this.getMVPMatrix().inverse().multiply(dynamicWorldPoint);
    const rectGraph = this.content as Rectangle;
    rectGraph.setSize(local.x, local.y);
  }

  public copy(): SelectBoxView {
    const newView = new SelectBoxView();

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

    // 复制内容（矩形）
    const rectGraph = this.content as Rectangle;
    const newRectGraph = newView.content as Rectangle;
    const topLeft = rectGraph.getTopLeft();
    newRectGraph.setPosition(topLeft.x, topLeft.y);
    newRectGraph.setSize(rectGraph.width, rectGraph.height);

    // 复制插件
    if (this.viewport) {
      newView.viewport = this.viewport.copy();
    }
    if (this.boundingBox) {
      newView.boundingBox = this.boundingBox.copy();
    }
    if (this.decoration) {
      newView.decoration = this.decoration.copy();
    }

    return newView;
  }
}
