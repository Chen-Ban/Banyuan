/**
 * PrintService（POS 专用）
 *
 * 新架构打印流程（ADR-010）：
 * 1. 根据 snapshotId 获取本地模板快照
 * 2. 根据 orderId 查询订单，通过 order.userId 关联查出用户
 * 3. 构建打印上下文 { order, user }
 * 4. 按字段注册表的 dataPath 从上下文中取值
 * 5. 调用 @lunlunglass/printer 合成图像 → ESC/POS 编码 → 发送打印机
 *
 * 废弃：PrintFieldMapping 模型（旧架构）
 */

import { TemplateSnapshot, Order, User } from '../models/index.js'
import { getFieldByKey } from '../config/fields.js'
import { ImageComposer, EscPosEncoder, PrinterTransport } from '@lunlunglass/printer'
import type { TransportConfig, PrintConfig } from '@lunlunglass/printer'
import type { ISnapshotField } from '../models/TemplateSnapshot.js'

export interface PrintRequest {
  /** 模板快照 ID */
  snapshotId: string
  /** 订单 ID（业务 orderId 或 MongoDB _id） */
  orderId: string
  /** 打印机连接配置 */
  printer: TransportConfig
}

export interface PrintResult {
  success: boolean
  /** 合成图片的 PNG Buffer（可用于预览） */
  composedImage?: Buffer
  error?: string
}

/**
 * 获取嵌套对象值，支持 "a.b.0.c" 路径
 */
function getNestedValue(obj: unknown, path: string): unknown {
  const keys = path.split('.')
  let current: unknown = obj
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

/**
 * 从打印上下文中按字段注册表解析字段值
 */
function resolveFieldValues(
  fields: ISnapshotField[],
  context: { order: unknown; user: unknown }
): Record<string, string> {
  const result: Record<string, string> = {}

  for (const field of fields) {
    const fieldDef = getFieldByKey(field.key)
    if (!fieldDef) continue

    const value = getNestedValue(context, fieldDef.dataPath)
    result[field.key] = value != null ? String(value) : (field.defaultValue ?? '')
  }

  return result
}

/**
 * 执行打印
 */
export async function print(request: PrintRequest): Promise<PrintResult> {
  const { snapshotId, orderId, printer } = request

  try {
    // 1. 获取模板快照
    const snapshot = await TemplateSnapshot.findOne({ snapshotId }).lean()
    if (!snapshot) {
      return { success: false, error: `Snapshot not found: ${snapshotId}` }
    }

    // 2. 查询订单
    const { Types } = await import('mongoose')
    const order = Types.ObjectId.isValid(orderId)
      ? await Order.findById(orderId).lean()
      : await Order.findOne({ orderId }).lean()

    if (!order) {
      return { success: false, error: `Order not found: ${orderId}` }
    }

    // 3. 关联查出用户
    const user = await User.findById(order.userId).lean()
    if (!user) {
      return { success: false, error: `User not found for order: ${orderId}` }
    }

    // 4. 构建打印上下文
    const context = { order, user }

    // 5. 解析字段值
    const fieldValues = resolveFieldValues(snapshot.fields, context)

    // 6. 构建 PrintConfig（@lunlunglass/printer 格式）
    const printConfig: PrintConfig = {
      paperWidth: snapshot.paperWidth,
      dpi: snapshot.dpi,
      backgroundImage: snapshot.backgroundImage,
      backgroundSize: snapshot.backgroundSize,
      fields: snapshot.fields.map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        bounds: f.bounds,
        textStyle: f.textStyle,
        codeStyle: f.codeStyle,
        defaultValue: f.defaultValue,
      })),
    }

    // 7. 合成图像
    const pngBuffer = await ImageComposer.compose(printConfig, fieldValues)

    // 8. 编码为 ESC/POS 命令
    const escPosData = await EscPosEncoder.encode(pngBuffer)

    // 9. 发送到打印机
    await PrinterTransport.send(escPosData, printer)

    return { success: true, composedImage: pngBuffer }
  } catch (err: unknown) {
    const error = err as Error
    return { success: false, error: error.message || String(err) }
  }
}

/**
 * 仅预览合成图片（不发送打印）
 */
export async function preview(
  snapshotId: string,
  orderId: string
): Promise<PrintResult> {
  try {
    const snapshot = await TemplateSnapshot.findOne({ snapshotId }).lean()
    if (!snapshot) {
      return { success: false, error: `Snapshot not found: ${snapshotId}` }
    }

    const { Types } = await import('mongoose')
    const order = Types.ObjectId.isValid(orderId)
      ? await Order.findById(orderId).lean()
      : await Order.findOne({ orderId }).lean()

    if (!order) {
      return { success: false, error: `Order not found: ${orderId}` }
    }

    const user = await User.findById(order.userId).lean()
    if (!user) {
      return { success: false, error: `User not found for order: ${orderId}` }
    }

    const context = { order, user }
    const fieldValues = resolveFieldValues(snapshot.fields, context)

    const printConfig: PrintConfig = {
      paperWidth: snapshot.paperWidth,
      dpi: snapshot.dpi,
      backgroundImage: snapshot.backgroundImage,
      backgroundSize: snapshot.backgroundSize,
      fields: snapshot.fields.map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        bounds: f.bounds,
        textStyle: f.textStyle,
        codeStyle: f.codeStyle,
        defaultValue: f.defaultValue,
      })),
    }

    const pngBuffer = await ImageComposer.compose(printConfig, fieldValues)
    return { success: true, composedImage: pngBuffer }
  } catch (err: unknown) {
    const error = err as Error
    return { success: false, error: error.message || String(err) }
  }
}
