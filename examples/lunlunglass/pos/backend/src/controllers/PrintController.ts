import { Context } from 'koa'
import * as printService from '../services/PrintService.js'
import * as templateSyncService from '../services/TemplateSyncService.js'
import * as printerConfigService from '../services/PrinterConfigService.js'
import { getFieldRegistry } from '../config/fields.js'

/**
 * 打印控制器（POS 专用，新架构）
 *
 * 接口设计（ADR-010 阶段三）：
 * - POST /api/print：接收 snapshotId + orderId，后端读取本地打印机配置完成打印
 * - POST /api/print/preview：预览合成图片（不发送打印）
 * - GET /api/fields：返回字段注册表
 * - GET /api/templates/snapshots：本地已同步快照列表
 * - POST /api/templates/sync：手动触发从 Studio 拉取最新已发布模板
 * - GET /api/print/config：读取打印机配置
 * - PUT /api/print/config：保存打印机配置
 * - POST /api/print/config/test：测试打印机连接
 */
class PrintController {
  /**
   * POST /api/print
   * 执行打印
   *
   * Body: { snapshotId: string, orderId: string }
   * Response: { success: true, printJobId: string }
   */
  async print(ctx: Context) {
    try {
      const body = ctx.request.body as Record<string, unknown>
      if (!body.snapshotId || !body.orderId) {
        ctx.status = 400
        ctx.body = { success: false, message: 'snapshotId and orderId are required' }
        return
      }

      const result = await printService.print({
        snapshotId: body.snapshotId as string,
        orderId: body.orderId as string,
      })

      if (!result.success) {
        ctx.status = 500
        ctx.body = { success: false, message: result.error }
        return
      }

      ctx.body = { success: true, printJobId: result.printJobId }
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
   * GET /api/fields
   * 返回字段注册表（供前端或调试使用）
   */
  async getFields(ctx: Context) {
    try {
      const registry = getFieldRegistry()
      ctx.body = { success: true, data: registry }
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

  /**
   * GET /api/print/config
   * 读取打印机配置
   */
  async getPrinterConfig(ctx: Context) {
    try {
      const config = printerConfigService.getConfig()
      ctx.body = { success: true, data: config }
    } catch (error: unknown) {
      ctx.status = 500
      ctx.body = { success: false, message: (error as Error).message }
    }
  }

  /**
   * PUT /api/print/config
   * 保存打印机配置
   *
   * Body: { type: 'tcp'|'usb'|'file', address: string, timeout?: number }
   */
  async savePrinterConfig(ctx: Context) {
    try {
      const body = ctx.request.body as Record<string, unknown>
      if (!body.type || !body.address) {
        ctx.status = 400
        ctx.body = { success: false, message: 'type and address are required' }
        return
      }

      const validTypes = ['tcp', 'usb', 'file']
      if (!validTypes.includes(body.type as string)) {
        ctx.status = 400
        ctx.body = { success: false, message: `type must be one of: ${validTypes.join(', ')}` }
        return
      }

      const config: printerConfigService.PrinterConfig = {
        type: body.type as 'tcp' | 'usb' | 'file',
        address: body.address as string,
        timeout: typeof body.timeout === 'number' ? body.timeout : undefined,
      }

      printerConfigService.saveConfig(config)
      ctx.body = { success: true, data: config, message: '打印机配置已保存' }
    } catch (error: unknown) {
      ctx.status = 500
      ctx.body = { success: false, message: (error as Error).message }
    }
  }

  /**
   * POST /api/print/config/test
   * 测试打印机连接
   *
   * Body: { type: 'tcp'|'usb'|'file', address: string, timeout?: number }
   * 如果不传 body，则使用当前保存的配置测试
   *
   * Response: { success: true, data: { connected: boolean, message: string } }
   */
  async testPrinterConnection(ctx: Context) {
    try {
      const body = ctx.request.body as Record<string, unknown> | undefined

      let config: printerConfigService.PrinterConfig
      if (body?.type && body?.address) {
        config = {
          type: body.type as 'tcp' | 'usb' | 'file',
          address: body.address as string,
          timeout: typeof body.timeout === 'number' ? body.timeout : undefined,
        }
      } else {
        config = printerConfigService.getConfig()
      }

      const result = await printerConfigService.testConnection(config)
      ctx.body = {
        success: true,
        data: { connected: result.success, message: result.message },
      }
    } catch (error: unknown) {
      ctx.status = 500
      ctx.body = { success: false, message: (error as Error).message }
    }
  }
}

export default new PrintController()
