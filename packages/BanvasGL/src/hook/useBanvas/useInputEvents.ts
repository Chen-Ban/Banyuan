import { useCallback, useEffect, useRef } from "react";
import { Point3, App } from "@/core";
import { isTextView } from "@/core/views/utils/typeGuards";
import { cursorPosToIndex, indexToCursorPos } from "./utils/textUtils";
import { ViewTreeUtils } from "@/core/utils/ViewTreeUtils";
import type TextView from "@/core/views/TextView";
import { TextIndex } from "@/core/views/TextView/Selection";

export interface UseInputEventsOptions {
  inputRef: React.RefObject<HTMLInputElement | null>;
  app: App | null;
}

/**
 * 获取当前选中的 TextView
 */
function getSelectedTextView(app: App | null): TextView | null {
  if (!app) return null;
  const scene = app.getCurrentPage();
  if (!scene) return null;

  const selectedViews = scene.getSelectedView();
  const selectedView = selectedViews.length > 0 ? selectedViews[selectedViews.length - 1] : null;

  return isTextView(selectedView) ? selectedView : null;
}

/**
 * 更新输入框的光标位置
 */
function updateInputCursor(
  inputRef: React.RefObject<HTMLInputElement | null>,
  selectedView: TextView,
  index: TextIndex
) {
  if (!inputRef.current) return;
  const cursorPos = indexToCursorPos(selectedView, index);
  inputRef.current.setSelectionRange(cursorPos, cursorPos);
}

/**
 * 删除操作后更新输入框的值和光标位置
 */
function updateInputAfterDelete(
  inputRef: React.RefObject<HTMLInputElement | null>,
  selectedView: TextView,
  paragraphIndex: number
) {
  if (!inputRef.current) return;

  const paragraph = selectedView.content[paragraphIndex];
  if (!paragraph) return;

  const newText = paragraph.texts.map((t) => t.content).join("");
  inputRef.current.value = newText;

  const newIndex = selectedView.fixedIndex || [paragraphIndex, 0, 0];
  updateInputCursor(inputRef, selectedView, newIndex as TextIndex);
}

/**
 * Input 事件绑定
 */
