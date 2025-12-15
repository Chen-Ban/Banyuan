import { Rectangle } from "@/core/graph/combined";
import TextParagraph from "@/core/graph/text/TextParagraph";
import TextView from "@/core/views/TextView";
import { VERTICALALIGN } from "@/core/constants";
import { WorkerHandler } from "../types";

/**
 * 文本布局相关任务（纯 handler，仅描述计算逻辑）：
 * - TextView 内部的段落布局（换行、对齐）
 * - TextElement 宽高测量（依赖 CanvasContext.measureText）
 */

export interface TextLayoutPayload {
  paragraphs: TextParagraph[];
  layoutArea: Rectangle;
  verticalAlign?: VERTICALALIGN;
  fixedWidth?: boolean;
  fixedHeight?: boolean;
}

export interface TextLayoutResult {
  paragraphs: TextParagraph[];
  /**
   * 整体包围盒信息（来自 TextView.getContentBounds）
   */
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
}

export const textLayoutHandler: WorkerHandler<TextLayoutPayload, TextLayoutResult> = (
  payload
) => {
  const {
    paragraphs,
    layoutArea,
    verticalAlign = VERTICALALIGN.TOP,
    fixedWidth = false,
    fixedHeight = false,
  } = payload;

  // 利用 TextView 现有的布局逻辑执行一次完整布局
  const view = new TextView(paragraphs, {
    layoutArea,
    verticalAlign,
    fixedWidth,
    fixedHeight,
    shouldLayout: true,
  });

  // TextView 构造函数里在有 layoutArea 时已经执行了一轮 layout / initBoundingBox / initViewport
  const bounds = view.getContentBounds?.() ?? null;

  return {
    paragraphs,
    bounds,
  };
};
