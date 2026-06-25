import { Context } from 'koa'

/**
 * 打印控制器（Studio 专用）
 *
 * 提供样张打印功能：接收前端合成的打印位图，
 * 通过 @lunlunglass/printer 发送到本地打印机。
 *
 * 打印机配置读取自 ~/.lunlunglass-studio/printer.json
 */
class PrintController {
  /**
   * POST /api/print/sample
   * 打印样张
   *
   * Body: {
   *   image: string       // 合成后的 PNG Base64 data URL
   *   width: number       // 图片宽度（像素）
   *   height: number      // 图片高度（像素）
   *   templateName: string // 模板名称（用于日志）
   * }
   */
  async printSample(ctx: Context) {
    try {
      const body = ctx.request.body as Record<string, unknown>

      if (!body.image || !body.width || !body.height) {
        ctx.status = 400
        ctx.body = {
          success: false,
          message: 'image, width, height are required',
        }
        return
      }

      const image = body.image as string
      const width = body.width as number
      const height = body.height as number
      const templateName = (body.templateName as string) || '未命名模板'

      // TODO: 读取 ~/.lunlunglass-studio/printer.json 获取打印机配置
      // TODO: 调用 @lunlunglass/printer 的 EscPosEncoder + PrinterTransport 发送打印
      //
      // 当前阶段：记录打印请求，返回成功（模拟打印）
      // 后续接入真实打印机时，替换为：
      //   1. const config = readPrinterConfig()
      //   2. const buffer = Buffer.from(image.split(',')[1], 'base64')
      //   3. const escPos = EscPosEncoder.encode(buffer, { width, height })
      //   4. await PrinterTransport.send(config, escPos)

      console.log(
        `[PrintController] 样张打印请求: template="${templateName}", size=${width}x${height}, imageSize=${image.length} bytes`,
      )

      ctx.body = {
        success: true,
        data: {
          message: `样张「${templateName}」已发送到打印机`,
          timestamp: new Date().toISOString(),
        },
      }
    } catch (error: unknown) {
      ctx.status = 500
      ctx.body = { success: false, message: (error as Error).message }
    }
  }

  /**
   * GET /api/print/config
   * 获取打印机配置
   *
   * 返回当前 Studio 的打印机连接配置。
   * 配置文件路径：~/.lunlunglass-studio/printer.json
   */
  async getPrinterConfig(ctx: Context) {
    try {
      // TODO: 读取 ~/.lunlunglass-studio/printer.json
      // 当前返回默认配置
      ctx.body = {
        success: true,
        data: {
          type: 'tcp',
          address: '',
          timeout: 5000,
          configured: false,
        },
      }
    } catch (error: unknown) {
      ctx.status = 500
      ctx.body = { success: false, message: (error as Error).message }
    }
  }

  /**
   * PUT /api/print/config
   * 更新打印机配置
   *
   * Body: {
   *   type: 'tcp' | 'usb'
   *   address: string
   *   timeout?: number
   * }
   */
  async updatePrinterConfig(ctx: Context) {
    try {
      const body = ctx.request.body as Record<string, unknown>

      if (!body.type || !body.address) {
        ctx.status = 400
        ctx.body = { success: false, message: 'type and address are required' }
        return
      }

      // TODO: 写入 ~/.lunlunglass-studio/printer.json
      console.log(`[PrintController] 更新打印机配置: type=${body.type}, address=${body.address}`)

      ctx.body = {
        success: true,
        data: {
          type: body.type,
          address: body.address,
          timeout: (body.timeout as number) ?? 5000,
          configured: true,
        },
      }
    } catch (error: unknown) {
      ctx.status = 500
      ctx.body = { success: false, message: (error as Error).message }
    }
  }
}

export default new PrintController()