export function useInputEvents({ inputRef, app }: UseInputEventsOptions) {
  const isComposingRef = useRef<boolean>(false);

  // 处理普通文本输入（非合成输入）
  const onInput = useCallback(
    (e: Event) => {
      const selectedView = getSelectedTextView(app);
      if (!selectedView || !selectedView.fixedIndex || !selectedView.dynamicIndex || !inputRef.current) return;

      // 合成输入由 onCompositionUpdate 处理，这里跳过
      if (isComposingRef.current) {
        return;
      }

      if (!(e instanceof InputEvent)) return;

      // 只处理普通文本输入
      if (e.inputType === "insertText") {
        const insertedText = e.data || "";
        if (insertedText.length > 0) {
          selectedView.input(insertedText, false);
          // 更新输入框的光标位置
          const newIndex = selectedView.dynamicIndex || selectedView.fixedIndex;
          updateInputCursor(inputRef, selectedView, newIndex);
        }
      }
      // 其他 inputType（删除、换行等）由 onKeyDown 处理
    },
    [app, inputRef]
  );

  // 处理合成输入（中文输入法等）
  const onCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const onCompositionUpdate = useCallback(
    (e: CompositionEvent) => {
      const selectedView = getSelectedTextView(app);
      if (!selectedView || !selectedView.fixedIndex || !selectedView.dynamicIndex || !inputRef.current) return;

      // 合成输入更新时，使用 e.data 获取正在输入的文本
      const compositionText = e.data || "";
      if (compositionText.length > 0) {
        // 使用 input 方法更新文本（合成输入中）
        selectedView.input(compositionText, true);
        // 更新输入框的光标位置
        const newIndex = selectedView.dynamicIndex || selectedView.fixedIndex;
        updateInputCursor(inputRef, selectedView, newIndex);
      }
    },
    [app, inputRef]
  );

  const onCompositionEnd = useCallback(
    (e: CompositionEvent) => {
      isComposingRef.current = false;
      const selectedView = getSelectedTextView(app);
      if (!selectedView || !selectedView.fixedIndex || !selectedView.dynamicIndex || !inputRef.current) return;

      // 合成输入结束，使用 e.data 获取最终输入的文本
      const finalText = e.data || "";
      if (finalText.length > 0) {
        // 合成输入结束，最终更新文本（非合成输入）
        selectedView.input(finalText, false);
        // 更新输入框的光标位置
        const newIndex = selectedView.dynamicIndex || selectedView.fixedIndex;
        updateInputCursor(inputRef, selectedView, newIndex);
      }
    },
    [app, inputRef]
  );

  // 处理非输入按键（方向键、删除键、换行等)，合成事件中的按钮按下不会出发keydown
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const selectedView = getSelectedTextView(app);
      if (!selectedView || !selectedView.fixedIndex || !inputRef.current) return;

      // 合成输入过程中，不处理按键（除了 Escape）
      if (isComposingRef.current && e.key !== "Escape") {
        return;
      }

      const paragraphIndex = selectedView.fixedIndex[0];
      const paragraph = selectedView.content[paragraphIndex];
      if (!paragraph) return;

      const input = inputRef.current;
      const inputValue = input.value;
      const selectionStart = input.selectionStart || 0;
      const selectionEnd = input.selectionEnd || 0;

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          if (selectionStart > 0) {
            const newPos = selectionStart - 1;
            input.setSelectionRange(newPos, newPos);
            const leftIndex = cursorPosToIndex(selectedView, paragraphIndex, newPos);
            selectedView.setSelection(leftIndex, leftIndex);
          }
          break;

        case "ArrowRight":
          e.preventDefault();
          if (selectionEnd < inputValue.length) {
            const newPos = selectionEnd + 1;
            input.setSelectionRange(newPos, newPos);
            const rightIndex = cursorPosToIndex(selectedView, paragraphIndex, newPos);
            selectedView.setSelection(rightIndex, rightIndex);
          }
          break;

        case "ArrowUp":
          e.preventDefault();
          // 移动到上一行（暂时不支持，可以扩展）
          break;

        case "ArrowDown":
          e.preventDefault();
          // 移动到下一行（暂时不支持，可以扩展）
          break;

        case "Home":
          e.preventDefault();
          input.setSelectionRange(0, 0);
          const homeIndex: TextIndex = [paragraphIndex, 0, 0];
          selectedView.setSelection(homeIndex, homeIndex);
          break;

        case "End":
          e.preventDefault();
          const endPos = inputValue.length;
          input.setSelectionRange(endPos, endPos);
          const endIndex = cursorPosToIndex(selectedView, paragraphIndex, endPos);
          selectedView.setSelection(endIndex, endIndex);
          break;

        case "Backspace":
          // 退格键：删除光标前的字符
          e.preventDefault();
          if (selectionStart === selectionEnd && selectionStart > 0) {
            selectedView.delete(true);
            updateInputAfterDelete(inputRef, selectedView, paragraphIndex);
          } else if (selectionStart !== selectionEnd) {
            // 有选中文本，删除选中范围
            selectedView.delete(true);
            updateInputAfterDelete(inputRef, selectedView, paragraphIndex);
          }
          break;

        case "Delete":
          // Delete 键：删除光标后的字符
          e.preventDefault();
          if (selectionStart === selectionEnd && selectionEnd < inputValue.length) {
            selectedView.delete(false);
            updateInputAfterDelete(inputRef, selectedView, paragraphIndex);
          } else if (selectionStart !== selectionEnd) {
            // 有选中文本，删除选中范围
            selectedView.delete(false);
            updateInputAfterDelete(inputRef, selectedView, paragraphIndex);
          }
          break;

        case "Enter":
          e.preventDefault();
          // 回车键：创建新段落
          selectedView.newLine();
          // 更新输入框的值和光标位置
          const newIndex = selectedView.fixedIndex || [0, 0, 0];
          const newCursorPos = indexToCursorPos(selectedView, newIndex as TextIndex);
          // 注意：这里只更新当前段落，因为 newLine 会创建新段落
          const currentParagraph = selectedView.content[newIndex[0]];
          if (currentParagraph) {
            input.value = currentParagraph.texts.map((t) => t.content).join("");
            input.setSelectionRange(newCursorPos, newCursorPos);
          }
          break;

        case "Escape":
          // 失活当前选中的容器
          if (!isComposingRef.current && selectedView && app) {
            selectedView.fixedIndex = undefined;
            selectedView.dynamicIndex = undefined;
            selectedView.setSelection(undefined, undefined);
            input.style.display = "none";
          }
          break;

        case "Tab":
          e.preventDefault();
          // Tab键：切换到下一个可编辑容器
          if (app) {
            const scene = app.getCurrentPage();
            if (scene) {
              const allViews = ViewTreeUtils.flattenViewTree(scene);
              const editableViews = allViews.filter((view) => isTextView(view));

              if (editableViews.length > 0) {
                const currentIndex = editableViews.findIndex((view) => view === selectedView);
                const nextIndex = e.shiftKey
                  ? (currentIndex - 1 + editableViews.length) % editableViews.length // Shift+Tab：上一个
                  : (currentIndex + 1) % editableViews.length; // Tab：下一个

                const nextView = editableViews[nextIndex];
                if (nextView && nextView !== selectedView) {
                  // 激活下一个容器
                  scene.select(nextView);

                  // 更新输入框位置到新选中的容器
                  const bounds = nextView.getBounds();
                  if (bounds) {
                    const worldMatrix = nextView.getWorldMatrix();
                    const relativeBottomLeft = new Point3(bounds.x, bounds.y + bounds.height, 0);
                    const worldBottomLeft = worldMatrix.multiply(relativeBottomLeft);
                    const layoutBounds = nextView.layoutArea?.getBounds();

                    if (layoutBounds) {
                      input.style.left = `${worldBottomLeft.x}px`;
                      input.style.top = `${worldBottomLeft.y}px`;
                      input.style.width = `${layoutBounds.width}px`;
                      input.style.height = `16px`;
                      input.style.display = "block";
                      input.focus();

                      // 设置光标到新容器的开始位置
                      const fixedIndex: TextIndex = [0, 0, 0];
                      nextView.setSelection(fixedIndex, fixedIndex);
                      const cursorPos = indexToCursorPos(nextView, fixedIndex);
                      input.setSelectionRange(cursorPos, cursorPos);

                      // 更新输入框内容
                      const contentText = nextView.getContentText();
                      if (contentText && contentText.length > 0) {
                        input.value = contentText[0];
                      } else {
                        input.value = "";
                      }
                    }
                  }
                }
              }
            }
          }
          break;

        default:
          // 普通文本输入由 onInput 处理，这里不处理
          break;
      }
    },
    [app, inputRef]
  );

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    input.addEventListener("input", onInput);
    input.addEventListener("compositionstart", onCompositionStart);
    input.addEventListener("compositionupdate", onCompositionUpdate);
    input.addEventListener("compositionend", onCompositionEnd);
    input.addEventListener("keydown", onKeyDown as any);

    return () => {
      input.removeEventListener("input", onInput as any);
      input.removeEventListener("compositionstart", onCompositionStart as any);
      input.removeEventListener("compositionupdate", onCompositionUpdate as any);
      input.removeEventListener("compositionend", onCompositionEnd as any);
      input.removeEventListener("keydown", onKeyDown as any);
    };
  }, [onInput, onCompositionStart, onCompositionUpdate, onCompositionEnd, onKeyDown, inputRef]);
}
