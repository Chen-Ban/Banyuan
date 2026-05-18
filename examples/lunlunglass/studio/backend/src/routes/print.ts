import Router from '@koa/router'
import printController from '../controllers/PrintController.js'

const router = new Router({ prefix: '/api/print' })

/** POST /api/print/sample — 打印样张 */
router.post('/sample', printController.printSample.bind(printController))

/** GET /api/print/config — 获取打印机配置 */
router.get('/config', printController.getPrinterConfig.bind(printController))

/** PUT /api/print/config — 更新打印机配置 */
router.put('/config', printController.updatePrinterConfig.bind(printController))

export default router
