import { GraphType } from "@/foundation/constants";
import Style from "@/foundation/style/Style";
import { Point3, Vector3 } from "@/foundation/math";
import CombinedGraph from "@/graph/combined/CombinedGraph";
import Line from "@/graph/analytic/Line";
import Arc from "@/graph/analytic/Arc";
import { IRoundedRect, ISerializable } from "@/types";
import { generateId } from "@/foundation/utils";

/**
 * 圆角矩形 —— 由 4 段弧 + 4 段直线拼接而成的组合图形。
 *
 * RoundedRect 继承自 {@link CombinedGraph}，实现了 {@link IRoundedRect} 和 {@link ISerializable} 接口，
 * 是 BanvasGL 中圆角矩形的唯一实现。
 *
 * **架构位置**：位于 `graph/combined` 层，与 Polygon、Rectangle 等同属组合图形家族，
 * 但因内部由 Arc + Line 构成而非纯 Line，故直接继承 CombinedGraph 而非 Polygon。
 *
 * **内部结构**：
 * - 8 段子图形（顺时针，从左上角切点出发）：
 *   Arc(左上) → Line(上边) → Arc(右上) → Line(右边)
 *   → Arc(右下) → Line(下边) → Arc(左下) → Line(左边)
 * - 每个角的圆角半径独立可控，通过 `radii` 四元组 `[左上, 右上, 右下, 左下]` 管理
 * - 圆角半径自动受限于相邻两边长度的一半，两角半径之和不超过对应边长
 *
 * **控制点体系**（共 12 个）：
 * - 尺寸控制点（8 个，顺序同 BoundingBox）：
 *   index 0=左上角, 1=上边中点, 2=右上角, 3=右边中点, 4=右下角, 5=下边中点, 6=左下角, 7=左边中点
 * - 圆角控制点（4 个）：
 *   index 8=左上圆角切点, 9=右上圆角切点, 10=右下圆角切点, 11=左下圆角切点
 *
 * **交互逻辑**：
 * - 拖拽角点（0,2,4,6）：改变宽高（以对角为锚点）
 * - 拖拽边中点（1,3,5,7）：改变单轴尺寸
 * - 拖拽圆角点（8-11）：改变对应角的圆角半径
 *
 * @example
 * ```ts
 * // 创建四角等圆角的圆角矩形
 * const rr = new RoundedRect(10, 20, 200, 100, 15, style);
 *
 * // 创建四角不同圆角的圆角矩形
 * const rr2 = new RoundedRect(0, 0, 300, 150, [10, 20, 10, 20], style);
 * ```
 */
