import { GRAPHTYPE } from "@/core/constants";
import Graph from "../base/Graph";
import type { Point3 } from '@/core/math';
import type { IAnalyticGraph } from '@/core/interfaces';

/**
 * 解析式图形基类
 * 提供基于数学解析式的精确计算功能
 */
export default abstract class AnalyticGraph extends Graph implements IAnalyticGraph {
  public type: GRAPHTYPE = GRAPHTYPE.ANALYTICGRAPH;
  public abstract controlPoints: Point3[];
}
