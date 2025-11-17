import { Point3 } from "@/core/math";
import { PointUtils } from "@/core/graph/utils/PointUtils";

/**
 * 单击判定：按下/抬起位置距离和时间阈值
 */
export const isSingleClick = (downPoint: Point3, upPoint: Point3): boolean => {
  return PointUtils.isSamePoint(downPoint, upPoint);
};

/**
 * 双击判定：两次点击的时间与空间阈值
 */
export const isDoubleClick = (
  downPoint: Point3,
  upPoint: Point3,
  lastClickTime: number | undefined,
  tolerance: number = 300
): boolean => {
  return isSingleClick(downPoint, upPoint) && !!lastClickTime && Date.now() - lastClickTime < tolerance;
};
