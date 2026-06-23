/**
 * 平台无关的文本类型（引擎自有）
 *
 * 替代 lib.dom 中的 CanvasTextAlign、CanvasTextBaseline、TextMetrics。
 */

/** 文本水平对齐 */
export type TextAlign = 'start' | 'end' | 'left' | 'right' | 'center';

/** 文本垂直基线 */
export type TextBaseline =
  | 'top'
  | 'hanging'
  | 'middle'
  | 'alphabetic'
  | 'ideographic'
  | 'bottom';

/** 文本度量（measureText 返回值） */
export interface ITextMetrics {
  readonly width: number;
  readonly actualBoundingBoxAscent?: number;
  readonly actualBoundingBoxDescent?: number;
  readonly fontBoundingBoxAscent?: number;
  readonly fontBoundingBoxDescent?: number;
}
