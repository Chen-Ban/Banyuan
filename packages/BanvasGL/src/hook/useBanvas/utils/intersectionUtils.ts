import View from "@/core/views/View";
import { Rectangle } from "@/core/graph/combined/Polygon";
import { IntersectionUtils } from "@/core/graph/utils/IntersectionUtils";
import { isTextView, isGraphView, isCombinedView, isImageView, isVideoView, isSelectBoxView } from "@/core/views/utils/typeGuards";

/**
 * 检查视图是否与框选矩形相交
 * 注意：selectionRect 已经在世界坐标系下，需要将检测图形变换到世界坐标系进行检测
 * 除了图形容器外，其他容器都是检测两矩形相交，图形容器可能涉及其他图形
 */
export const checkViewIntersection = (view: View, selectionRect: Rectangle): boolean => {
  // 跳过框选矩形本身
  if (isSelectBoxView(view)) {
    return false;
  }

  // 跳过已激活的容器
  if (view.actived) {
    return false;
  }

  // 获取视图的世界变换矩阵
  const worldMatrix = view.getWorldMatrix();

  // 文本容器：检查文字、段落和布局区域的相交情况
  if (isTextView(view)) {
    // 检查布局区域
    if (view.layoutArea) {
      const layoutRect = view.layoutArea.copy().transform(worldMatrix);
      if (IntersectionUtils.intersects(selectionRect, layoutRect)) {
        return true;
      }
    }

    // 检查所有段落
    for (const paragraph of view.content) {
      const paragraphBounds = paragraph.getBounds();
      if (!paragraphBounds.isEmpty) {
        const paragraphRect = Rectangle.fromBounds(paragraphBounds);
        paragraphRect.transform(worldMatrix);
        if (IntersectionUtils.intersects(selectionRect, paragraphRect)) {
          return true;
        }
      }
    }
    return false;
  }

  // 图形容器：计算content的相交情况
  if (isGraphView(view)) {
    if (view.content) {
      const worldGraph = view.content.copy();
      worldGraph.transform(worldMatrix);
      return IntersectionUtils.intersects(selectionRect, worldGraph);
    }
    return false;
  }

  // 其他类型(组合容器、媒体容器或其他容器)：使用包围盒检查
  const bounds = view.getBounds();
  if (bounds) {
    const boundsRect = Rectangle.fromBounds(bounds).transform(worldMatrix);
    return IntersectionUtils.intersects(selectionRect, boundsRect);
  }

  return false;
};
