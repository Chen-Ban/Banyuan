import { GRAPHTYPE } from "@/core/constants";
import CombinedGraph from "../CombinedGraph";

export default class ComplexGraph extends CombinedGraph {
  public type: GRAPHTYPE = GRAPHTYPE.COMPLEX_GRAPH;
}
