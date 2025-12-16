import { useCallback, useEffect, useRef } from "react";
import { Point3, App, isTextView } from "@/core";
import { ViewTreeUtils } from "@/core/utils/ViewTreeUtils";
import type TextView from "@/core/views/TextView";

export interface UseInputEventsOptions {
  inputRef: React.RefObject<HTMLInputElement | null>;
  app: App | null;
}

/**
 * 获取当前选中的 TextView
 */
function getSelectedTextView(app: App | null): TextView | null {
  const scene = app?.getCurrentScene();
  if (!scene) return null;

  const selectedView = scene.getSelectedView()[0];

  return isTextView(selectedView) ? selectedView : null;
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
      if (!selectedView || !selectedView.selection.isSelection || !inputRef.current) return;

      if (!(e instanceof InputEvent)) return;

      // 只处理普通文本输入
      if (e.inputType === "insertText") {
        const insertedText = e.data || "";
        if (insertedText.length > 0) {
          selectedView.input(insertedText, false);
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
      if (!selectedView || !selectedView.selection.isSelection || !inputRef.current) return;

      // 合成输入更新时，使用 e.data 获取正在输入的文本
      const compositionText = e.data || "";
      if (compositionText.length > 0) {
        // 使用 input 方法更新文本（合成输入中）
        selectedView.input(compositionText, true);
      }
    },
    [app, inputRef]
  );

  const onCompositionEnd = useCallback(
    (e: CompositionEvent) => {
      isComposingRef.current = false;
      const selectedView = getSelectedTextView(app);
      if (!selectedView || !selectedView.selection.isSelection || !inputRef.current) return;

      // 合成输入结束，使用 e.data 获取最终输入的文本
      const finalText = e.data || "";
      if (finalText.length > 0) {
        // 合成输入结束，最终更新文本（非合成输入）
        selectedView.input(finalText, false);
      }
    },
    [app, inputRef]
  );

  // 处理非输入按键（方向键、删除键、换行等)，合成事件中的按钮按下不会出发keydown
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const selectedView = getSelectedTextView(app);

      if (!selectedView || !selectedView.selection.isSelection || !inputRef.current) return;

      // 合成输入过程中，不处理按键（除了 Escape）
      if (isComposingRef.current && e.key !== "Escape") {
        return;
      }

      const input = inputRef.current;
      const inputValue = input.value;

      switch (e.key) {
        case "ArrowLeft":
          break;

        case "ArrowRight":
          break;

        case "ArrowUp":
          e.preventDefault();
          // 移动到上一行（暂时不支持，可以扩展）
          break;

        case "ArrowDown":
          e.preventDefault();
          // 移动到下一行（暂时不支持，可以扩展）
          break;
        case "End":
          e.preventDefault();
          const endPos = inputValue.length;
          input.setSelectionRange(endPos, endPos);
          break;

        case "Backspace":
          // 退格键：删除光标前的字符
          selectedView.delete(true);
          break;

        case "Delete":
          // Delete 键：删除光标后的字符
          selectedView.delete(false);
          break;

        case "Enter":
          e.preventDefault();
          // 回车键：创建新段落
          selectedView.newLine();
          break;
        case "Escape":
          // 失活当前选中的容器
          if (!isComposingRef.current && selectedView && app) {
            selectedView.fixedIndex = undefined;
            selectedView.dynamicIndex = undefined;
            selectedView.setSelection(undefined, undefined);
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
  }, [onInput, onCompositionStart, onCompositionUpdate, onCompositionEnd, onKeyDown, inputRef, app]);
}
