const PrintService = require('../services/Print')

class PrintController {
  async print(ctx) {
    PrintService.print(ctx.request.body.imgData)
    ctx.body = {
      errno: 0,
      data: { flag: true },
    }
    ctx.status = 200
  }
}

module.exports = new PrintController()
