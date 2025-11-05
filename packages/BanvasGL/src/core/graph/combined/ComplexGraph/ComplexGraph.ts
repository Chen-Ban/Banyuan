import { GRAPHTYPE } from "@/constants";
import CombinedGraph from "../CombinedGraph";
import Graph from "../../base/Graph";

export default class ComplexGraph<
  T extends Graph = Graph
> extends CombinedGraph<T> {
  public type: GRAPHTYPE = GRAPHTYPE.COMPLEX_GRAPH;
}
