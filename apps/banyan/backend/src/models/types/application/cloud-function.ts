/**
 * 云函数类型定义
 *
 * 每个云函数对应一个可视化编排的 FlowSchema，属于应用级资源，多页面共享。
 */

/** 云函数数据接口 */
export interface ICloudFunction {
  /** 云函数唯一标识（UUID） */
  functionId: string
  /** 所属应用 ID */
  appId: string
  /** 云函数名称（英文标识符，如 submitOrder） */
  name: string
  /** 显示名称（中文） */
  displayName: string
  /** 描述 */
  description: string
  /** FlowSchema JSON（{ nodes: [], edges: [] }） */
  flowSchema: Record<string, unknown>
  /** 版本号 */
  version: number
  createdAt: Date
  updatedAt: Date
}
