import { GRAPHTYPE } from "@/foundation/constants";
import Arc from "./Arc";
import { MathUtils, Point3, Vector3 } from "@/foundation/math";
import { Style } from "@/foundation/style";
import { ICircle } from '@/types';
import type { ISerializable } from '@/types';

export default class Circle extends Arc implements ICircle, ISerializable {
  public type: GRAPHTYPE = GRAPHTYPE.CIRCLE;

  constructor(center: Point3, radius: number, style: Style = Style.DEFAULT) {
    // 调用父类构造函数，创建完整圆（0 到 2π）
    // 对于圆，xRadius 和 yRadius 相等，rotation 为 0
    super(center, radius, radius, 0, 0, 2 * Math.PI, false, style);
  }

  // 设置半径（同时维护 xRadius === yRadius 约束）
  setRadius(radius: number): Circle {
    this.xRadius = Math.max(0, radius);
    this.yRadius = Math.max(0, radius);
    this.controlPoints = this.calculateControlPoints();
    this.bounds = this.updateBounds();
    return this;
  }

  // 直径 = 2r
  get diameter(): number {
    return 2 * this.xRadius;
  }

  // 重写：圆的弧长与参数 t 呈线性关系，O(1) 精确计算，跳过父类 Simpson 积分
  public getLength(tStart: number, tEnd: number): number {
    return 2 * Math.PI * this.xRadius * Math.abs(tEnd - tStart);
  }


  // 重写 resize，保持 xRadius === yRadius 的圆形约束
  public resize(
    fixedPoint: Point3,
    dynamicPoint: Point3,
    resizeVector: Vector3,
  ): void {
    const referenceVector = dynamicPoint.subtract(fixedPoint);
    const width = Math.abs(referenceVector.x) || Infinity;
    const height = Math.abs(referenceVector.y) || Infinity;

    // center 按其到 fixedPoint 的距离比例缩放
    const scaleX = Math.abs(this.center.x - fixedPoint.x) / width;
    const scaleY = Math.abs(this.center.y - fixedPoint.y) / height;

    this.center = new Point3(
      this.center.x + resizeVector.x * scaleX,
      this.center.y + resizeVector.y * scaleY,
      this.center.z,
    );

    // 半径取两轴缩放比的均值，保持圆形
    const newWidth = width + resizeVector.x * Math.sign(referenceVector.x);
    const newHeight = height + resizeVector.y * Math.sign(referenceVector.y);
    const ratioX = Math.abs(newWidth / width);
    const ratioY = Math.abs(newHeight / height);
    const ratio = (ratioX + ratioY) / 2;

    const newRadius = Math.max(0, this.xRadius * ratio);
    this.xRadius = newRadius;
    this.yRadius = newRadius;

    this.controlPoints = this.calculateControlPoints();
    this.bounds = this.updateBounds();
  }

  // 渲染圆形（重写父类方法以支持填充）
  public render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    const bounds = this.bounds;
    this.style.applyToContext(ctx, Math.abs(bounds.width), Math.abs(bounds.height));

    ctx.beginPath();
    this.renderPath(ctx, true);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // ── 序列化 ──
  toJSON(): any {
    return {
      id: this.id,
      type: this.type,
      center: this.center.toJSON(),
      radius: this.xRadius,
      style: this.style.toJSON(),
    }
  }

  static fromJSON(data: any): Circle {
    const circle = new Circle(
      Point3.fromJSON(data.center),
      data.radius ?? data.xRadius,
      Style.fromJSON(data.style),
    );
    circle.id = data.id;
    return circle;
  }

  // 复制圆形
  public copy(): this {
    return new Circle(this.center.copy(), this.xRadius, this.style.copy()) as this;
  }

  // 静态工厂方法
  static fromCenterAndRadius(
    centerX: number,
    centerY: number,
    radius: number,
    style: Style = Style.DEFAULT
  ): Circle {
    return new Circle(new Point3(centerX, centerY, 0), radius, style);
  }

  static fromDiameter(centerX: number, centerY: number, diameter: number, style: Style = Style.DEFAULT): Circle {
    return new Circle(new Point3(centerX, centerY, 0), diameter / 2, style);
  }

  static fromCircumference(
    centerX: number,
    centerY: number,
    circumference: number,
    style: Style = Style.DEFAULT
  ): Circle {
    const radius = circumference / (2 * Math.PI);
    return new Circle(new Point3(centerX, centerY, 0), radius, style);
  }

  static fromArea(centerX: number, centerY: number, area: number, style: Style = Style.DEFAULT): Circle {
    const radius = Math.sqrt(area / Math.PI);
    return new Circle(new Point3(centerX, centerY, 0), radius, style);
  }

  static fromTwoPoints(point1: Point3, point2: Point3, style: Style = Style.DEFAULT): Circle {
    const center = new Point3((point1.x + point2.x) / 2, (point1.y + point2.y) / 2, (point1.z + point2.z) / 2);
    const radius = Math.sqrt(Math.pow(point2.x - point1.x, 2) + Math.pow(point2.y - point1.y, 2)) / 2;
    return new Circle(center, radius, style);
  }

  static fromThreePoints(point1: Point3, point2: Point3, point3: Point3, style: Style = Style.DEFAULT): Circle {
    // 计算三点确定的圆的中心点和半径
    const x1 = point1.x,
      y1 = point1.y;
    const x2 = point2.x,
      y2 = point2.y;
    const x3 = point3.x,
      y3 = point3.y;

    const a = x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2);
    const b = (x1 * x1 + y1 * y1) * (y3 - y2) + (x2 * x2 + y2 * y2) * (y1 - y3) + (x3 * x3 + y3 * y3) * (y2 - y1);
    const c = (x1 * x1 + y1 * y1) * (x2 - x3) + (x2 * x2 + y2 * y2) * (x3 - x1) + (x3 * x3 + y3 * y3) * (x1 - x2);

    if (Math.abs(a) < MathUtils.FLOAT_EPSILON) {
      // 三点共线，返回一个很小的圆
      return new Circle(new Point3(0, 0, 0), 0.1, style);
    }

    const centerX = -b / (2 * a);
    const centerY = -c / (2 * a);
    const radius = Math.sqrt(Math.pow(x1 - centerX, 2) + Math.pow(y1 - centerY, 2));

    return new Circle(new Point3(centerX, centerY, 0), radius, style);
  }

  // 预定义圆形
  static readonly UNIT_CIRCLE = new Circle(new Point3(0, 0, 0), 1);
  static readonly EMPTY_CIRCLE = new Circle(new Point3(0, 0, 0), 0);
}
