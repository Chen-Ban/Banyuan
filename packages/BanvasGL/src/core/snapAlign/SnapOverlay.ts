import { SnapAxis, type AxisSnap, type SnapResult } from './types'
import { Point3 } from '@/core/math'
import type Matrix4 from '@/core/math/Matrix4'

/**
 * 在主画布上绘制对齐辅助线
 * 在 scene.render() 之后调用，绘制在最上层
 */
export class SnapOverlay {
  private guideColor = '#FF2D9B'
  private lineWidth = 1

  private currentResult: SnapResult | null = null

  update(result: SnapResult | null): void {
    this.currentResult = result
  }

  clear(): void {
    this.currentResult = null
  }

  hasContent(): boolean {
    return this.currentResult !== null && this.currentResult.guidelines.length > 0
  }

  render(
    ctx: CanvasRenderingContext2D,
    vpMatrix: Matrix4,
    canvasWidth: number,
    canvasHeight: number
  ): void {
    if (!this.currentResult || this.currentResult.guidelines.length === 0) return

    ctx.save()
    ctx.lineWidth = this.lineWidth
    ctx.strokeStyle = this.guideColor
    ctx.setLineDash([])

    for (const guide of this.currentResult.guidelines) {
      this.renderGuideline(ctx, vpMatrix, guide, canvasWidth, canvasHeight)
    }

    ctx.restore()
  }

  private renderGuideline(
    ctx: CanvasRenderingContext2D,
    vpMatrix: Matrix4,
    guide: AxisSnap,
    canvasWidth: number,
    canvasHeight: number
  ): void {
    if (guide.axis === SnapAxis.X) {
      // 竖线：世界坐标 x = guideCoord，贯穿画布高度
      const screenPoint = vpMatrix.multiply(new Point3(guide.guideCoord, 0, 0))
      const screenX = screenPoint.x
      ctx.beginPath()
      ctx.moveTo(screenX, 0)
      ctx.lineTo(screenX, canvasHeight)
      ctx.stroke()
    } else {
      // 横线：世界坐标 y = guideCoord，贯穿画布宽度
      const screenPoint = vpMatrix.multiply(new Point3(0, guide.guideCoord, 0))
      const screenY = screenPoint.y
      ctx.beginPath()
      ctx.moveTo(0, screenY)
      ctx.lineTo(canvasWidth, screenY)
      ctx.stroke()
    }
  }
}
