import { GRAPHTYPE } from "@/constants";
import Style from "@/core/style/Style";
import { Point3 } from "@/core/math";
import Bounds from "./Bounds";
import { v4 as uuid } from "uuid";

export default abstract class Graph {
  public id: string;
  public abstract type: GRAPHTYPE;
  public abstract controlPoints: Point3[] | Float32Array;
  public abstract style: Style;

  // 私有包围盒缓存
  private _bounds: Bounds | null = null;

  public abstract renderPath(
    ctx: CanvasRenderingContext2D,
    dependent: Boolean
  ): void;
  public abstract render(ctx: CanvasRenderingContext2D): void;
  public abstract copy(): this;
  protected abstract calculateBounds(): Bounds;

  constructor() {
    this.id = uuid();
  }

  public isPointInPath(ctx: CanvasRenderingContext2D, p: Point3): Boolean {
    ctx.save();
    this.renderPath(ctx, true);
    const isIn = ctx.isPointInPath(p.x, p.y, "nonzero");
    ctx.strokeStyle = "#F00";
    ctx.stroke();
    ctx.restore();
    return isIn;
  }

  /**
   * 获取包围盒（带缓存机制）
   */
  public getBounds(): Bounds {
    if (this._bounds) return this._bounds;
    return this.calculateBounds();
  }

  /**
   * 设置边界框（供子类在构造函数中使用）
   */
  protected setBounds(bounds: Bounds): void {
    this._bounds = bounds;
  }
}
