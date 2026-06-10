import Bounds from "@/graph/base/Bounds";
import Rectangle from "@/graph/combined/Polygon/Rectangle";
import Style from "@/foundation/style/Style";
import { Point3, Vector3 } from "@/foundation/math";
import type { ExtraData, IBoundingBoxAddon } from "@/types";
import { AddonType, Action, AddonCapability, Cursor, cursorMap } from "@/foundation/constants";
import { Circle, Line } from "@/graph";
import { Color, FillStyle, StrokeStyle } from "@/foundation/style";

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

/**
 * 包围盒插件 —— 选中态交互控件
 *
 * 职责：RENDER + INTERACT + LOGIC
 * - RENDER：选中时渲染边框、8 个缩放手柄、旋转控件
 * - INTERACT：选中时检测手柄/边框/旋转控件的命中
 * - LOGIC：多选 resize 时仅提供几何数据（handles 坐标），不渲染不交互
 *
 * 优先级：0（默认，最先执行）
 */
export default class BoundingBoxAddon implements IBoundingBoxAddon {
  public readonly type = AddonType.BOUNDING_BOX;
  public capabilities = [
    AddonCapability.RENDER,
    AddonCapability.INTERACT,
    AddonCapability.LOGIC,
  ];
  public readonly priority = 0;
  public region: Rectangle;
  public handles: Rectangle[];
  public rotate: [Line, Circle];

  // 基础参数（用于推导 region）
  private viewport: Bounds;
  private handleSize: number = 8;

  // 渲染样式
  private regionStyle: Style;
  private handleStyle: Style;
  private lineStyle: Style;
  private circleStyle: Style;

  constructor(viewport: Bounds) {
    this.viewport = viewport;
    this.regionStyle = new Style({
      // 透明填充：避免 Style 默认白色 fillStyle 覆盖内容区域
      fillStyle: FillStyle.fromRGBA(0, 0, 0, 0),
      strokeStyle: new StrokeStyle({
        strokeType: "color",
        color: THEME.primaryLight,
        width: 1,
      }),
    });
    this.handleStyle = new Style()
      .setStrokeWidth(1.5)
      .setFillColor(THEME.handleFill)
      .setStrokeColor(THEME.handleStroke);
    this.lineStyle = new Style({
      strokeStyle: new StrokeStyle({
        strokeType: "color",
        color: THEME.rotateLine,
        width: 1,
      }),
    });
    this.circleStyle = new Style()
      .setStrokeWidth(1.5)
      .setFillColor(THEME.rotateFill)
      .setStrokeColor(THEME.rotateStroke);
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

    return points.map((p) => new Rectangle(p.x - half, p.y - half, size, size));
  }

  private createRotate(): [Line, Circle] {
    const center = this.region.getCenter();
    // "上方"方向由视口高度的符号决定：height > 0 向下拓展，上方为 -y；height < 0 向上拓展，上方为 +y
    const up = new Vector3(0, -Math.sign(this.viewport.height), 0);
    const startPoint = center.add(up.scale(Math.abs(this.region.height) / 2));
    const endPoint = startPoint.add(up.scale(15));
    const circleCenter = startPoint.add(up.scale(20));
    const line = new Line(startPoint, endPoint);
    const circle = new Circle(circleCenter, 5);
    return [line, circle];
  }

  private computeRegion(): Rectangle {
    return Rectangle.fromBounds(this.viewport.copy());
  }

  public updateSize(): BoundingBoxAddon {
    this.region = this.computeRegion();
    this.handles = this.createHandles(this.region);
    this.rotate = this.createRotate();
    return this;
  }

  /**
   * 更新内部 viewport 引用并重建所有几何图形。
   * 用于 viewport 对象整体替换的场景（如 needStructViewport 扩展视口后），
   * 避免重新创建 BoundingBoxAddon 实例。
   */
  public updateViewport(viewport: Bounds): BoundingBoxAddon {
    this.viewport = viewport;
    return this.updateSize();
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
      this.region.render(ctx, this.regionStyle);
      this.handles.forEach((h) => h.render(ctx, this.handleStyle));
      this.rotate[0].render(ctx, this.lineStyle);
      this.rotate[1].render(ctx, this.circleStyle);
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
  interact(p: Point3, bufferCtx?: CanvasRenderingContext2D): ExtraData | null {
    const isMoving =
      this.region.isPointOnCurve(p, 5) || this.rotate[0].isPointOnCurve(p, 5);
    const isRotate =
      this.rotate[1].isPointOnCurve(p, 2) ||
      this.rotate[1].isPointInPath(p, bufferCtx);
    const handler = this.handles.find(
      (rec) => rec.isPointInPath(p, bufferCtx) || rec.isPointOnCurve(p, 5),
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
