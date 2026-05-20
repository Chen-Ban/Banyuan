import { View, isCombinedView } from '@banyuan/canvas'

/**
 * 逐层激活机制：根据点击的 View 和当前激活状态，决定应该被 select 的目标。
 *
 * 规则：
 * 1. 沿 parent 链向上如果没有任何已激活的容器 → 激活最顶层的组合容器
 * 2. 有已激活的祖先：
 *    - 如果已激活的不是组合容器 → 激活那个已激活容器的父容器
 *    - 如果已激活的是组合容器 → 激活点击容器的父容器
 * 3. 点击容器的直接父容器已激活 → 直接激活点击容器本身
 * 4. 点击容器的父容器下有兄弟已激活 → 直接激活点击容器本身（等同于父容器已进入）
 */
export function resolveActivationTarget(clickedView: View): View {
  const parent = clickedView.parent;

  if (parent && parent instanceof View && parent.actived) {
    return clickedView;
  }

  if (parent && parent instanceof View) {
    const hasSiblingActived = parent.children.some(
      (child) => child !== clickedView && child.actived,
    );
    if (hasSiblingActived) {
      return clickedView;
    }
  }

  let topCombinedView: View | null = null;
  let activatedAncestor: View | null = null;
  let current = clickedView.parent;
  while (current && current instanceof View) {
    if (isCombinedView(current)) {
      topCombinedView = current as View;
    }
    if (current.actived && !activatedAncestor) {
      activatedAncestor = current as View;
    }
    current = current.parent;
  }

  if (!activatedAncestor) {
    return topCombinedView ?? clickedView;
  }

  if (isCombinedView(activatedAncestor)) {
    return (parent instanceof View ? parent : clickedView) as View;
  } else {
    const activatedParent = activatedAncestor.parent;
    return (activatedParent instanceof View ? activatedParent : clickedView) as View;
  }
}
