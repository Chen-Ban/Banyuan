import Router from '@koa/router'
import sharp from 'sharp'
import applicationService from '../services/ApplicationService.js'
import ossService from '../services/OssService.js'

const router = new Router({ prefix: '/api/applications' })

/** 缩略图最大尺寸（长边不超过此值） */
const THUMBNAIL_MAX_SIZE = 480
/** WebP 压缩质量（0-100） */
const THUMBNAIL_QUALITY = 75

/**
 * POST /api/applications/:id/thumbnail
 *
 * 上传应用缩略图（multipart/form-data，字段名 file）。
 * 压缩为 WebP 格式（最大 480px，质量 75），上传到 OSS，更新数据库。
 */
router.post('/:id/thumbnail', async (ctx) => {
  const { id } = ctx.params

  // 检查应用是否存在
  const application = await applicationService.getApplicationById(id)
  if (!application) {
    ctx.status = 404
    ctx.body = { success: false, message: 'Application not found' }
    return
  }

  // 获取上传文件
  const files = ctx.request.files
  const file = files?.file
  if (!file || Array.isArray(file)) {
    ctx.status = 400
    ctx.body = { success: false, message: 'A single file field named "file" is required' }
    return
  }

  // 使用 sharp 压缩：缩小尺寸 + 转 WebP
  const compressedBuffer = await sharp(file.filepath)
    .resize(THUMBNAIL_MAX_SIZE, THUMBNAIL_MAX_SIZE, {
      fit: 'inside',          // 保持比例，长边不超过 max
      withoutEnlargement: true, // 小图不放大
    })
    .webp({ quality: THUMBNAIL_QUALITY })
    .toBuffer()

  // 生成 OSS 存储路径
  const objectKey = `thumbnails/${id}_${Date.now()}.webp`

  // 上传到 OSS
  const thumbnailUrl = await ossService.uploadBuffer(objectKey, compressedBuffer)

  // 更新数据库
  await applicationService.updateApplication(id, { thumbnail: thumbnailUrl })

  ctx.status = 200
  ctx.body = {
    success: true,
    data: { thumbnail: thumbnailUrl },
    message: 'Thumbnail uploaded successfully',
  }
})

export { router as uploadRouter }
