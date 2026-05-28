import { View, isCombinedView } from '@banyuan/banvasgl'

/**
 * 逐层激活机制：根据点击的 View 和当前激活状态，决定应该被 select 的目标。
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
