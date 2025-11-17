import type { TextIndex } from "@/core/views/TextView";
import TextView from "@/core/views/TextView";

/**
 * 更新文本并重新布局
 */
export const updateTextAndLayout = (textView: TextView, paragraphIndex: number, newText: string): void => {
  const paragraph = textView.content[paragraphIndex];
  if (!paragraph) return;

  // 清空当前段落的所有文本元素
  paragraph.clearTextElements();

  // 添加新文本
  if (newText.length > 0) {
    paragraph.addText(newText, 0);
  }

  // 重新布局
  textView.shouldLayout = true;
  // 通过访问私有方法重新布局（需要类型断言）
  (textView as any).layout();
  textView.initBoundingBox();
  textView.initViewport();
};

/**
 * 从 TextIndex 转换为输入框中的光标位置
 */
export const indexToCursorPos = (textView: TextView | null, index: TextIndex): number => {
  if (!textView) return 0;
  const paragraph = textView.content[index[0]];
  if (!paragraph) return 0;
  return index[1] + index[2];
};

/**
 * 从输入框光标位置转换为 TextIndex
 */
export const cursorPosToIndex = (textView: TextView | null, paragraphIndex: number, cursorPos: number): TextIndex => {
  if (!textView) return [0, 0, 0];
  const paragraph = textView.content[paragraphIndex];
  if (!paragraph) return [paragraphIndex, 0, 0];

  const textCount = paragraph.texts.length;
  if (cursorPos <= 0) {
    return [paragraphIndex, 0, 0];
  } else if (cursorPos >= textCount) {
    return [paragraphIndex, textCount, 1];
  } else {
    return [paragraphIndex, cursorPos, 0];
  }
};
