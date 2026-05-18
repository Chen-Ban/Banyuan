import { get, post, put } from './client'
import type { ApiResponse } from './client'

/**
 * 模板快照摘要（不含背景图，用于列表展示）
 */
export interface TemplateSnapshotSummary {
  snapshotId: string
  templateId: string
  templateName: string
  thumbnail?: string
  version: number
  paperWidth: number
  publishedAt: string
}

/**
 * 打印机配置
 */
export interface PrinterConfig {
  type: 'tcp' | 'usb' | 'file'
  address: string
  timeout?: number
}

/**
 * 打印结果
 */
export interface PrintResultData {
  printJobId: string
}

/**
 * 同步结果
 */
export interface SyncResultData {
  synced: number
  skipped: number
  errors: string[]
}

// ─── 模板快照相关 ───────────────────────────────────

/**
 * 获取本地已同步的模板快照列表（供店员选择）
 */
export function fetchSnapshots(): Promise<ApiResponse<TemplateSnapshotSummary[]>> {
  return get<ApiResponse<TemplateSnapshotSummary[]>>('/templates/snapshots')
}

/**
 * 手动触发从 Studio 拉取最新已发布模板
 */
export function syncTemplates(): Promise<ApiResponse<SyncResultData>> {
  return post<ApiResponse<SyncResultData>>('/templates/sync', {})
}

// ─── 打印相关 ───────────────────────────────────────

/**
 * 打印标签
 * @param snapshotId 模板快照 ID
 * @param orderId 订单 ID
 */
export function printLabel(snapshotId: string, orderId: string): Promise<ApiResponse<PrintResultData>> {
  return post<ApiResponse<PrintResultData>>('/print', { snapshotId, orderId })
}

/**
 * 预览打印结果（返回 Base64 图片）
 */
export function previewPrint(snapshotId: string, orderId: string): Promise<ApiResponse<{ image: string }>> {
  return post<ApiResponse<{ image: string }>>('/print/preview', { snapshotId, orderId })
}

// ─── 打印机配置相关 ─────────────────────────────────

/**
 * 读取打印机配置
 */
export function getPrinterConfig(): Promise<ApiResponse<PrinterConfig>> {
  return get<ApiResponse<PrinterConfig>>('/print/config')
}

/**
 * 保存打印机配置
 */
export function savePrinterConfig(config: PrinterConfig): Promise<ApiResponse<PrinterConfig>> {
  return put<ApiResponse<PrinterConfig>>('/print/config', config)
}

/**
 * 测试连接结果
 */
export interface ConnectionTestResult {
  connected: boolean
  message: string
}

/**
 * 测试打印机连接
 * @param config 要测试的配置（不传则使用当前保存的配置）
 */
export function testPrinterConnection(config?: PrinterConfig): Promise<ApiResponse<ConnectionTestResult>> {
  return post<ApiResponse<ConnectionTestResult>>('/print/config/test', config ?? {})
}
