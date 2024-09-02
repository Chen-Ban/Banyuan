const ArchiveServices = require('../services/Archive')

class ArchiveController {
  /**
   * 根据档案id查询档案
   * @param {*} ctx
   * @param {*} next
   */
  async getSingleArchive(ctx, next) {
    const archiveId = ctx.params.archiveId

    const archive = await ArchiveServices.getSingleArchive(archiveId)
    ctx.status = 200
    ctx.body = {
      errno: 0,
      data: { archive },
      msg: '',
    }
  }
  /**
   * 新增某个用户的档案
   * @param {*} ctx
   * @param {*} next
   */
  async patchArchiveByCustomerId(ctx, next) {
    const { customerId, archive } = ctx.request.body

    await ArchiveServices.patchArchiveByCustomerId(
      customerId,

      archive,
    )
    ctx.status = 200
    ctx.body = {
      errno: 0,
      data: {
        patchNum: 1,
      },
    }
  }
}

module.exports = new ArchiveController()
