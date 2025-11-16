import View from "@/core/views/View";
import { Rectangle } from "@/core/graph/combined/Polygon";
import { IntersectionUtils } from "@/core/graph/utils/IntersectionUtils";
import { isTextView, isGraphView, isCombinedView, isImageView, isVideoView } from "@/core/views/utils/typeGuards";
import { isRectangle } from "@/core/graph/utils/typeGuards";

/**
 * 检查视图是否与框选矩形相交
 * 注意：selectionRect 已经在世界坐标系下，需要将图形变换到世界坐标系进行检测
 */
export const checkViewIntersection = (view: View, selectionRect: Rectangle): boolean => {
  // 跳过框选矩形本身
  if (isGraphView(view) && view.isSelectBox) {
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
      // 将布局区域矩形复制并变换到世界坐标系
      const layoutRect = view.layoutArea.copy();
      layoutRect.transform(worldMatrix);

      if (IntersectionUtils.intersects(selectionRect, layoutRect)) {
        return true;
      }
    }

    // 检查所有段落
    for (const paragraph of view.content) {
      // 先获取包围盒，转换为矩形，然后应用变换矩阵
      const paragraphBounds = paragraph.getBounds();
      if (!paragraphBounds.isEmpty) {
        const paragraphRect = Rectangle.fromBounds(paragraphBounds);
        const worldParagraphRect = paragraphRect.copy();
        worldParagraphRect.transform(worldMatrix);
        if (IntersectionUtils.intersects(selectionRect, worldParagraphRect)) {
          return true;
        }
      }

      // 检查段落中的所有文字元素
      for (const textElement of paragraph.texts) {
        // 先获取包围盒，转换为矩形，然后应用变换矩阵
        const elementBounds = textElement.getBounds();
        if (!elementBounds.isEmpty) {
          const elementRect = Rectangle.fromBounds(elementBounds);
          const worldElementRect = elementRect.copy();
          worldElementRect.transform(worldMatrix);
          if (IntersectionUtils.intersects(selectionRect, worldElementRect)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  // 图形容器：计算content的相交情况
  if (isGraphView(view)) {
    if (view.content) {
      // 将图形复制并变换到世界坐标系
      const worldGraph = view.content.copy();
      worldGraph.transform(worldMatrix);
      return IntersectionUtils.intersects(selectionRect, worldGraph);
    }
    return false;
  }

  // 组合容器：直接检查包围盒矩形相交（不递归检查子容器）
  if (isCombinedView(view)) {
    const bounds = view.getBounds();
    if (bounds) {
      // 将包围盒转换为矩形，然后应用变换矩阵
      const boundsRect = Rectangle.fromBounds(bounds);
      const worldRect = boundsRect.copy();
      worldRect.transform(worldMatrix);
      return IntersectionUtils.intersects(selectionRect, worldRect);
    }
    return false;
  }

  // 媒体容器（图像/视频）：计算和包围盒矩形的相交情况
  if (isImageView(view) || isVideoView(view)) {
    const bounds = view.getBounds();
    if (bounds) {
      // 将包围盒转换为矩形，然后应用变换矩阵
      const boundsRect = Rectangle.fromBounds(bounds);
      const worldRect = boundsRect.copy();
      worldRect.transform(worldMatrix);
      return IntersectionUtils.intersects(selectionRect, worldRect);
    }
    return false;
  }

  // 其他类型：使用包围盒检查
  const bounds = view.getBounds();
  if (bounds) {
    // 将包围盒转换为矩形，然后应用变换矩阵
    const boundsRect = Rectangle.fromBounds(bounds);
    const worldRect = boundsRect.copy();
    worldRect.transform(worldMatrix);
    return IntersectionUtils.intersects(selectionRect, worldRect);
  }

  return false;
};
