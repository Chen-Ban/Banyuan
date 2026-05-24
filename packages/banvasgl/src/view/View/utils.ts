/**
 * View 模块工具函数
 *
 * 存放从 View 类中提取的纯函数/辅助计算逻辑，
 * 不依赖 View 实例状态，便于单元测试和复用。
 */

// ────────────────────────────────────────────
//  Resize 辅助
// ────────────────────────────────────────────

/**
 * 计算单维度的 resize 增量。
 *
 * 尺寸变化方向由三个因素共同决定：
 * 1. 视口当前尺寸方向（正/负）
 * 2. 参考向量的方向（本地坐标系下容器的变化方向）
 * 3. 传入向量的方向（预期变化方向，拖拽方向）
 *
 * @param dimension - 视口当前维度值（width 或 height）
 * @param reference - 参考方向分量（dynamicPoint - fixedPoint 的对应分量）
 * @param delta - 本地坐标系下的位移分量
 * @returns 带正确方向的增量值
 */
export function calculateDimensionDelta(
  dimension: number,
  reference: number,
  delta: number,
): number {
  return Math.sign(dimension * reference * delta) * Math.abs(delta);
}

// ────────────────────────────────────────────
//  滚动条几何计算
// ────────────────────────────────────────────

export interface IScrollBarGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface IScrollBarResult {
  horizontal: IScrollBarGeometry | null;
  vertical: IScrollBarGeometry | null;
}

/**
 * 计算滚动条的几何参数（位置和尺寸）。
 *
 * 滚动条长度 = 视口尺寸² / 布局区域尺寸（等比例缩放）
 * 滚动条位置 = 根据滚动进度在视口范围内线性插值
 *
 * @param vp - 视口几何（x, y, width, height）
 * @param layoutArea - 布局区域几何（width, height）
 * @param scrollX - 当前水平滚动量（已 clamp）
 * @param scrollY - 当前垂直滚动量（已 clamp）
 * @param maxScrollX - 最大水平滚动量
 * @param maxScrollY - 最大垂直滚动量
 * @param thickness - 滚动条粗细（像素）
 */
export function calculateScrollBarGeometry(
  vp: { x: number; y: number; width: number; height: number },
  layoutArea: { width: number; height: number },
  scrollX: number,
  scrollY: number,
  maxScrollX: number,
  maxScrollY: number,
  thickness: number,
): IScrollBarResult {
  let horizontal: IScrollBarGeometry | null = null;
  let vertical: IScrollBarGeometry | null = null;

  // 水平滚动条
  if (maxScrollX > 0) {
    const ratio = Math.abs(vp.width) / Math.abs(layoutArea.width);
    const barWidth = vp.width * ratio;
    const travel = Math.abs(vp.width) - Math.abs(barWidth);
    const progress = scrollX / maxScrollX;
    const barX = vp.x + Math.sign(vp.width) * progress * travel;
    const barHeight = thickness * Math.sign(vp.height);
    const barY = vp.y + vp.height - barHeight;
    horizontal = { x: barX, y: barY, width: barWidth, height: barHeight };
  }

  // 垂直滚动条
  if (maxScrollY > 0) {
    const ratio = Math.abs(vp.height) / Math.abs(layoutArea.height);
    const barHeight = vp.height * ratio;
    const travel = Math.abs(vp.height) - Math.abs(barHeight);
    const progress = scrollY / maxScrollY;
    const barY = vp.y + Math.sign(vp.height) * progress * travel;
    const barWidth = thickness * Math.sign(vp.width);
    const barX = vp.x + vp.width - barWidth;
    vertical = { x: barX, y: barY, width: barWidth, height: barHeight };
  }

  return { horizontal, vertical };
}
