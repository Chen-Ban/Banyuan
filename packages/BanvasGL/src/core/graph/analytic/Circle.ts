import { GRAPHTYPE } from "@/core/constants";
import Arc from "./Arc";
import { Point3 } from "@/core/math";
import { Style } from "@/core/style";

export default class Circle extends Arc {
  public type: GRAPHTYPE = GRAPHTYPE.CIRCLE;

  constructor(center: Point3, radius: number, style: Style = Style.DEFAULT) {
    // 调用父类构造函数，创建完整圆（0 到 2π）
    super(center, radius, 0, 2 * Math.PI, false, style);
  }

  // 设置中心点
  setCenter(center: Point3): Circle {
    this.center = center;
    this.controlPoints = this.calculateControlPoints();
    return this;
  }

  // 设置半径
  setRadius(radius: number): Circle {
    this.radius = Math.max(0, radius);
    this.controlPoints = this.calculateControlPoints();
    return this;
  }

  // 获取直径
  get diameter(): number {
    return this.radius * 2;
  }

  // 获取周长
  get circumference(): number {
    return 2 * Math.PI * this.radius;
  }

  // 获取面积
  get area(): number {
    return Math.PI * this.radius * this.radius;
  }

  // 获取圆上的点（根据角度）
  getPointOnCircle(angle: number): Point3 {
    const x = this.center.x + this.radius * Math.cos(angle);
    const y = this.center.y + this.radius * Math.sin(angle);
    return new Point3(x, y, this.center.z);
  }

  // 获取圆上的切线方向
  getTangentDirection(angle: number): Point3 {
    // 切线方向垂直于半径方向
    const tangentX = -Math.sin(angle);
    const tangentY = Math.cos(angle);
    return new Point3(tangentX, tangentY, 0);
  }

  // 获取圆上的法线方向
  getNormalDirection(angle: number): Point3 {
    // 法线方向就是半径方向
    const normalX = Math.cos(angle);
    const normalY = Math.sin(angle);
    return new Point3(normalX, normalY, 0);
  }

  // 检查两个圆是否相交
  intersects(other: Circle): boolean {
    const dx = other.center.x - this.center.x;
    const dy = other.center.y - this.center.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance <= this.radius + other.radius && distance >= Math.abs(this.radius - other.radius);
  }

  // 检查两个圆是否相切
  isTangent(other: Circle, tolerance: number = 1): boolean {
    const dx = other.center.x - this.center.x;
    const dy = other.center.y - this.center.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const sumRadii = this.radius + other.radius;
    const diffRadii = Math.abs(this.radius - other.radius);
    return Math.abs(distance - sumRadii) <= tolerance || Math.abs(distance - diffRadii) <= tolerance;
  }

  // 检查一个圆是否包含另一个圆
  contains(other: Circle): boolean {
    const dx = other.center.x - this.center.x;
    const dy = other.center.y - this.center.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance + other.radius <= this.radius;
  }

  // 渲染圆形（重写父类方法以支持填充）
  public render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    const bounds = this.getBounds();
    this.style.applyToContext(ctx, bounds.width, bounds.height);

    ctx.beginPath();
    this.renderPath(ctx, true);

    // 如果有填充样式，先填充
    if (this.style.fillStyle) {
      ctx.fill();
    }

    // 如果有描边样式，再描边
    if (this.style.strokeStyle) {
      ctx.stroke();
    }
    ctx.restore();
  }

  // 复制圆形
  public copy(): this {
    return new Circle(this.center.copy(), this.radius, this.style.copy()) as this;
  }

  // 静态工厂方法
  static fromCenterAndRadius(
    centerX: number,
    centerY: number,
    radius: number,
    startAngle: number = 0,
    endAngle: number = 2 * Math.PI,
    clockwise: boolean = false,
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

    if (Math.abs(a) < 1e-10) {
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

// 类型守卫函数
export function isCircle(graph: any): graph is Circle {
  return graph instanceof Circle;
}
