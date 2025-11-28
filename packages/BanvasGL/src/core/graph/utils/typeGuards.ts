import { GRAPHTYPE } from "@/core/constants";
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
import type { TextParagraph, TextElement, NonPrintableTextElement, PrintableTextElement } from "../text";
import { NonPrintableTextElement as NonPrintableTextElementClass, PrintableTextElement as PrintableTextElementClass } from "../text";
import type { DenseTrajectory } from "../trajectory";
import type ImageElement from "../media/ImageElement";
import type VideoElement from "../media/VideoElement";

export function isAnalyticGraph(graph: any): graph is Line | Arc | Circle | QuadraticBezier | CubicBezier {
  return (
    graph !== null &&
    graph !== undefined &&
    (isLine(graph) || isArc(graph) || isCircle(graph) || isQuadraticBezier(graph) || isCubicBezier(graph))
  );
}

export function isLine(graph: any): graph is Line {
  return graph !== null && graph !== undefined && graph.type === GRAPHTYPE.LINE;
}

export function isArc(graph: any): graph is Arc {
  return graph !== null && graph !== undefined && graph.type === GRAPHTYPE.ARC;
}

export function isCircle(graph: any): graph is Circle {
  return graph !== null && graph !== undefined && graph.type === GRAPHTYPE.CIRCLE;
}

export function isBezier(graph: any): graph is Bezier {
  return graph !== null && graph !== undefined && graph.type === GRAPHTYPE.BEZIER;
}

export function isQuadraticBezier(graph: any): graph is QuadraticBezier {
  return graph !== null && graph !== undefined && graph.type === GRAPHTYPE.QUADRATIC_BEZIER;
}

export function isCubicBezier(graph: any): graph is CubicBezier {
  return graph !== null && graph !== undefined && graph.type === GRAPHTYPE.CUBIC_BEZIER;
}

export function isPolygon(graph: any): graph is Polygon {
  return graph !== null && graph !== undefined && graph.type === GRAPHTYPE.POLYGON;
}

export function isRectangle(graph: any): graph is Rectangle {
  return graph !== null && graph !== undefined && graph.type === GRAPHTYPE.RECTANGLE;
}

export function isRegularPolygon(graph: any): graph is RegularPolygon {
  return graph !== null && graph !== undefined && graph.type === GRAPHTYPE.REGULAR_POLYGON;
}

export function isTriangle(graph: any): graph is Triangle {
  return graph !== null && graph !== undefined && graph.type === GRAPHTYPE.TRIANGLE;
}

export function isCombinedGraph(graph: any): graph is CombinedGraph {
  return graph !== null && graph !== undefined && graph.type === GRAPHTYPE.COMBINED_GRAPH;
}

export function isComplexGraph(graph: any): graph is ComplexGraph {
  return graph !== null && graph !== undefined && graph.type === GRAPHTYPE.COMPLEX_GRAPH;
}

export function isMagnifyingGlass(graph: any): graph is MagnifyingGlass {
  return graph !== null && graph !== undefined && graph.type === GRAPHTYPE.MAGNIFYING_GLASS;
}

export function isTextParagraph(graph: any): graph is TextParagraph {
  return graph !== null && graph !== undefined && graph.type === GRAPHTYPE.TEXTPARAGRAPH;
}

export function isTextElement(graph: any): graph is TextElement {
  return graph !== null && graph !== undefined && graph.type === GRAPHTYPE.TEXTELEMENT;
}

export function isNonPrintableTextElement(graph: any): graph is NonPrintableTextElement {
  return graph instanceof NonPrintableTextElementClass;
}

export function isPrintableTextElement(graph: any): graph is PrintableTextElement {
  return graph instanceof PrintableTextElementClass;
}

export function isDenseTrajectory(graph: any): graph is DenseTrajectory {
  return graph !== null && graph !== undefined && graph.type === GRAPHTYPE.DENSETRAJECTORY;
}

export function isImageElement(graph: any): graph is ImageElement {
  return graph !== null && graph !== undefined && graph.type === GRAPHTYPE.IMAGE;
}

export function isVideoElement(graph: any): graph is VideoElement {
  return graph !== null && graph !== undefined && graph.type === GRAPHTYPE.VIDEO;
}

// 联合类型的类型守卫
export function isMediaElement(graph: any): graph is ImageElement | VideoElement {
  return isImageElement(graph) || isVideoElement(graph);
}

export function isTextGraph(graph: any): graph is TextElement | TextParagraph {
  return isTextElement(graph) || isTextParagraph(graph);
}

export function isCombinedGraphType(graph: any): graph is CombinedGraph | ComplexGraph {
  return isCombinedGraph(graph) || isComplexGraph(graph);
}
