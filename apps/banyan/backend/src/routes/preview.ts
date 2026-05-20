import Router from '@koa/router'
import { createPreview, getPreview, buildPreviewHtml } from '../services/preview/index.js'

/**
 * 预览路由（不挂在 /api/v1 下，因为 GET 需要直接返回 HTML）
 *
 * POST /preview
 *   Body: { appJson: string, width: number, height: number, canvasVersion: string }
 *   Response 201: { success: true, previewId: string, url: string }
 *
 * GET /preview/:previewId
 *   Response 200: text/html（可直接在 iframe 或浏览器标签页中打开）
 */
const router = new Router({ prefix: '/preview' })

router.post('/', async (ctx) => {
  const { appJson, width, height, canvasVersion } = ctx.request.body as {
    appJson?: string
    width?: number
    height?: number
    canvasVersion?: string
  }

  if (!appJson || typeof appJson !== 'string') {
    ctx.status = 400
    ctx.body = { success: false, error: 'appJson is required' }
    return
  }
  if (!width || !height || width <= 0 || height <= 0) {
    ctx.status = 400
    ctx.body = { success: false, error: 'width and height must be positive numbers' }
    return
  }
  if (!canvasVersion || typeof canvasVersion !== 'string') {
    ctx.status = 400
    ctx.body = { success: false, error: 'canvasVersion is required (e.g. "0.1.0")' }
    return
  }

  try {
    JSON.parse(appJson)
  } catch {
    ctx.status = 400
    ctx.body = { success: false, error: 'appJson is not valid JSON' }
    return
  }

  const previewId = createPreview(appJson, Number(width), Number(height), canvasVersion)

  const origin = `${ctx.protocol}://${ctx.host}`
  const url = `${origin}/preview/${previewId}`

  ctx.status = 201
  ctx.body = { success: true, previewId, url }
})

router.get('/:previewId', async (ctx) => {
  const { previewId } = ctx.params
  const data = getPreview(previewId)

  if (!data) {
    ctx.status = 404
    ctx.body = 'Preview not found or expired'
    return
  }

  ctx.type = 'text/html; charset=utf-8'
  ctx.body = buildPreviewHtml(data)
})

export default router
