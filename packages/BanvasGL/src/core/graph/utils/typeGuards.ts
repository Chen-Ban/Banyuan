import Graph from "../base/Graph";
import { GRAPHTYPE } from "@/constants";
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
import type { Texts, TextParagraph, TextElement } from "../text";
import type { DenseTrajectory, Sketch } from "../trajectory";
import type ImageElement from "../image/ImageElement";
import type VideoElement from "../video/VideoElement";

export function isAnalyticGraph(graph: Graph): graph is AnalyticGraph {
  return graph.type === GRAPHTYPE.ANALYTICGRAPH;
}

export function isLine(graph: Graph): graph is Line {
  return graph.type === GRAPHTYPE.LINE;
}

export function isArc(graph: Graph): graph is Arc {
  return graph.type === GRAPHTYPE.ARC;
}

export function isCircle(graph: Graph): graph is Circle {
  return graph.type === GRAPHTYPE.CIRCLE;
}

export function isBezier(graph: Graph): graph is Bezier {
  return graph.type === GRAPHTYPE.BEZIER;
}

export function isQuadraticBezier(graph: Graph): graph is QuadraticBezier {
  return graph.type === GRAPHTYPE.QUADRATIC_BEZIER;
}

export function isCubicBezier(graph: Graph): graph is CubicBezier {
  return graph.type === GRAPHTYPE.CUBIC_BEZIER;
}

export function isPolygon(graph: Graph): graph is Polygon {
  return graph.type === GRAPHTYPE.POLYGON;
}

export function isRectangle(graph: Graph): graph is Rectangle {
  return graph.type === GRAPHTYPE.RECTANGLE;
}

export function isRegularPolygon(graph: Graph): graph is RegularPolygon {
  return graph.type === GRAPHTYPE.REGULAR_POLYGON;
}

export function isTriangle(graph: Graph): graph is Triangle {
  return graph.type === GRAPHTYPE.TRIANGLE;
}

export function isCombinedGraph(graph: Graph): graph is CombinedGraph<Graph> {
  return graph.type === GRAPHTYPE.COMBINED_GRAPH;
}

export function isComplexGraph(graph: Graph): graph is ComplexGraph<any> {
  return graph.type === GRAPHTYPE.COMPLEX_GRAPH;
}

export function isMagnifyingGlass(graph: Graph): graph is MagnifyingGlass {
  return graph.type === GRAPHTYPE.MAGNIFYING_GLASS;
}

export function isTexts(graph: Graph): graph is Texts {
  return graph.type === GRAPHTYPE.TEXTS;
}

export function isTextParagraph(graph: Graph): graph is TextParagraph {
  return graph.type === GRAPHTYPE.TEXTPARAGRAPH;
}

export function isTextElement(graph: Graph): graph is TextElement {
  return graph.type === GRAPHTYPE.TEXTELEMENT;
}

export function isDenseTrajectory(graph: Graph): graph is DenseTrajectory {
  return graph.type === GRAPHTYPE.DENSETRAJECTORY;
}

export function isSketch(graph: Graph): graph is Sketch {
  return graph.type === GRAPHTYPE.SKETCH;
}

export function isImageElement(graph: Graph): graph is ImageElement {
  return graph.type === GRAPHTYPE.IMAGE;
}

export function isVideoElement(graph: Graph): graph is VideoElement {
  return graph.type === GRAPHTYPE.VIDEO;
}
