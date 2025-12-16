import Bounds from "@/core/graph/base/Bounds";
import Rectangle from "@/core/graph/combined/Polygon/Rectangle";
import Style from "@/core/style/Style";
import { Point3, Vector3 } from "@/core/math";
import { Action, Cursor, cursorMap, ExtraData } from "./InteractionMapBuilder";
import { Circle, Line } from "@/index.backend";

/**
 * 边界框插件
 * 定义视图的边界框，包含padding和margin属性
 * 位置由view的matrix决定，不包含独立的x,y属性
 */
export interface BoundingBoxAddon {
  region: Rectangle;
  handles: Rectangle[];
  rotate: [Line, Circle];
  getBounds(): { x: number; y: number; width: number; height: number };
}

export default class BoundingBoxAddonImpl implements BoundingBoxAddon {
  public region: Rectangle;
  public handles: Rectangle[];
  public rotate: [Line, Circle];

  // 基础参数（用于推导 region）
  private width: number;
  private height: number;
  private padding: { top: number; right: number; bottom: number; left: number };
  private margin: { top: number; right: number; bottom: number; left: number };
  private handleSize: number = 8;

  constructor(
    width: number = 0,
    height: number = 0,
    padding: { top: number; right: number; bottom: number; left: number } = {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
    margin: { top: number; right: number; bottom: number; left: number } = {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    }
  ) {
    this.width = width;
    this.height = height;
    this.padding = { ...padding };
    this.margin = { ...margin };
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

    const handleStyle = new Style().setStrokeWidth(1);
    return points.map((p) => new Rectangle(p.x - half, p.y - half, size, size, handleStyle));
  }

  private createRotate(): [Line, Circle] {
    const center = this.region.getCenter();
    const halfHeight = this.region.getBounds().height / 2;
    const line = new Line(
      new Point3(center.x, center.y - halfHeight, 0),
      new Point3(center.x, center.y - halfHeight - 15, 0),
      new Style().setStrokeWidth(1)
    );
    const circle = new Circle(new Point3(center.x, center.y - halfHeight - 20, 0), 5, new Style().setStrokeWidth(1));
    return [line, circle];
  }

  private computeRegion(): Rectangle {
    // region 仅包含内容与 padding，不包含 margin
    const x = -this.padding.left;
    const y = -this.padding.top;
    const w = this.width + this.padding.left + this.padding.right;
    const h = this.height + this.padding.top + this.padding.bottom;
    return new Rectangle(x, y, w, h);
  }

  public setSize(width: number, height: number): BoundingBoxAddonImpl {
    this.width = width;
    this.height = height;
    this.region = this.computeRegion();
    this.handles = this.createHandles(this.region);
    return this;
  }

  public setPadding(top: number, right: number, bottom: number, left: number): BoundingBoxAddonImpl {
    this.padding = { top, right, bottom, left };
    this.region = this.computeRegion();
    this.handles = this.createHandles(this.region);
    return this;
  }

  public setMargin(top: number, right: number, bottom: number, left: number): BoundingBoxAddonImpl {
    this.margin = { top, right, bottom, left };
    this.region = this.computeRegion();
    this.handles = this.createHandles(this.region);
    return this;
  }

  /**
   * 获取边界框（内容大小 + 内边距）
   * 相对定位：左上角 = -paddingLeft, -paddingTop
   */
  getBounds(): Bounds {
    const tl = this.region.getTopLeft();
    return new Bounds(tl.x, tl.y, this.region.width, this.region.height);
  }

  /**
   * 在给定的上下文中渲染边界框
   */
  render(ctx: CanvasRenderingContext2D): void {
    const bounds = this.getBounds();
    if (!bounds) return;
    ctx.save();
    try {
      ctx.strokeStyle = "#00ff00";
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
      ctx.stroke();

      ctx.fillStyle = "#00ff00";
      this.handles.forEach((h) => {
        const tl = h.getTopLeft();
        ctx.fillRect(tl.x, tl.y, h.width, h.height);
      });
      this.rotate.forEach((r) => {
        r.render(ctx);
      });
    } finally {
      ctx.restore();
    }
  }

  /**
   * 复制边界框插件
   */
  copy(): BoundingBoxAddonImpl {
    return new BoundingBoxAddonImpl(this.width, this.height, { ...this.padding }, { ...this.margin });
  }

  /**
   * 交互接口
   */
  interact(p: Point3): ExtraData | null {
    const isMoving = this.region.isPointOnCurve(p, 5) || this.rotate[0].isPointOnCurve(p, 5);
    const isRotate = this.rotate[1].isPointOnCurve(p, 2) || this.rotate[1].isPointInPath(p);
    const handler = this.handles.find((rec) => rec.isPointInPath(p) || rec.isPointOnCurve(p, 2));

    if (isRotate) {
      return {
        cursorStyle: Cursor.Grab,
        action: Action.ROTATE,
      };
    } else if (handler) {
      const dynamicIndex = this.handles.findIndex((h) => h === handler);
      const fixedIndex = (dynamicIndex + 4) % 8;
      const fixed = this.handles[fixedIndex];
      return {
        cursorStyle: cursorMap[dynamicIndex] || Cursor.Default,
        action: Action.RESIZE,
        resizeFixedPoint: fixed.getCenter(),
        resizeDynamicPoint: handler.getCenter(),
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

export function isBoundingBoxAddon(addon: any): addon is BoundingBoxAddonImpl {
  return addon instanceof BoundingBoxAddonImpl;
}