/**
 * 构建任务（PackageTask）类型定义
 *
 * 将构建任务状态持久化到 MongoDB，解决进程重启后任务状态丢失的问题。
 * 前端轮询 /build/:taskId 时，即使进程重启也能从 DB 恢复任务状态。
 */

export type PackagePlatform = 'mac' | 'win' | 'linux'
export type PackageStatus = 'pending' | 'running' | 'success' | 'failed'

export interface IPackageTask {
  /** 任务 UUID */
  taskId: string
  /** 应用名称 */
  appName: string
  /** 目标平台 */
  platform: PackagePlatform
  /** 任务状态 */
  status: PackageStatus
  /** 构建产物文件路径（success 时填充） */
  outputFile?: string
  /** 错误信息（failed 时填充） */
  error?: string
  /** 创建时间 */
  createdAt: Date
  /** 更新时间 */
  updatedAt: Date
}
