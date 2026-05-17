import { Context } from 'koa'
import * as printService from '../services/PrintService.js'
import * as templateSyncService from '../services/TemplateSyncService.js'

/**
 * 打印控制器（POS 专用，新架构）
 *
 * 接口设计（ADR-010）：
 * - POST /api/print：接收 snapshotId + orderId，后端完成动态渲染并打印
 * - POST /api/print/preview：预览合成图片（不发送打印）
 * - GET /api/templates/snapshots：本地已同步快照列表
 * - POST /api/templates/sync：手动触发从 Studio 拉取最新已发布模板
 */
class PrintController {
  /**
   * POST /api/print
   * 执行打印
   *
   * Body: {
   *   snapshotId: string
   *   orderId: string
   *   printer: { type: 'tcp'|'usb'|'file', address: string, timeout?: number }
   * }
   */
  async print(ctx: Context) {
    try {
      const body = ctx.request.body as Record<string, unknown>
      if (!body.snapshotId || !body.orderId || !body.printer) {
        ctx.status = 400
        ctx.body = { success: false, message: 'snapshotId, orderId, printer are required' }
        return
      }

      const result = await printService.print({
        snapshotId: body.snapshotId as string,
        orderId: body.orderId as string,
        printer: body.printer as Parameters<typeof printService.print>[0]['printer'],
      })

      if (!result.success) {
        ctx.status = 500
        ctx.body = { success: false, message: result.error }
        return
      }

      ctx.body = { success: true, message: 'Print job sent successfully' }
    } catch (error: unknown) {
      ctx.status = 500
      ctx.body = { success: false, message: (error as Error).message }
    }
  }

  /**
   * POST /api/print/preview
   * 预览合成图片（返回 PNG Base64）
   *
   * Body: { snapshotId: string, orderId: string }
   */
  async preview(ctx: Context) {
    try {
      const body = ctx.request.body as Record<string, unknown>
      if (!body.snapshotId || !body.orderId) {
        ctx.status = 400
        ctx.body = { success: false, message: 'snapshotId and orderId are required' }
        return
      }

      const result = await printService.preview(
        body.snapshotId as string,
        body.orderId as string
      )

      if (!result.success || !result.composedImage) {
        ctx.status = 500
        ctx.body = { success: false, message: result.error }
        return
      }

      ctx.body = {
        success: true,
        data: {
          image: `data:image/png;base64,${result.composedImage.toString('base64')}`,
        },
      }
    } catch (error: unknown) {
      ctx.status = 500
      ctx.body = { success: false, message: (error as Error).message }
    }
  }

  /**
   * GET /api/templates/snapshots
   * 获取本地已同步的模板快照列表（供店员选择）
   */
  async getSnapshots(ctx: Context) {
    try {
      const snapshots = await templateSyncService.getLocalSnapshots()
      ctx.body = { success: true, data: snapshots }
    } catch (error: unknown) {
      ctx.status = 500
      ctx.body = { success: false, message: (error as Error).message }
    }
  }

  /**
   * POST /api/templates/sync
   * 手动触发从 Studio 拉取最新已发布模板
   */
  async syncTemplates(ctx: Context) {
    try {
      const result = await templateSyncService.syncTemplates()
      ctx.body = {
        success: true,
        data: result,
        message: `Synced ${result.synced} templates, skipped ${result.skipped}`,
      }
    } catch (error: unknown) {
      ctx.status = 500
      ctx.body = { success: false, message: (error as Error).message }
    }
  }
}

export default new PrintController()
