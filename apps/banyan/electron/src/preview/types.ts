/**
 * Preview Server 类型定义（可供前端 import 使用）
 *
 * 这些类型是 Electron IPC 通道的契约，前后端共享。
 */

export interface PreviewServerInput {
  appId: string
  appSlug?: string
  appJSON: Record<string, unknown>
  collectionSchemas: unknown[]
  cloudFunctions: unknown[]
}

export interface PreviewServerInfo {
  appId: string
  port: number
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'error'
  url: string
  createdAt: number
  updatedAt: number
  error?: string
}
