import { createCanvas, loadImage } from 'canvas'
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import type { IPrintConfig, IPrintField } from '../../models/Template'

type Ctx2D = ReturnType<ReturnType<typeof createCanvas>['getContext']>

/**
 * ImageComposer
 * 职责：将背景位图 + 动态字段数据合成为最终打印位图
 *
 * 输入：IPrintConfig（含背景图和字段描述）+ 业务数据 Record<string, string>
 * 输出：合成后的 PNG Buffer
 */

/**
 * 在指定区域内绘制多行文本
 */
function drawTextField(
  ctx: Ctx2D,
  text: string,
  field: IPrintField
): void {
  const { bounds, textStyle } = field
  if (!textStyle) return

  const { fontSize, fontWeight, align, overflow } = textStyle
  ctx.font = `${fontWeight} ${fontSize}px sans-serif`
  ctx.fillStyle = '#000000'
  ctx.textAlign = align
  ctx.textBaseline = 'top'

  const lineHeight = Math.round(fontSize * 1.4)
  const lines = text.split('\n')
  let y = bounds.y

  // 根据对齐方式确定 x 坐标
  let x = bounds.x
  if (align === 'center') x = bounds.x + bounds.width / 2
  else if (align === 'right') x = bounds.x + bounds.width

  for (const line of lines) {
    if (y + lineHeight > bounds.y + bounds.height) break

    let drawLine = line

    if (overflow === 'ellipsis') {
      while (ctx.measureText(drawLine).width > bounds.width && drawLine.length > 1) {
        drawLine = drawLine.slice(0, -1)
      }
      if (drawLine !== line) drawLine += '…'
    } else if (overflow === 'shrink') {
      // 缩小字号直到适合
      let currentSize = fontSize
      while (ctx.measureText(drawLine).width > bounds.width && currentSize > 6) {
        currentSize -= 1
        ctx.font = `${fontWeight} ${currentSize}px sans-serif`
      }
    }
    // clip: 不处理，超出自然被裁剪

    ctx.fillText(drawLine, x, y, bounds.width)
    y += lineHeight

    // 恢复原始字体（shrink 可能改过）
    ctx.font = `${fontWeight} ${fontSize}px sans-serif`
  }
}

/**
 * 生成条码并绘制到画布指定区域
 */
function drawBarcodeField(
  ctx: Ctx2D,
  value: string,
  field: IPrintField
): void {
  const { bounds, codeStyle } = field
  const format = codeStyle?.format ?? 'CODE128'

  // 在临时 canvas 上生成条码
  const barcodeCanvas = createCanvas(bounds.width, bounds.height)
  try {
    JsBarcode(barcodeCanvas, value, {
      format,
      width: 2,
      height: bounds.height - 10,
      displayValue: false,
      margin: 0,
    })
  } catch {
    // 如果编码失败（如格式不匹配），回退为文本
    drawTextField(ctx, value, field)
    return
  }

  // 将条码绘制到目标区域（居中适配）
  const scaleX = bounds.width / barcodeCanvas.width
  const scaleY = bounds.height / barcodeCanvas.height
  const scale = Math.min(scaleX, scaleY, 1) // 不放大，只缩小
  const drawWidth = barcodeCanvas.width * scale
  const drawHeight = barcodeCanvas.height * scale
  const offsetX = bounds.x + (bounds.width - drawWidth) / 2
  const offsetY = bounds.y + (bounds.height - drawHeight) / 2

  ctx.drawImage(barcodeCanvas, offsetX, offsetY, drawWidth, drawHeight)
}

/**
 * 生成二维码并绘制到画布指定区域
 */
async function drawQrcodeField(
  ctx: Ctx2D,
  value: string,
  field: IPrintField
): Promise<void> {
  const { bounds, codeStyle } = field
  const errorLevel = codeStyle?.errorLevel ?? 'M'

  // 使用 qrcode 库生成 PNG Buffer
  const size = Math.min(bounds.width, bounds.height)
  const qrBuffer = await QRCode.toBuffer(value, {
    errorCorrectionLevel: errorLevel,
    width: size,
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' },
  })

  // 加载二维码图片并绘制到指定区域（居中）
  const qrImage = await loadImage(qrBuffer)
  const drawSize = Math.min(bounds.width, bounds.height)
  const offsetX = bounds.x + (bounds.width - drawSize) / 2
  const offsetY = bounds.y + (bounds.height - drawSize) / 2

  ctx.drawImage(qrImage, offsetX, offsetY, drawSize, drawSize)
}

/**
 * 合成最终打印位图
 * @param printConfig 打印模板配置（含背景图和字段描述）
 * @param data 业务数据（key → 渲染文本）
 * @returns PNG 图片 Buffer
 */
export async function compose(
  printConfig: IPrintConfig,
  data: Record<string, string>
): Promise<Buffer> {
  const { backgroundImage, backgroundSize, fields } = printConfig

  // 创建画布
  const canvas = createCanvas(backgroundSize.width, backgroundSize.height)
  const ctx = canvas.getContext('2d')

  // 绘制背景图（支持 Base64 data URL 和 http URL）
  const bg = await loadImage(backgroundImage)
  ctx.drawImage(bg, 0, 0, backgroundSize.width, backgroundSize.height)

  // 逐字段绘制动态数据
  for (const field of fields) {
    const value = data[field.key] ?? field.defaultValue ?? ''
    if (!value) continue

    switch (field.type) {
      case 'text':
        drawTextField(ctx, value, field)
        break
      case 'barcode':
        drawBarcodeField(ctx, value, field)
        break
      case 'qrcode':
        await drawQrcodeField(ctx, value, field)
        break
    }
  }

  // 返回 PNG Buffer
  return canvas.toBuffer('image/png')
}
