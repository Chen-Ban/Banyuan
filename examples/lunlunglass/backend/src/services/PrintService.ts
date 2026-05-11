/**
 * PrintService
 * 职责：编排打印流程 —— 数据解析 → 图像合成 → ESC/POS 编码 → 发送打印机
 *
 * 流程：
 * 1. 根据 templateId 获取模板的 printConfig
 * 2. 根据 templateId 获取字段映射配置（PrintFieldMapping）
 * 3. 从业务数据中按映射规则提取字段值
 * 4. 调用 ImageComposer 合成最终位图
 * 5. 调用 EscPosEncoder 编码为 ESC/POS 命令
 * 6. 调用 PrinterTransport 发送到打印机
 */

import { Template, PrintFieldMapping } from '../models'
import type { IPrintConfig } from '../models/Template'
import type { IFieldMappingRule } from '../models/PrintFieldMapping'
import { ImageComposer, EscPosEncoder, PrinterTransport } from './printer'
import type { TransportConfig } from './printer'

export interface PrintRequest {
  /** 模板 ID */
  templateId: string
  /** 业务原始数据（从数据库查出的完整对象） */
  businessData: Record<string, any>
  /** 打印机连接配置 */
  printer: TransportConfig
  /** 可选：指定映射配置 ID（不传则使用模板默认的第一条映射） */
  mappingId?: string
}

export interface PrintResult {
  success: boolean
  /** 合成图片的 PNG Buffer（可用于预览） */
  composedImage?: Buffer
  error?: string
}

/**
 * 根据映射规则从业务数据中提取字段值
 */
function resolveFieldValues(
  rules: IFieldMappingRule[],
  businessData: Record<string, any>
): Record<string, string> {
  const result: Record<string, string> = {}

  for (const rule of rules) {
    const sourceValues: string[] = rule.sources.map((source) => {
      // 支持嵌套字段路径，如 "items.0.name"
      const value = getNestedValue(businessData, `${source.collection}.${source.fieldPath}`)
      return value != null ? String(value) : ''
    })

    if (rule.template) {
      // 使用模板拼接，将 ${0}, ${1} 替换为对应 source 的值
      result[rule.fieldKey] = rule.template.replace(
        /\$\{(\d+)\}/g,
        (_, index) => sourceValues[parseInt(index, 10)] ?? ''
      )
    } else {
      // 没有模板，直接连接所有值
      result[rule.fieldKey] = sourceValues.join('')
    }
  }

  return result
}

/**
 * 获取嵌套对象值，支持 "a.b.0.c" 路径
 */
function getNestedValue(obj: any, path: string): any {
  const keys = path.split('.')
  let current = obj
  for (const key of keys) {
    if (current == null) return undefined
    current = current[key]
  }
  return current
}

/**
 * 执行打印
 */
export async function print(request: PrintRequest): Promise<PrintResult> {
  const { templateId, businessData, printer, mappingId } = request

  try {
    // 1. 获取模板
    const template = await Template.findOne({ id: templateId })
    if (!template) {
      return { success: false, error: `Template not found: ${templateId}` }
    }

    const printConfig = template.printConfig as IPrintConfig | null
    if (!printConfig) {
      return { success: false, error: `Template ${templateId} has no printConfig` }
    }

    // 2. 获取映射配置
    // TODO [多映射]: 当前不指定 mappingId 时取第一条匹配的映射，
    // 后续考虑在模板上记录 defaultMappingId，或增加排序策略（如按 createdAt 升序），
    // 避免同一模板多条映射配置时的不确定行为。
    const mappingQuery = mappingId
      ? { _id: mappingId }
      : { templateId }
    const mapping = await PrintFieldMapping.findOne(mappingQuery)
    if (!mapping) {
      return { success: false, error: `No field mapping found for template: ${templateId}` }
    }

    // 3. 解析字段值
    const fieldValues = resolveFieldValues(mapping.rules, businessData)

    // 4. 合成图像
    const pngBuffer = await ImageComposer.compose(printConfig, fieldValues)

    // 5. 编码为 ESC/POS 命令
    const escPosData = await EscPosEncoder.encode(pngBuffer)

    // 6. 发送到打印机
    await PrinterTransport.send(escPosData, printer)

    return { success: true, composedImage: pngBuffer }
  } catch (err: any) {
    return { success: false, error: err.message || String(err) }
  }
}

/**
 * 仅预览合成图片（不发送打印），用于前端预览
 */
export async function preview(
  templateId: string,
  businessData: Record<string, any>,
  mappingId?: string
): Promise<PrintResult> {
  try {
    const template = await Template.findOne({ id: templateId })
    if (!template) {
      return { success: false, error: `Template not found: ${templateId}` }
    }

    const printConfig = template.printConfig as IPrintConfig | null
    if (!printConfig) {
      return { success: false, error: `Template ${templateId} has no printConfig` }
    }

    const mappingQuery = mappingId
      ? { _id: mappingId }
      : { templateId }
    const mapping = await PrintFieldMapping.findOne(mappingQuery)
    if (!mapping) {
      return { success: false, error: `No field mapping found for template: ${templateId}` }
    }

    const fieldValues = resolveFieldValues(mapping.rules, businessData)
    const pngBuffer = await ImageComposer.compose(printConfig, fieldValues)

    return { success: true, composedImage: pngBuffer }
  } catch (err: any) {
    return { success: false, error: err.message || String(err) }
  }
}
