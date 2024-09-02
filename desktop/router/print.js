const Router = require('koa-router')
const PrintController = require('../controllers/Print')

const router = Router({
  prefix: '/api/print',
})

router.post('/', PrintController.print)

module.exports = router
