import type Bounds from '@/core/graph/base/Bounds'
import type { CacheEntry } from './SnapCache'
import { SnapAxis, type AxisSnap } from './types'

/**
 * X/Y 轴独立的边/中点吸附求解器
 * 源的三条锚线（min/mid/max）与所有候选目标的三条锚线逐一比较，取最近的
 */
export class SnapSolver {
  constructor(private threshold: number = 3) {}

  solve(source: Bounds, candidates: CacheEntry[]): AxisSnap[] {
    const results: AxisSnap[] = []

    // 源的三条锚线
    const srcAnchorsX = [source.x, source.midX, source.right]
    const srcAnchorsY = [source.y, source.midY, source.bottom]

    let bestX: AxisSnap | null = null
    let bestDistX = this.threshold + 1

    let bestY: AxisSnap | null = null
    let bestDistY = this.threshold + 1

    for (const { bounds: target } of candidates) {
      const tgtAnchorsX = [target.x, target.midX, target.right]
      const tgtAnchorsY = [target.y, target.midY, target.bottom]

      // X 轴
      for (const srcCoord of srcAnchorsX) {
        for (const tgtCoord of tgtAnchorsX) {
          const dist = Math.abs(srcCoord - tgtCoord)
          if (dist < bestDistX) {
            bestDistX = dist
            bestX = { axis: SnapAxis.X, offset: tgtCoord - srcCoord, guideCoord: tgtCoord }
          }
        }
      }

      // Y 轴
      for (const srcCoord of srcAnchorsY) {
        for (const tgtCoord of tgtAnchorsY) {
          const dist = Math.abs(srcCoord - tgtCoord)
          if (dist < bestDistY) {
            bestDistY = dist
            bestY = { axis: SnapAxis.Y, offset: tgtCoord - srcCoord, guideCoord: tgtCoord }
          }
        }
      }
    }

    if (bestX && bestDistX <= this.threshold) results.push(bestX)
    if (bestY && bestDistY <= this.threshold) results.push(bestY)

    return results
  }
}
