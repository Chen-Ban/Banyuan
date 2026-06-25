import crypto from 'node:crypto'
import Router from '@koa/router'
import sharp from 'sharp'
import applicationService from '../services/ApplicationService.js'
import ossService from '../services/OssService.js'
import { appOwnership } from '../middleware/appOwnership.js'

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
router.post('/:id/thumbnail', appOwnership, async (ctx) => {
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
      fit: 'inside', // 保持比例，长边不超过 max
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

/**
 * POST /api/applications/:id/upload/presign
 *
 * 获取 OSS 预签名 PUT URL，前端直传图片到 OSS。
 *
 * 请求体：{ filename: string, contentType?: string }
 * 响应：{ signedUrl: string, publicUrl: string }
 *
 * 前端流程：
 *   1. 调用此接口获取 signedUrl + publicUrl
 *   2. 用 signedUrl 直接 PUT 上传文件到 OSS
 *   3. 上传成功后，将 publicUrl 作为图片 URL 传给 AI 接口
 */
router.post('/:id/upload/presign', appOwnership, async (ctx) => {
  const { id } = ctx.params
  const { filename, contentType } = ctx.request.body as {
    filename?: string
    contentType?: string
  }

  if (!filename || typeof filename !== 'string') {
    ctx.status = 400
    ctx.body = { success: false, message: 'filename is required' }
    return
  }

  // 检查应用是否存在
  const application = await applicationService.getApplicationById(id)
  if (!application) {
    ctx.status = 404
    ctx.body = { success: false, message: 'Application not found' }
    return
  }

  // 生成唯一的 objectKey：chat-images/{appId}/{uuid}.{ext}
  const ext = filename.split('.').pop() ?? 'png'
  const uniqueId = crypto.randomUUID()
  const objectKey = `chat-images/${id}/${uniqueId}.${ext}`

  try {
    const { signedUrl, publicUrl } = await ossService.signPutUrl(objectKey)
    ctx.body = {
      success: true,
      data: { signedUrl, publicUrl, contentType: contentType ?? 'image/png' },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    ctx.status = 500
    ctx.body = { success: false, message: `OSS presign failed: ${message}` }
  }
})

export { router as uploadRouter }
