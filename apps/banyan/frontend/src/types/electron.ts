/**
 * Electron API 类型定义
 *
 * 当运行在 Electron 环境中时，window.electronAPI 可用。
 * 纯 Web 模式（浏览器直接访问 :5174）时不可用。
 */

export interface PreviewServerInput {
  appId: string
  appSlug?: string
  uiJSON: Record<string, unknown>
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

export interface HotUpdatePatch {
  collections?: unknown[]
  cloudFunctions?: unknown[]
}

export interface ElectronPreviewAPI {
  start: (input: PreviewServerInput) => Promise<PreviewServerInfo>
  stop: (appId: string) => Promise<void>
  hotUpdate: (appId: string, patch: HotUpdatePatch) => Promise<void>
  getStatus: (appId: string) => Promise<PreviewServerInfo | null>
  listAll: () => Promise<PreviewServerInfo[]>
}

export interface ElectronAPI {
  preview: ElectronPreviewAPI
  platform: string
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}
