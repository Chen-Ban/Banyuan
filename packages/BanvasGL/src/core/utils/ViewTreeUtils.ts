import View from "@/core/views/View/View";
import type { ISceneNode, IView } from "../types";
import { TextView } from "../views";

/** 视图树节点：可以是 Scene、View 或任何实现了 IView 的对象 */
type TreeNode = ISceneNode | IView | View;

/**
 * 视图树工具类
 * 提供视图树相关的工具函数
 */
export class ViewTreeUtils {
  /**
   * 将树状结构的容器变成列表结构
   * 递归遍历所有子视图，返回扁平化的视图列表
   * @param root 根节点（Scene或View）
   * @returns 扁平化的视图列表
   */
  public static flattenViewTree(root: TreeNode): View[] {
    const views: View[] = [];

    // 递归遍历函数
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
  public static findViewPath(root: TreeNode, targetView: View): View[] | null {
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
  public static isViewInTree(root: TreeNode, targetView: View): boolean {
    const views = this.flattenViewTree(root);
    return views.includes(targetView);
  }

  /**
   * 获取树中所有视图的深度
   * @param root 根节点
   * @returns 视图深度映射表
   */
  public static getViewDepths(root: TreeNode): Map<View, number> {
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
  public static getActiveViews(root: TreeNode): View[] {
    const views = this.flattenViewTree(root);
    return views.filter((view) => view.actived);
  }

  /**
   * 获取树中所有选中的视图
   * @param root 根节点
   * @returns 选中的视图列表
   */
  public static getSelectedViews(root: TreeNode): View[] {
    const views = this.flattenViewTree(root);
    return views.filter((view) => view.selected);
  }

  /**
   * 清除树中所有视图的激活状态
   * @param root 根节点
   */
  public static clearActiveStates(root: TreeNode): void {
    const views = this.flattenViewTree(root);
    views.forEach((view) => {
      view.setActived(false);
    });
  }

  /**
   * 清除树中所有视图的选中状态
   * @param root 根节点
   */
  public static clearSelectedStates(root: TreeNode, view: View | undefined = undefined): void {
    const views = this.flattenViewTree(root);
    views.forEach((v) => {
      if (v === view) return;
      v.setSelected(false);
    });
  }

  /**
   * 清除树中所有视图的状态（激活和选中）
   * @param root 根节点
   */
  public static clearAllStates(root: TreeNode, view: View | undefined = undefined): void {
    const views = this.flattenViewTree(root);
    views.forEach((v) => {
      if (v === view) return;
      v.setActived(false);
      v.setSelected(false);

      if (v instanceof TextView) {
        v.setSelection(undefined, undefined);
      }
    });
  }
}
