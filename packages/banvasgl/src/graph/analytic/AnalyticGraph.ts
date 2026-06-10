import { GraphType } from "@/foundation/constants";
import Graph from "@/graph/base/Graph";
import type { Point3 } from '@/foundation/math';
import type { IAnalyticGraph } from '@/types/graph/graph'

/**
 * 解析式图形基类
 *
 * 提供基于数学解析式的精确计算功能，是所有可通过参数方程描述的图形的公共抽象基类。
 *
 * **解析式图形与组合图形（CombinedGraph）的区别：**
 * - **解析式图形（AnalyticGraph）**：基于数学方程精确计算几何属性。
 *   每个子类拥有独立的参数化方程（如直线的线性方程、椭圆弧的极坐标方程），
 *   可以精确执行投影、弧长、法线、切线等几何运算。
 *   典型子类：`Line`（直线）、`Arc`（椭圆弧）、`Bezier`（贝塞尔曲线）。
 *
 * - **组合图形（CombinedGraph）**：通过组合多个子图形（AnalyticGraph 实例）构建复杂形状，
 *   本身不拥有独立的数学方程，几何运算委托给子图形完成。
 *   典型场景：矩形（4条直线）、多边形（多条直线）、自定义路径（直线+弧+曲线）。
 *
 * **控制点（controlPoints）在子类中的语义：**
 * - `Line`：`[startPoint, endPoint]` — 线段两端点
 * - `Arc`：`[startPoint, endPoint, center]` — 弧的起止点和圆心（由参数派生）
 * - `QuadraticBezier`：`[startPoint, controlPoint, endPoint]` — 起止点和控制点
 * - `CubicBezier`：`[startPoint, controlPoint1, controlPoint2, endPoint]` — 起止点和两个控制点
 *
 * @example
 * ```typescript
 * // 解析式图形不可直接实例化，需通过子类使用
 * const line = new Line(startPoint, endPoint);
 * const arc = new Arc(center, xRadius, yRadius, 0, 0, Math.PI);
 * const bezier = new QuadraticBezier(p0, p1, p2);
 * ```
 */
export default abstract class AnalyticGraph extends Graph implements IAnalyticGraph {
  /**
   * 图形类型标识，固定为 `GraphType.ANALYTICGRAPH`
   */
  public type: GraphType = GraphType.ANALYTICGRAPH;

  /**
   * 控制点数组，由子类定义具体含义
   *
   * 不同的解析式图形子类对控制点有不同的语义解释：
   * - `Line`：`[startPoint, endPoint]`，即线段的两个端点
   * - `Arc`：`[startPoint, endPoint, center]`，即弧的起止点和圆心
   * - `Bezier`：`[startPoint, ..., controlPoints, ..., endPoint]`，起止点和中间控制点
   *
   * 控制点参与包围盒计算，也可用于顶点编辑交互。
   */
  public abstract controlPoints: Point3[];
}
