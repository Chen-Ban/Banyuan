import View from "@/view/View/View";
import CombinedView from "@/view/CombinedViews";
import { isTextView, isCombinedView, type ISceneNode, type IView } from "@/types";

/** 视图树节点：可以是 Scene、View 或任何实现了 IView 的对象 */
type TreeNode = ISceneNode | IView | View;

/**
 * 将树状结构的容器变成列表结构
 * 递归遍历所有子视图，返回扁平化的视图列表
 * @param root 根节点（Scene或View）
 * @returns 扁平化的视图列表
 */
export function flattenViewTree(root: TreeNode): View[] {
  const views: View[] = [];

  const traverse = (node: TreeNode) => {
    if (node.children) {
      for (const child of node.children) {
        views.push(child as View);
        traverse(child);
      }
    }
  };

  traverse(root);
  return views;
}

/**
 * 查找指定视图在树中的路径
 * @param root 根节点
 * @param targetView 目标视图
 * @returns 从根节点到目标视图的路径，如果未找到返回null
 */
export function findViewPath(root: TreeNode, targetView: View): View[] | null {
  const path: View[] = [];

  const findPath = (node: TreeNode, target: View): boolean => {
    if (node.children) {
      for (const child of node.children) {
        path.push(child as View);
        if (child === target || findPath(child, target)) {
          return true;
        }
        path.pop();
      }
    }
    return false;
  };

  return findPath(root, targetView) ? path : null;
}

/**
 * 检查视图是否在树中
 * @param root 根节点
 * @param targetView 目标视图
 * @returns 如果视图在树中返回true，否则返回false
 */
export function isViewInTree(root: TreeNode, targetView: View): boolean {
  return flattenViewTree(root).includes(targetView);
}

/**
 * 获取树中所有视图的深度
 * @param root 根节点
 * @returns 视图深度映射表
 */
export function getViewDepths(root: TreeNode): Map<View, number> {
  const depths = new Map<View, number>();

  const calculateDepth = (node: TreeNode, depth: number = 0) => {
    if (node.children) {
      for (const child of node.children) {
        depths.set(child as View, depth);
        calculateDepth(child, depth + 1);
      }
    }
  };

  calculateDepth(root);
  return depths;
}

/**
 * 获取树中所有激活的视图
 * @param root 根节点
 * @returns 激活的视图列表
 */
export function getActiveViews(root: TreeNode): View[] {
  return flattenViewTree(root).filter((view) => view.actived);
}

/**
 * 获取树中所有选中的视图
 * @param root 根节点
 * @returns 选中的视图列表
 */
export function getSelectedViews(root: TreeNode): View[] {
  return flattenViewTree(root).filter((view) => view.selected);
}

/**
 * 清除树中所有视图的激活状态
 * @param root 根节点
 */
export function clearActiveStates(root: TreeNode): void {
  flattenViewTree(root).forEach((view) => {
    view.setActived(false);
  });
}

/**
 * 清除树中所有视图的选中状态
 * @param root 根节点
 * @param excludeView 要排除的视图
 */
export function clearSelectedStates(root: TreeNode, excludeView: View | undefined = undefined): void {
  flattenViewTree(root).forEach((v) => {
    if (v === excludeView) return;
    v.setSelected(false);
  });
}

/**
 * 清除树中所有视图的状态（激活和选中）
 * @param root 根节点
 * @param excludeView 要排除的视图
 */
export function clearAllStates(root: TreeNode, excludeView: View | undefined = undefined): void {
  flattenViewTree(root).forEach((v) => {
    if (v === excludeView) return;
    v.setActived(false);
    v.setSelected(false);

    if (isTextView(v)) {
      (v as any).setSelection(undefined, undefined);
    }
  });
}

// ==================== 组合/取消组合（纯树操作） ====================

/** groupViews 的返回结果 */
export interface GroupResult {
  /** 新创建的 CombinedView */
  combined: CombinedView
  /** 插入位置的索引 */
  insertIndex: number
}

/**
 * 将多个 View 组合为一个 CombinedView（纯树操作，不含事务）。
 *
 * @param views 要组合的视图列表（必须拥有同一个父容器）
 * @param combined 已创建好的 CombinedView 实例
 * @param vpMatrix VP 矩阵，用于设置组合视图的视图投影矩阵
 * @returns 组合结果，或 null（不满足条件时）
 */
export function groupViews(
  views: View[],
  combined: CombinedView,
  vpMatrix: any
): GroupResult | null {
  if (views.length < 2) return null;

  // 校验：所有 view 必须拥有同一个父容器
  const parent = views[0].parent;
  if (!parent || !views.every((v) => v.parent === parent)) return null;

  const children = parent.children as View[];

  // 过滤出确实在当前 children 中的 view
  const validViews = views.filter((v) => children.includes(v));
  if (validViews.length < 2) return null;

  // 找到最高层级位置（最大 index），用于确定插入点
  let maxIndex = -1;
  for (const v of validViews) {
    const idx = children.indexOf(v);
    if (idx > maxIndex) maxIndex = idx;
  }

  // 从 children 中移除这些 view
  for (const v of validViews) {
    const idx = children.indexOf(v);
    if (idx > -1) {
      children.splice(idx, 1);
      v.parent = null;
    }
  }

  // 将 view 添加到 CombinedView
  for (const v of validViews) {
    combined.addChild(v);
  }

  // 根据子 View 计算组合容器的 viewport（子 View 的联合包围盒）
  const childrenBounds = combined.measureChildren();
  if (childrenBounds.width > 0 || childrenBounds.height > 0) {
    combined.viewport.x = childrenBounds.x;
    combined.viewport.y = childrenBounds.y;
    combined.viewport.width = childrenBounds.width;
    combined.viewport.height = childrenBounds.height;
    combined.boundingBox?.updateSize();
  }

  // 在原最高位置插入（考虑移除后 index 可能变小）
  const insertIndex = Math.min(maxIndex, children.length);
  children.splice(insertIndex, 0, combined);
  combined.parent = parent;
  combined.setVPMatrix(vpMatrix);
  combined.onAttach();

  return { combined, insertIndex };
}

/** ungroupView 的返回结果 */
export interface UngroupResult {
  /** 解散出的子 View 列表 */
  children: View[]
  /** CombinedView 被移除前的索引位置 */
  index: number
}

/**
 * 取消组合：将 CombinedView 解散，其子 View 回到父容器的 children 中（纯树操作，不含事务）。
 *
 * @param view 要解散的视图（必须是 CombinedView）
 * @param vpMatrix VP 矩阵，用于设置解散后子视图的视图投影矩阵
 * @returns 解散结果，或 null
 */
export function ungroupView(
  view: View,
  vpMatrix: any
): UngroupResult | null {
  if (!isCombinedView(view)) return null;

  const parent = view.parent;
  if (!parent) return null;

  const parentChildren = parent.children as View[];
  if (!parentChildren.includes(view)) return null;

  const index = parentChildren.indexOf(view);
  const childViews = [...view.children] as View[];

  // 从 CombinedView 中移除子 view
  for (const child of childViews) {
    (view as any).removeChild(child);
  }

  // 从 children 中移除 CombinedView
  parentChildren.splice(index, 1);
  view.parent = null;

  // 将子 view 按顺序插入到原位置
  for (let i = 0; i < childViews.length; i++) {
    const child = childViews[i];
    const insertAt = Math.min(index + i, parentChildren.length);
    parentChildren.splice(insertAt, 0, child);
    child.parent = parent;
    child.setVPMatrix(vpMatrix);
    child.onAttach();
  }

  return { children: childViews, index };
}
