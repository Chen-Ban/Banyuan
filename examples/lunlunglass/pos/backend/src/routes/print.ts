import Router from '@koa/router'
import printController from '../controllers/PrintController.js'

const router = new Router({ prefix: '/api' })

/**
 * POST /api/print
 * 执行打印（接收 snapshotId + orderId，从本地配置读取打印机信息）
 */
router.post('/print', printController.print.bind(printController))

/**
 * POST /api/print/preview
 * 预览合成图片（不发送打印）
 */
router.post('/print/preview', printController.preview.bind(printController))

/**
 * GET /api/print/config
 * 读取打印机配置
 */
router.get('/print/config', printController.getPrinterConfig.bind(printController))

/**
 * PUT /api/print/config
 * 保存打印机配置
 */
router.put('/print/config', printController.savePrinterConfig.bind(printController))

/**
 * POST /api/print/config/test
 * 测试打印机连接
 */
router.post('/print/config/test', printController.testPrinterConnection.bind(printController))

/**
 * GET /api/templates/snapshots
 * 获取本地已同步的模板快照列表
 */
router.get('/templates/snapshots', printController.getSnapshots.bind(printController))

/**
 * POST /api/templates/sync
 * 手动触发从 Studio 拉取最新已发布模板
 */
router.post('/templates/sync', printController.syncTemplates.bind(printController))

export default router
