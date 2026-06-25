import Bounds from '@/graph/base/Bounds'
import type { View } from '@/view'
import { Point3 } from '@/foundation/math'

export interface CacheEntry {
  viewId: string
  bounds: Bounds
}

/**
 * 维护场景中所有非活动 View 的世界坐标 AABB，用于吸附候选查找
 */
export class SnapCache {
  private entries: CacheEntry[] = []

  /**
   * 构建缓存：遍历 scene.children，排除当前操作的 view，
   * 将每个 view 的 viewport 通过 worldMatrix 变换为世界坐标 AABB
   */
  build(views: View[], excludeIds: Set<string>): void {
    this.entries = []
    for (const view of views) {
      if (excludeIds.has(view.id)) continue
      const bounds = this.computeWorldBounds(view)
      if (bounds) {
        this.entries.push({ viewId: view.id, bounds })
      }
    }
  }

  /** 获取所有缓存条目 */
  getAll(): CacheEntry[] {
    return this.entries
  }

  /**
   * 计算 View 的世界坐标 AABB
   * 通过 worldMatrix 变换 viewport 的四个角点，取 min/max
   */
  private computeWorldBounds(view: View): Bounds | null {
    const vp = view.viewport
    if (!vp || vp.width === 0 || vp.height === 0) return null

    const worldMatrix = view.getWorldMatrix()

    // viewport 四个角点（本地坐标）
    const corners = [
      new Point3(vp.x, vp.y, 0),
      new Point3(vp.right, vp.y, 0),
      new Point3(vp.right, vp.bottom, 0),
      new Point3(vp.x, vp.bottom, 0),
    ]

    // 变换到世界坐标，取 AABB
    const worldCorners = corners.map((p) => worldMatrix.multiply(p))
    return Bounds.fromPoints(worldCorners)
  }
}