export default class RoundedRect
  extends CombinedGraph
  implements IRoundedRect, ISerializable
{
  /** 图形类型标识 */
  public type: GraphType = GraphType.ROUNDED_RECT;

  /** 矩形左上角 x 坐标 */
  public x: number;

  /** 矩形左上角 y 坐标 */
  public y: number;

  /** 矩形宽度 */
  public width: number;

  /** 矩形高度 */
  public height: number;

  /**
   * 四角圆角半径，顺序为 [左上, 右上, 右下, 左下]。
   * 每个值受限于相邻两边长度的一半，且两角之和不超过对应边长。
   */
  public radii: [number, number, number, number];

  /**
   * 创建一个圆角矩形实例。
   *
   * @param {number} x - 左上角 x 坐标
   * @param {number} y - 左上角 y 坐标
   * @param {number} width - 宽度，自动 clamp 到 ≥ 0
   * @param {number} height - 高度，自动 clamp 到 ≥ 0
   * @param {[number, number, number, number] | number} [radii=0] - 圆角半径，
   *   传入数字时四角统一，传入四元组时各角独立
   * @param {Style} [style] - 图形样式
   *
   * @example
   * ```ts
   * // 四角统一圆角
   * const rr1 = new RoundedRect(0, 0, 200, 100, 15, style);
   * // 各角独立圆角
   * const rr2 = new RoundedRect(0, 0, 200, 100, [5, 10, 15, 20], style);
   * ```
   */
  constructor(
    x: number,
    y: number,
    width: number,
    height: number,
    radii: [number, number, number, number] | number = 0,
    _style?: Style,
  ) {
    super([], undefined);
    this.x = x;
    this.y = y;
    this.width = Math.max(0, width);
    this.height = Math.max(0, height);

    const r =
      typeof radii === "number"
        ? ([radii, radii, radii, radii] as [number, number, number, number])
        : radii;
    this.radii = this.clampRadii(r);

    this.rebuildEdges();
    this.id = generateId(this.type);
  }

  // ─────────────────────────────────────────────
  //  IRoundedRect 接口方法
  // ─────────────────────────────────────────────

  /**
   * 设置圆角矩形的位置（左上角坐标）。
   *
   * @param {number} x - 新的左上角 x 坐标
   * @param {number} y - 新的左上角 y 坐标
   * @returns {RoundedRect} 当前实例（支持链式调用）
   *
   * @example
   * ```ts
   * rr.setPosition(50, 30);
   * ```
   */
  public setPosition(x: number, y: number): RoundedRect {
    this.x = x;
    this.y = y;
    this.rebuildEdges();
    return this;
  }

  /**
   * 设置圆角矩形的尺寸。
   * 宽高自动 clamp 到 ≥ 0，圆角半径会根据新尺寸自动调整。
   *
   * @param {number} width - 新的宽度
   * @param {number} height - 新的高度
   * @returns {RoundedRect} 当前实例（支持链式调用）
   *
   * @example
   * ```ts
   * rr.setSize(300, 200);
   * ```
   */
  public setSize(width: number, height: number): RoundedRect {
    this.width = Math.max(0, width);
    this.height = Math.max(0, height);
    this.radii = this.clampRadii(this.radii);
    this.rebuildEdges();
    return this;
  }

  /**
   * 设置指定角的圆角半径。
   * 半径自动 clamp 到 ≥ 0，并受限于相邻两边。
   *
   * @param {0 | 1 | 2 | 3} index - 角索引（0=左上, 1=右上, 2=右下, 3=左下）
   * @param {number} radius - 新的圆角半径
   * @returns {RoundedRect} 当前实例（支持链式调用）
   *
   * @example
   * ```ts
   * rr.setRadius(0, 20);  // 左上角圆角设为 20
   * rr.setRadius(2, 10);  // 右下角圆角设为 10
   * ```
   */
  public setRadius(index: 0 | 1 | 2 | 3, radius: number): RoundedRect {
    this.radii[index] = Math.max(0, radius);
    this.radii = this.clampRadii(this.radii);
    this.rebuildEdges();
    return this;
  }

  /**
   * 统一设置四角的圆角半径。
   * 半径自动 clamp 并受限于相邻两边。
   *
   * @param {number} radius - 统一的圆角半径
   * @returns {RoundedRect} 当前实例（支持链式调用）
   *
   * @example
   * ```ts
   * rr.setAllRadii(15);  // 四角统一圆角 15
   * ```
   */
  public setAllRadii(radius: number): RoundedRect {
    const r = Math.max(0, radius);
    this.radii = this.clampRadii([r, r, r, r]);
    this.rebuildEdges();
    return this;
  }

  /**
   * 获取圆角矩形的几何中心点。
   *
   * @returns {Point3} 中心点坐标
   *
   * @example
   * ```ts
   * const center = rr.getCenter();
   * ```
   */
  public getCenter(): Point3 {
    return new Point3(this.x + this.width / 2, this.y + this.height / 2, 0);
  }

  /**
   * 获取圆角矩形的质心（几何中心）。
   *
   * 优化实现：直接基于 x/y/width/height 计算中心点，
   * 避免遍历子图形（arc + line）做 midpoint 累加。
   *
   * @returns {Point3} 质心坐标，与 `getCenter()` 结果一致
   *
   * @example
   * ```ts
   * const centroid = rr.getCentroid();
   * ```
   */
  public getCentroid(): Point3 {
    return this.getCenter();
  }

  // ─────────────────────────────────────────────
  //  控制点
  // ─────────────────────────────────────────────

  /**
   * 同步控制点，返回 12 个控制点（8 个尺寸控制点 + 4 个圆角控制点）。
   *
   * 尺寸控制点（8 个，顺序同 BoundingBox）：
   *   index 0 = 左上角点  (x,       y)
   *   index 1 = 上边中点  (x+w/2,   y)
   *   index 2 = 右上角点  (x+w,     y)
   *   index 3 = 右边中点  (x+w,   y+h/2)
   *   index 4 = 右下角点  (x+w,   y+h)
   *   index 5 = 下边中点  (x+w/2, y+h)
   *   index 6 = 左下角点  (x,     y+h)
   *   index 7 = 左边中点  (x,     y+h/2)
   *
   * 圆角控制点（4 个）：
   *   index 8  = 左上圆角切点（上边切点，位于左上角右侧 r[0] 处）
   *   index 9  = 右上圆角切点（上边切点，位于右上角左侧 r[1] 处）
   *   index 10 = 右下圆角切点（下边切点，位于右下角左侧 r[2] 处）
   *   index 11 = 左下圆角切点（下边切点，位于左下角右侧 r[3] 处）
   *
   * 拖拽角点（0,2,4,6）：改变宽高（以对角为锚点）
   * 拖拽边中点（1,3,5,7）：只改变单轴尺寸
   * 拖拽圆角点（8-11）：改变对应角的圆角半径
   *
   * @example
   * ```ts
   * rr.syncControlPoints();
   * console.log(rr.controlPoints.length); // 12
   * ```
   */
  public override syncControlPoints(): void {
    if (!this.radii) return;
    const { x, y, width: w, height: h } = this;
    const [rtl, rtr, rbr, rbl] = this.radii;

    this.controlPoints = [
      // 尺寸控制点（8 个，顺时针从左上开始）
      new Point3(x, y, 0), // 0 左上角
      new Point3(x + w / 2, y, 0), // 1 上边中点
      new Point3(x + w, y, 0), // 2 右上角
      new Point3(x + w, y + h / 2, 0), // 3 右边中点
      new Point3(x + w, y + h, 0), // 4 右下角
      new Point3(x + w / 2, y + h, 0), // 5 下边中点
      new Point3(x, y + h, 0), // 6 左下角
      new Point3(x, y + h / 2, 0), // 7 左边中点
      // 圆角控制点（4 个）
      new Point3(x + rtl, y, 0), // 8  左上圆角（上边切点）
      new Point3(x + w - rtr, y, 0), // 9  右上圆角（上边切点）
      new Point3(x + w - rbr, y + h, 0), // 10 右下圆角（下边切点）
      new Point3(x + rbl, y + h, 0), // 11 左下圆角（下边切点）
    ];
  }

  /**
   * 设置指定索引的控制点，根据索引类型执行不同的交互逻辑：
   *
   * - index 0, 2, 4, 6（角点）：调整宽高，以对角点为锚点
   * - index 1, 3, 5, 7（边中点）：只调整单轴尺寸
   * - index 8-11（圆角切点）：调整对应角的圆角半径
   *
   * @param {number} index - 控制点索引（0-11）
   * @param {Point3} point - 新的控制点坐标
   *
   * @example
   * ```ts
   * // 拖拽右上角改变宽高
   * rr.setControlPoint(2, new Point3(250, 10, 0));
   * // 拖拽圆角控制点改变半径
   * rr.setControlPoint(8, new Point3(25, 0, 0));
   * ```
   */
  public setControlPoint(index: number, point: Point3): void {
    const { x, y, width: w, height: h } = this;

    if (index === 0) {
      // 左上角：右下角固定
      const newW = x + w - point.x;
      const newH = y + h - point.y;
      this.x = point.x;
      this.y = point.y;
      this.width = Math.max(0, newW);
      this.height = Math.max(0, newH);
    } else if (index === 1) {
      // 上边中点：只改 y 和 height，底边固定
      const newH = y + h - point.y;
      this.y = point.y;
      this.height = Math.max(0, newH);
    } else if (index === 2) {
      // 右上角：左下角固定
      const newW = point.x - x;
      const newH = y + h - point.y;
      this.y = point.y;
      this.width = Math.max(0, newW);
      this.height = Math.max(0, newH);
    } else if (index === 3) {
      // 右边中点：只改 width，左边固定
      this.width = Math.max(0, point.x - x);
    } else if (index === 4) {
      // 右下角：左上角固定
      this.width = Math.max(0, point.x - x);
      this.height = Math.max(0, point.y - y);
    } else if (index === 5) {
      // 下边中点：只改 height，顶边固定
      this.height = Math.max(0, point.y - y);
    } else if (index === 6) {
      // 左下角：右上角固定
      const newW = x + w - point.x;
      const newH = point.y - y;
      this.x = point.x;
      this.width = Math.max(0, newW);
      this.height = Math.max(0, newH);
    } else if (index === 7) {
      // 左边中点：只改 x 和 width，右边固定
      const newW = x + w - point.x;
      this.x = point.x;
      this.width = Math.max(0, newW);
    } else if (index >= 8 && index <= 11) {
      // 圆角控制点：限制最大半径为相邻两边中较短边的一半
      const maxRadius = Math.min(this.width, this.height) / 2;
      let r: number;

      if (index === 8) {
        // 左上圆角：水平距离 = 切点 x - 矩形左边
        r = point.x - this.x;
      } else if (index === 9) {
        // 右上圆角：水平距离 = 矩形右边 - 切点 x
        r = this.x + this.width - point.x;
      } else if (index === 10) {
        // 右下圆角：水平距离 = 矩形右边 - 切点 x
        r = this.x + this.width - point.x;
      } else {
        // 左下圆角：水平距离 = 切点 x - 矩形左边
        r = point.x - this.x;
      }

      // clamp: [0, maxRadius]
      r = Math.max(0, Math.min(r, maxRadius));
      this.radii[index - 8] = r;
    }

    this.radii = this.clampRadii(this.radii);
    this.rebuildEdges();
  }

  // ─────────────────────────────────────────────
  //  渲染
  // ─────────────────────────────────────────────

  /**
   * 渲染圆角矩形。
   *
   * 直接使用 Canvas API 绘制圆角矩形路径，比逐段子图形渲染更精确。
   * 应用样式后执行 fill 和 stroke。
   *
   * @param {CanvasRenderingContext2D} ctx - Canvas 2D 渲染上下文
   *
   * @example
   * ```ts
   * rr.render(ctx);
   * ```
   */
  public render(ctx: CanvasRenderingContext2D, style: Style): void {
    const bounds = this.bounds;
    ctx.save();
    style.applyToContext(ctx, Math.abs(bounds.width), Math.abs(bounds.height));
    ctx.beginPath();
    this.buildCanvasPath(ctx);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /**
   * 渲染圆角矩形的路径到 Canvas 上下文（不执行 fill/stroke）。
   *
   * @param {CanvasRenderingContext2D} ctx - Canvas 2D 渲染上下文
   * @param {Boolean} dependent - 是否依赖外部 `beginPath` 调用；为 `true` 时自动 `beginPath`
   *
   * @example
   * ```ts
   * rr.renderPath(ctx, true);
   * ctx.stroke();
   * ```
   */
  public renderPath(ctx: CanvasRenderingContext2D, dependent: Boolean): void {
    dependent && ctx.beginPath();
    this.buildCanvasPath(ctx);
    ctx.closePath();
  }

  // ─────────────────────────────────────────────
  //  resize（整体缩放）
  // ─────────────────────────────────────────────

  /**
   * 整体缩放圆角矩形。
   *
   * 根据固定点和动态点计算缩放比例，对位置、宽高和圆角半径进行等比缩放。
   * 圆角半径取两轴缩放比的最小值以保持视觉一致。
   *
   * @param {Point3} fixedPoint - 固定点（缩放锚点）
   * @param {Point3} dynamicPoint - 动态点（缩放参考点）
   * @param {Vector3} resizeVector - 缩放向量
   *
   * @example
   * ```ts
   * rr.resize(anchor, handle, dragVector);
   * ```
   */
  public resize(
    fixedPoint: Point3,
    dynamicPoint: Point3,
    resizeVector: Vector3,
  ): void {
    const referenceVector = dynamicPoint.subtract(fixedPoint);
    const w = Math.abs(referenceVector.x) || Infinity;
    const h = Math.abs(referenceVector.y) || Infinity;
    const scaleX = 1 + (resizeVector.x * Math.sign(referenceVector.x)) / w;
    const scaleY = 1 + (resizeVector.y * Math.sign(referenceVector.y)) / h;

    this.x *= scaleX;
    this.y *= scaleY;
    this.width = Math.max(0, this.width * scaleX);
    this.height = Math.max(0, this.height * scaleY);
    // 圆角半径等比缩放（取两轴最小缩放比，保持视觉一致）
    const scale = Math.min(Math.abs(scaleX), Math.abs(scaleY));
    this.radii = this.clampRadii(
      this.radii.map((r) => r * scale) as [number, number, number, number],
    );

    this.rebuildEdges();
  }

  // ─────────────────────────────────────────────
  //  序列化
  // ─────────────────────────────────────────────

  /**
   * 将圆角矩形序列化为 JSON 对象。
   *
   * @returns {any} 包含 id、type、x、y、width、height、radii、style 的 JSON 对象
   *
   * @example
   * ```ts
   * const json = rr.toJSON();
   * // json = { id: '...', type: GraphType.ROUNDED_RECT, x: 10, y: 20, width: 200, height: 100, radii: [15, 15, 15, 15], style: {...} }
   * ```
   */
  public toJSON(): any {
    return {
      id: this.id,
      type: this.type,
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      radii: [...this.radii],
    };
  }

  /**
   * 从 JSON 数据重建 RoundedRect 实例。
   *
   * @param {any} data - 序列化数据，需包含 x、y、width、height、radii、style
   * @returns {RoundedRect} 重建的圆角矩形实例
   *
   * @example
   * ```ts
   * const rr = RoundedRect.fromJSON({ id: '...', type: 0, x: 10, y: 20, width: 200, height: 100, radii: [15, 15, 15, 15], style: {...} });
   * ```
   */
  public static fromJSON(data: any): RoundedRect {
    const rr = new RoundedRect(
      data.x,
      data.y,
      data.width,
      data.height,
      data.radii as [number, number, number, number],
      undefined,
    );
    rr.id = data.id;
    return rr;
  }

  /**
   * 复制圆角矩形，返回一个深拷贝的新实例。
   *
   * @returns {this} 复制后的圆角矩形实例
   *
   * @example
   * ```ts
   * const copy = rr.copy();
   * ```
   */
  public copy(): this {
    return new RoundedRect(
      this.x,
      this.y,
      this.width,
      this.height,
      [...this.radii] as [number, number, number, number],
      undefined,
    ) as this;
  }

  // ─────────────────────────────────────────────
  //  私有辅助
  // ─────────────────────────────────────────────

  /**
   * 限制圆角半径：每个角的半径不超过相邻两边长度的一半。
   * 若两角半径之和超过对应边长，则等比缩小。
   *
   * @param {[number, number, number, number]} radii - 原始圆角半径四元组
   * @returns {[number, number, number, number]} 限制后的圆角半径四元组
   *
   * @example
   * ```ts
   * // 内部调用，width=100 时 radii=[60, 60, 0, 0] → [50, 50, 0, 0]
   * const clamped = this.clampRadii([60, 60, 0, 0]);
   * ```
   */
  private clampRadii(
    radii: [number, number, number, number],
  ): [number, number, number, number] {
    let [rtl, rtr, rbr, rbl] = radii.map((r) => Math.max(0, r));
    const w = this.width;
    const h = this.height;

    // 水平方向：左上+右上 ≤ width，左下+右下 ≤ width
    const topScale = rtl + rtr > w ? w / (rtl + rtr) : 1;
    const botScale = rbl + rbr > w ? w / (rbl + rbr) : 1;
    // 垂直方向：左上+左下 ≤ height，右上+右下 ≤ height
    const leftScale = rtl + rbl > h ? h / (rtl + rbl) : 1;
    const rightScale = rtr + rbr > h ? h / (rtr + rbr) : 1;

    const s = Math.min(topScale, botScale, leftScale, rightScale);
    return [rtl * s, rtr * s, rbr * s, rbl * s];
  }

  /**
   * 重建内部 graphs（4 段 Arc + 4 段 Line）并同步控制点和包围盒。
   *
   * 顺序（顺时针）：
   *   Arc(左上) → Line(上) → Arc(右上) → Line(右)
   *   → Arc(右下) → Line(下) → Arc(左下) → Line(左)
   *
   * @example
   * ```ts
   * // 子类在修改 x/y/width/height/radii 后调用
   * this.rebuildEdges();
   * ```
   */
  protected rebuildEdges(): void {
    const { x, y, width: w, height: h } = this;
    const [rtl, rtr, rbr, rbl] = this.radii;

    // 各角圆心
    const cTL = new Point3(x + rtl, y + rtl, 0);
    const cTR = new Point3(x + w - rtr, y + rtr, 0);
    const cBR = new Point3(x + w - rbr, y + h - rbr, 0);
    const cBL = new Point3(x + rbl, y + h - rbl, 0);

    // 各角弧的切点（顺时针，起点/终点）
    // 左上角：从左边切点（上方）→ 上边切点（右方），角度 π → 3π/2（顺时针即 anticlockwise=false）
    // Canvas arc: clockwise=false 表示逆时针，clockwise=true 表示顺时针
    // 我们用 Arc 类，clockwise=false 表示逆时针（Canvas 默认）
    // 顺时针绘制圆角矩形，每个角弧都是顺时针 90°

    const PI = Math.PI;

    // 左上角弧：圆心 cTL，从 π（左）到 3π/2（上），顺时针
    const arcTL = new Arc(cTL, rtl, rtl, 0, PI, PI * 1.5, false);
    // 右上角弧：圆心 cTR，从 3π/2（上）到 0（右），顺时针
    const arcTR = new Arc(cTR, rtr, rtr, 0, PI * 1.5, PI * 2, false);
    // 右下角弧：圆心 cBR，从 0（右）到 π/2（下），顺时针
    const arcBR = new Arc(cBR, rbr, rbr, 0, 0, PI * 0.5, false);
    // 左下角弧：圆心 cBL，从 π/2（下）到 π（左），顺时针
    const arcBL = new Arc(cBL, rbl, rbl, 0, PI * 0.5, PI, false);

    // 四条直线（连接相邻弧的端点）
    // 上边：arcTL 终点 → arcTR 起点
    const linTop = new Line(
      new Point3(x + rtl, y, 0),
      new Point3(x + w - rtr, y, 0),
    );
    // 右边：arcTR 终点 → arcBR 起点
    const linRight = new Line(
      new Point3(x + w, y + rtr, 0),
      new Point3(x + w, y + h - rbr, 0),
    );
    // 下边：arcBR 终点 → arcBL 起点（从右到左）
    const linBot = new Line(
      new Point3(x + w - rbr, y + h, 0),
      new Point3(x + rbl, y + h, 0),
    );
    // 左边：arcBL 终点 → arcTL 起点（从下到上）
    const linLeft = new Line(
      new Point3(x, y + h - rbl, 0),
      new Point3(x, y + rtl, 0),
    );

    this.graphs = [
      arcTL,
      linTop,
      arcTR,
      linRight,
      arcBR,
      linBot,
      arcBL,
      linLeft,
    ];
    this.syncControlPoints();
    this.bounds = this.updateBounds();
  }

  /**
   * 直接用 Canvas API 绘制圆角矩形路径。
   * 比逐段子图形渲染更精确，避免子图形拼接处的微小间隙。
   *
   * @param {CanvasRenderingContext2D} ctx - Canvas 2D 渲染上下文
   *
   * @example
   * ```ts
   * // 内部调用，由 render/renderPath 使用
   * this.buildCanvasPath(ctx);
   * ```
   */
  private buildCanvasPath(ctx: CanvasRenderingContext2D): void {
    const { x, y, width: w, height: h } = this;
    const [rtl, rtr, rbr, rbl] = this.radii;
    const PI = Math.PI;

    ctx.moveTo(x + rtl, y);
    ctx.lineTo(x + w - rtr, y);
    ctx.arc(x + w - rtr, y + rtr, rtr, PI * 1.5, PI * 2, false);
    ctx.lineTo(x + w, y + h - rbr);
    ctx.arc(x + w - rbr, y + h - rbr, rbr, 0, PI * 0.5, false);
    ctx.lineTo(x + rbl, y + h);
    ctx.arc(x + rbl, y + h - rbl, rbl, PI * 0.5, PI, false);
    ctx.lineTo(x, y + rtl);
    ctx.arc(x + rtl, y + rtl, rtl, PI, PI * 1.5, false);
  }
}
