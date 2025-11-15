import { GRAPHTYPE } from "@/core/constants";
import Graph from "../base/Graph";

/**
 * 解析式图形基类
 * 提供基于数学解析式的精确计算功能
 */
export default abstract class AnalyticGraph extends Graph {
  public type: GRAPHTYPE = GRAPHTYPE.ANALYTICGRAPH;
}
