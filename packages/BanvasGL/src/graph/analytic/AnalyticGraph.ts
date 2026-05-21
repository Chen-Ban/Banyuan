import { GRAPHTYPE } from "@/foundation/constants";
import Graph from "@/graph/base/Graph";
import type { Point3 } from '@/foundation/math';
import { IAnalyticGraph } from '@/types';

/**
 * 解析式图形基类
 * 提供基于数学解析式的精确计算功能
 */
export default abstract class AnalyticGraph extends Graph implements IAnalyticGraph {
  public type: GRAPHTYPE = GRAPHTYPE.ANALYTICGRAPH;
  public abstract controlPoints: Point3[];
}
