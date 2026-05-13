import type { View } from '@/core/views'
import type Scene from '@/core/scene/Scene'
import { Point3 } from '@/core/math'
import Bounds from '@/core/graph/base/Bounds'
import { SnapCache } from './SnapCache'
import { SnapSolver } from './SnapSolver'
import { SnapOverlay } from './SnapOverlay'
import type { SnapResult } from './types'

export type { SnapResult } from './types'
export { SnapOverlay } from './SnapOverlay'

/**
 * 吸附对齐管理器
 * 生命周期：begin(mousedown) → snap(mousemove) → end(mouseup)
 */
export class SnapAlignManager {
  private cache = new SnapCache()
  private solver: SnapSolver
  public readonly overlay = new SnapOverlay()

  private activeIds = new Set<string>()
  private active = false

  constructor(threshold: number = 3) {
    this.solver = new SnapSolver(threshold)
  }

  /** 设置吸附阈值 */
  setThreshold(px: number): void {
    this.solver = new SnapSolver(px)
  }

  /**
   * mousedown 时调用：构建缓存，排除当前操作的 view
   */
  begin(scene: Scene, activeViews: View[]): void {
    this.activeIds = new Set(activeViews.map(v => v.id))
    this.cache.build(scene.children, this.activeIds)
    this.active = true
  }

  /**
   * mousemove 时调用：计算吸附偏移和对齐线
   * @param source 当前拖拽的主 view（用于计算世界 AABB）
   */
  snap(source: View): SnapResult {
    const empty: SnapResult = { offsetX: 0, offsetY: 0, guidelines: [] }
    if (!this.active) return empty

    const bounds = this.computeWorldBounds(source)
    if (!bounds) return empty

    const candidates = this.cache.getAll()
    const guidelines = this.solver.solve(bounds, candidates)

    let offsetX = 0
    let offsetY = 0

    const guideX = guidelines.find(g => g.axis === 0) // SnapAxis.X
    const guideY = guidelines.find(g => g.axis === 1) // SnapAxis.Y

    if (guideX) offsetX = guideX.offset
    if (guideY) offsetY = guideY.offset

    const result: SnapResult = { offsetX, offsetY, guidelines }
    this.overlay.update(result)
    return result
  }

  /**
   * mouseup 时调用：清理状态
   */
  end(): void {
    this.active = false
    this.activeIds.clear()
    this.overlay.clear()
  }

  /**
   * 计算 View 的世界坐标 AABB
   */
  private computeWorldBounds(view: View): Bounds | null {
    const vp = view.viewport
    if (!vp || vp.width === 0 || vp.height === 0) return null

    const worldMatrix = view.getWorldMatrix()
    const corners = [
      new Point3(vp.x, vp.y, 0),
      new Point3(vp.right, vp.y, 0),
      new Point3(vp.right, vp.bottom, 0),
      new Point3(vp.x, vp.bottom, 0),
    ]
    const worldCorners = corners.map(p => worldMatrix.multiply(p))
    return Bounds.fromPoints(worldCorners)
  }
}
