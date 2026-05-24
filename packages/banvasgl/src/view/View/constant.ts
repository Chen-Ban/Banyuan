/**
 * View 模块常量与默认值定义
 *
 * 将 View 类中使用的纯数据常量、默认值工厂集中管理，
 * 保持 View.ts 聚焦于类逻辑本身。
 */

import type { IViewEvents, IViewLifetimes } from '@/types'

// ── 默认事件与生命周期 ────────────────────────────────────────────────────────

/**
 * 创建默认事件对象（每次返回新引用，避免实例间共享污染）
 */
export function createDefaultEvents(): IViewEvents {
  return {
    // 点击类
    onClick: null,
    onDoubleClick: null,
    onContextMenu: null,
    // 鼠标移动类
    onMouseEnter: null,
    onMouseLeave: null,
    onMouseMove: null,
    onMouseDown: null,
    onMouseUp: null,
    // 拖拽类
    onDragStart: null,
    onDrag: null,
    onDragEnd: null,
    // 焦点类
    onFocus: null,
    onBlur: null,
  }
}

/**
 * 创建默认生命周期对象（每次返回新引用，避免实例间共享污染）
 */
export function createDefaultLifetimes(): IViewLifetimes {
  return {
    onCreated: null,
    onAttach: null,
    onDestroy: null,
  }
}

// ── Resize 手柄映射 ──────────────────────────────────────────────────────────

/**
 * Resize 尺寸变化映射表
 *
 * 索引对应 BoundingBox 的 8 个手柄（顺时针从左上角开始）：
 * 0: 左上角, 1: 上中, 2: 右上角, 3: 右中,
 * 4: 右下角, 5: 下中, 6: 左下角, 7: 左中
 *
 * width/height 为 true 表示该方向参与尺寸变化
 */
export const RESIZE_SIZE_MAP = [
  { width: true, height: true },   // 0: 左上角
  { width: false, height: true },  // 1: 上中
  { width: true, height: true },   // 2: 右上角
  { width: true, height: false },  // 3: 右中

  { width: true, height: true },   // 4: 右下角
  { width: false, height: true },  // 5: 下中
  { width: true, height: true },   // 6: 左下角
  { width: true, height: false },  // 7: 左中
] as const

/**
 * Resize 起点偏移映射表
 *
 * 控制 resize 时是否需要移动视口起点。
 * 当拖拽手柄在固定点的左侧时需要移动 x，在上方时需要移动 y。
 *
 * 索引与 RESIZE_SIZE_MAP 一一对应。
 */
export const RESIZE_ORIGIN_MAP = [
  { x: true, y: true },   // 0: 左上角 → 起点x和y都要反向偏移
  { x: false, y: true },  // 1: 上中 → 只偏移y
  { x: false, y: true },  // 2: 右上角 → 只偏移y
  { x: false, y: false }, // 3: 右中 → 不偏移
  { x: false, y: false }, // 4: 右下角 → 不偏移
  { x: false, y: false }, // 5: 下中 → 不偏移
  { x: true, y: false },  // 6: 左下角 → 只偏移x
  { x: true, y: false },  // 7: 左中 → 只偏移x
] as const

// ── 滚动条 ───────────────────────────────────────────────────────────────────

/** 滚动条粗细（像素） */
export const SCROLLBAR_THICKNESS = 4
