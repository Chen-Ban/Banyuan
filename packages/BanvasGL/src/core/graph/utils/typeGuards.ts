import Graph from "../base/Graph";
import { GRAPHTYPE } from "@/core/constants";
import type AnalyticGraph from "../analytic/AnalyticGraph";
import type Line from "../analytic/Line";
import type Arc from "../analytic/Arc";
import type Circle from "../analytic/Circle";
import type Bezier from "../analytic/Bezier";
import type QuadraticBezier from "../analytic/QuadraticBezier";
import type CubicBezier from "../analytic/CubicBezier";
import type Polygon from "../combined/Polygon/Polygon";
import type Rectangle from "../combined/Polygon/Rectangle";
import type RegularPolygon from "../combined/Polygon/RegularPolygon";
import type Triangle from "../combined/Polygon/Triangle";
import type CombinedGraph from "../combined/CombinedGraph";
import type { ComplexGraph, MagnifyingGlass } from "../combined/ComplexGraph";
import type { TextParagraph, TextElement } from "../text";
import type { DenseTrajectory, Sketch } from "../trajectory";
import type ImageElement from "../image/ImageElement";
import type VideoElement from "../video/VideoElement";

export function isAnalyticGraph(graph: any): graph is AnalyticGraph {
  return graph !== null && graph.type === GRAPHTYPE.ANALYTICGRAPH;
}

export function isLine(graph: any): graph is Line {
  return graph !== null && graph.type === GRAPHTYPE.LINE;
}

export function isArc(graph: any): graph is Arc {
  return graph !== null && graph.type === GRAPHTYPE.ARC;
}

export function isCircle(graph: any): graph is Circle {
  return graph !== null && graph.type === GRAPHTYPE.CIRCLE;
}

export function isBezier(graph: any): graph is Bezier {
  return graph !== null && graph.type === GRAPHTYPE.BEZIER;
}

export function isQuadraticBezier(graph: any): graph is QuadraticBezier {
  return graph !== null && graph.type === GRAPHTYPE.QUADRATIC_BEZIER;
}

export function isCubicBezier(graph: any): graph is CubicBezier {
  return graph !== null && graph.type === GRAPHTYPE.CUBIC_BEZIER;
}

export function isPolygon(graph: any): graph is Polygon {
  return graph !== null && graph.type === GRAPHTYPE.POLYGON;
}

export function isRectangle(graph: any): graph is Rectangle {
  return graph !== null && graph.type === GRAPHTYPE.RECTANGLE;
}

export function isRegularPolygon(graph: any): graph is RegularPolygon {
  return graph !== null && graph.type === GRAPHTYPE.REGULAR_POLYGON;
}

export function isTriangle(graph: any): graph is Triangle {
  return graph !== null && graph.type === GRAPHTYPE.TRIANGLE;
}

export function isCombinedGraph(graph: any): graph is CombinedGraph<Graph> {
  return graph !== null && graph.type === GRAPHTYPE.COMBINED_GRAPH;
}

export function isComplexGraph(graph: any): graph is ComplexGraph<any> {
  return graph !== null && graph.type === GRAPHTYPE.COMPLEX_GRAPH;
}

export function isMagnifyingGlass(graph: any): graph is MagnifyingGlass {
  return graph !== null && graph.type === GRAPHTYPE.MAGNIFYING_GLASS;
}

export function isTextParagraph(graph: any): graph is TextParagraph {
  return graph !== null && graph.type === GRAPHTYPE.TEXTPARAGRAPH;
}

export function isTextElement(graph: any): graph is TextElement {
  return graph !== null && graph.type === GRAPHTYPE.TEXTELEMENT;
}

export function isDenseTrajectory(graph: any): graph is DenseTrajectory {
  return graph !== null && graph.type === GRAPHTYPE.DENSETRAJECTORY;
}

export function isSketch(graph: any): graph is Sketch {
  return graph !== null && graph.type === GRAPHTYPE.SKETCH;
}

export function isImageElement(graph: any): graph is ImageElement {
  return graph !== null && graph.type === GRAPHTYPE.IMAGE;
}

export function isVideoElement(graph: any): graph is VideoElement {
  return graph !== null && graph.type === GRAPHTYPE.VIDEO;
}
