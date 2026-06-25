/**
 * resolveActivationTarget —— 逐层激活机制
 *
 * 用于 Design 模式的视图选中策略：
 * 当用户点击一个嵌套在容器内的视图时，并非直接选中该视图，
 * 而是根据当前容器的激活状态逐层穿透，决定实际应当被选中的目标。
 *
 * 规则：
 * 1. 如果父容器已经 actived → 直接选中被点击视图（已深入编辑）
 * 2. 如果父容器是 ContainerView 且有其他兄弟已 actived → 直接选中被点击视图（同级切换）
 * 3. 否则向上查找最外层未激活的 CombinedView / 已激活祖先，决定穿透层级
 */

import { isView, isContainerView, isCombinedView } from '@banyuan/banvasgl'
import type { View } from '@banyuan/banvasgl'

export function resolveActivationTarget(clickedView: View): View {
  const parent = clickedView.parent

  // 获取 parent 作为 IView（Scene 节点则为 null）
  const parentView = isView(parent) ? (parent as View) : null

  // 规则 1：父容器已 actived → 直接选中被点击视图
  if (parentView && parentView.actived) {
    return clickedView
  }

  // 规则 2：父容器是 ContainerView 且有兄弟已 actived → 直接选中
  if (parentView && isContainerView(parentView)) {
    const hasSiblingActived = parentView.children.some(
      (child) => child.id !== clickedView.id && child.actived,
    )
    if (hasSiblingActived) {
      return clickedView
    }
  }

  // 规则 3：向上查找最外层 CombinedView / 已激活祖先
  let topCombinedView: View | null = null
  let activatedAncestor: View | null = null
  let current = clickedView.parent

  while (isView(current)) {
    const currentView = current as View
    if (isCombinedView(current)) {
      topCombinedView = currentView
    }
    if (currentView.actived && !activatedAncestor) {
      activatedAncestor = currentView
    }
    current = currentView.parent
  }

  if (!activatedAncestor) {
    return topCombinedView ?? clickedView
  }

  if (isCombinedView(activatedAncestor)) {
    return parentView ?? clickedView
  } else {
    const activatedParent = activatedAncestor.parent
    const activatedParentView = isView(activatedParent) ? (activatedParent as View) : null
    return activatedParentView ?? clickedView
  }
}
