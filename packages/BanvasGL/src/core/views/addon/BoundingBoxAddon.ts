import Bounds from "@/core/graph/base/Bounds";
import Rectangle from "@/core/graph/combined/Polygon/Rectangle";
import Style from "@/core/style/Style";
import { Point3, Vector3 } from "@/core/math";
import {
  Action,
  Cursor,
  cursorMap,
  ExtraData,
  IBoundingBoxAddon,
} from "@/core/interfaces";
import { ADDONTYPE } from "@/core/constants";
import { Circle, Line } from "@/core/graph";
import { Color, FillStyle, StrokeStyle } from "@/core/style";

/**
 * 主题色常量（PPT 风格）
 */
const THEME = {
  /** 主色调：柔和蓝 */
  primary: new Color(74, 144, 217, 1),
  /** 主色调半透明（用于边框） */
  primaryLight: new Color(74, 144, 217, 0.6),
  /** 手柄填充：白色 */
  handleFill: new Color(255, 255, 255, 1),
  /** 手柄描边：主色调 */
  handleStroke: new Color(74, 144, 217, 1),
  /** 旋转手柄填充：浅绿 */
  rotateFill: new Color(255, 255, 255, 1),
  /** 旋转手柄描边：绿色 */
  rotateStroke: new Color(76, 175, 80, 1),
  /** 旋转连接线颜色 */
  rotateLine: new Color(76, 175, 80, 0.8),
} as const;

export default class BoundingBoxAddon implements IBoundingBoxAddon {
  public readonly type = ADDONTYPE.BOUNDING_BOX;
  public region: Rectangle;
  public handles: Rectangle[];
  public rotate: [Line, Circle];

  // 基础参数（用于推导 region）
  private viewport: Bounds;
  private handleSize: number = 8;

  constructor(viewport: Bounds) {
    this.viewport = viewport;
    this.region = this.computeRegion();
    this.handles = this.createHandles(this.region);
    this.rotate = this.createRotate();
  }

  private createHandles(region: Rectangle): Rectangle[] {
    const size = this.handleSize;
    const half = size / 2;
    const topLeft = region.getTopLeft();
    const width = region.width;
    const height = region.height;

    const points: Point3[] = [
      new Point3(topLeft.x, topLeft.y, 0),
      new Point3(topLeft.x + width / 2, topLeft.y, 0),
      new Point3(topLeft.x + width, topLeft.y, 0),
      new Point3(topLeft.x + width, topLeft.y + height / 2, 0),
      new Point3(topLeft.x + width, topLeft.y + height, 0),
      new Point3(topLeft.x + width / 2, topLeft.y + height, 0),
      new Point3(topLeft.x, topLeft.y + height, 0),
      new Point3(topLeft.x, topLeft.y + height / 2, 0),
    ];

    const handleStyle = new Style()
      .setStrokeWidth(1.5)
      .setFillColor(THEME.handleFill)
      .setStrokeColor(THEME.handleStroke);
    return points.map(
      (p) => new Rectangle(p.x - half, p.y - half, size, size, handleStyle),
    );
  }

  private createRotate(): [Line, Circle] {
    const center = this.region.getCenter();
    // "上方"方向由视口高度的符号决定：height > 0 向下拓展，上方为 -y；height < 0 向上拓展，上方为 +y
    const up = new Vector3(0, -Math.sign(this.viewport.height), 0);
    const startPoint = center.add(up.scale(Math.abs(this.region.height) / 2));
    const endPoint = startPoint.add(up.scale(15));
    const circleCenter = startPoint.add(up.scale(20));
    const lineStyle = new Style({
      strokeStyle: new StrokeStyle({
        strokeType: "color",
        color: THEME.rotateLine,
        width: 1,
      }),
    });
    const circleStyle = new Style()
      .setStrokeWidth(1.5)
      .setFillColor(THEME.rotateFill)
      .setStrokeColor(THEME.rotateStroke);
    const line = new Line(startPoint, endPoint, lineStyle);
    const circle = new Circle(circleCenter, 5, circleStyle);
    return [line, circle];
  }

  private computeRegion(): Rectangle {
    return Rectangle.fromBounds(
      this.viewport.copy(),
      new Style({
        fillStyle: new FillStyle({ fillType: "color", color: Color.TRANSPARENT }),
        strokeStyle: new StrokeStyle({
          strokeType: "color",
          color: THEME.primary,
          width: 1,
        }),
      }),
    );
  }

  public updateSize(): BoundingBoxAddon {
    this.region = this.computeRegion();
    this.handles = this.createHandles(this.region);
    this.rotate = this.createRotate();
    return this;
  }

  /**
   * 获取边界框
   */
  getBounds(): Bounds {
    return this.region?.bounds ?? Bounds.empty();
  }

  /**
   * 在给定的上下文中渲染边界框
   */
  render(ctx: CanvasRenderingContext2D): void {
    const bounds = this.getBounds();
    if (!bounds) return;
    ctx.save();
    try {
      this.region.render(ctx);
      this.handles.forEach((h) => h.render(ctx));
      this.rotate.forEach((r) => r.render(ctx));
    } finally {
      ctx.restore();
    }
  }

  /**
   * 复制边界框插件
   */
  copy(): BoundingBoxAddon {
    const boudingBox = new BoundingBoxAddon(this.viewport);
    boudingBox.region = this.region.copy();
    boudingBox.rotate = this.rotate.map((grph) => grph.copy()) as [
      Line,
      Circle,
    ];
    boudingBox.handles = this.handles.map((graph) => graph.copy());
    return boudingBox;
  }
  /**
   * 交互接口
   */
  interact(p: Point3): ExtraData | null {
    const isMoving =
      this.region.isPointOnCurve(p, 5) || this.rotate[0].isPointOnCurve(p, 5);
    const isRotate =
      this.rotate[1].isPointOnCurve(p, 2) || this.rotate[1].isPointInPath(p);
    const handler = this.handles.find(
      (rec) => rec.isPointInPath(p) || rec.isPointOnCurve(p, 5),
    );

    if (isRotate) {
      return {
        cursorStyle: Cursor.Grab,
        action: Action.ROTATE,
      };
    } else if (handler) {
      const dynamicIndex = this.handles.findIndex((h) => h === handler);
      const fixedIndex = (dynamicIndex + 4) % 8;
      return {
        cursorStyle: cursorMap[dynamicIndex] || Cursor.Default,
        action: Action.RESIZE,
        resizeFixedIndex: fixedIndex,
        resizeDynamicIndex: dynamicIndex,
      };
    }
    if (isMoving) {
      return {
        cursorStyle: Cursor.Move,
        action: Action.MOVE,
      };
    }
    return null;
  }
}
