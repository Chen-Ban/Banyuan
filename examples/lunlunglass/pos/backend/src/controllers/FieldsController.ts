import { Context } from 'koa'
import { getFieldRegistry } from '../config/fields.js'

/**
 * 字段注册表控制器（POS 专用）
 *
 * 直接读取配置文件返回字段注册表，无需数据库查询。
 * Studio 后端通过代理调用此接口，Studio 前端不感知代理。
 */
class FieldsController {
  /**
   * GET /api/fields
   * 返回字段注册表（分组结构）
   */
  getFields(ctx: Context) {
    ctx.body = {
      success: true,
      data: getFieldRegistry(),
    }
  }
}

export default new FieldsController()
