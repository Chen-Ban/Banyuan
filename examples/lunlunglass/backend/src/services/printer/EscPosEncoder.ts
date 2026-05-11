/**
 * EscPosEncoder
 * 职责：将 PNG 位图转换为 ESC/POS 栅格打印指令
 *
 * 核心命令：GS v 0 — 打印光栅位图
 * 格式：1D 76 30 m xL xH yL yH [数据]
 *   m = 模式（0 = 正常, 1 = 倍宽, 2 = 倍高, 3 = 四倍）
 *   xL xH = 水平方向字节数（width / 8）
 *   yL yH = 垂直方向点数（height）
 *   数据 = 每行 xL+xH*256 字节的位图行数据
 *
 * 输入：PNG Buffer
 * 输出：ESC/POS 命令 Buffer（可直接发送给打印机）
 */

import { createCanvas, loadImage } from 'canvas'

/** 灰度阈值，低于此值为黑色（热敏打印"热"的点） */
const THRESHOLD = 128

/**
 * 将 PNG 图片 Buffer 编码为 ESC/POS 光栅位图命令
 * @param pngBuffer PNG 图片数据
 * @returns ESC/POS 命令字节序列
 */
export async function encode(pngBuffer: Buffer): Promise<Buffer> {
  // 加载图片到 canvas 以获取像素数据
  const img = await loadImage(pngBuffer)
  const width = img.width
  const height = img.height

  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0)
  const imageData = ctx.getImageData(0, 0, width, height)
  const pixels = imageData.data // RGBA

  // 宽度对齐到 8 的倍数
  const alignedWidth = Math.ceil(width / 8) * 8
  const bytesPerRow = alignedWidth / 8

  // 转换为 1-bit 位图（每行 bytesPerRow 字节）
  const bitmapData = Buffer.alloc(bytesPerRow * height)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < alignedWidth; x++) {
      let isDark = false
      if (x < width) {
        const idx = (y * width + x) * 4
        const r = pixels[idx]
        const g = pixels[idx + 1]
        const b = pixels[idx + 2]
        const a = pixels[idx + 3]
        // 灰度公式 + alpha 考虑（alpha=0 视为白色）
        const gray = a === 0 ? 255 : Math.round(0.299 * r + 0.587 * g + 0.114 * b)
        isDark = gray < THRESHOLD
      }
      if (isDark) {
        const byteIndex = y * bytesPerRow + Math.floor(x / 8)
        const bitPosition = 7 - (x % 8)
        bitmapData[byteIndex] |= 1 << bitPosition
      }
    }
  }

  // 构建 ESC/POS 命令
  const commands: Buffer[] = []

  // 初始化打印机
  commands.push(Buffer.from([0x1b, 0x40])) // ESC @

  // 设置行距为 0（避免行间空隙）
  commands.push(Buffer.from([0x1b, 0x33, 0x00])) // ESC 3 0

  // GS v 0 光栅位图命令
  const xL = bytesPerRow & 0xff
  const xH = (bytesPerRow >> 8) & 0xff
  const yL = height & 0xff
  const yH = (height >> 8) & 0xff
  commands.push(Buffer.from([0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH]))
  commands.push(bitmapData)

  // 走纸 + 切纸
  commands.push(Buffer.from([0x1b, 0x64, 0x04])) // ESC d 4 (走纸 4 行)
  commands.push(Buffer.from([0x1d, 0x56, 0x42, 0x00])) // GS V B 0 (部分切纸)

  return Buffer.concat(commands)
}

/**
 * 仅做灰度→1bit 二值化（不含 ESC/POS 命令头），
 * 可用于调试或其他协议
 */
export async function toBitmap(pngBuffer: Buffer): Promise<{
  data: Buffer
  width: number
  height: number
  bytesPerRow: number
}> {
  const img = await loadImage(pngBuffer)
  const width = img.width
  const height = img.height

  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0)
  const imageData = ctx.getImageData(0, 0, width, height)
  const pixels = imageData.data

  const alignedWidth = Math.ceil(width / 8) * 8
  const bytesPerRow = alignedWidth / 8
  const bitmapData = Buffer.alloc(bytesPerRow * height)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < alignedWidth; x++) {
      let isDark = false
      if (x < width) {
        const idx = (y * width + x) * 4
        const r = pixels[idx]
        const g = pixels[idx + 1]
        const b = pixels[idx + 2]
        const a = pixels[idx + 3]
        const gray = a === 0 ? 255 : Math.round(0.299 * r + 0.587 * g + 0.114 * b)
        isDark = gray < THRESHOLD
      }
      if (isDark) {
        const byteIndex = y * bytesPerRow + Math.floor(x / 8)
        const bitPosition = 7 - (x % 8)
        bitmapData[byteIndex] |= 1 << bitPosition
      }
    }
  }

  return { data: bitmapData, width: alignedWidth, height, bytesPerRow }
}
