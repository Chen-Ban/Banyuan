/**
 * previewServerStore — Preview Server 状态管理（zustand）
 *
 * 应用级共享状态，替代原来的 React Context。
 * PreviewPage 和 DataBrowserPage 直接通过 hook 读取 serverInfo/status，
 * ApplicationLayout 通过 start/stop actions 管理生命周期。
 *
 * 消费方：
 *   - ApplicationLayout：start(appId) / stop(appId) / reset()
 *   - PreviewPage：serverInfo.url → setBackendEndpoint
 *   - DataBrowserPage：serverInfo.url + status → 数据查询 / 降级 UI
 */

import { create } from 'zustand'
import type { PreviewServerInfo } from '@/types/electron.js'
import type { CollectionDef } from '@/api'
import type { CloudFunctionDef } from '@/api'
import {
  startPreviewServer,
  stopPreviewServer,
  hotUpdatePreviewServer,
  isElectron,
} from '@/api/runtime/previewServer'
import { schemaApi, cloudFunctionApi, applicationApi } from '@/api'

// ── 类型定义 ────────────────────────────────────────────────────────────────────

export type PreviewServerStatus = 'idle' | 'starting' | 'running' | 'error'

export interface HotUpdatePatch {
  collections?: CollectionDef[]
  cloudFunctions?: CloudFunctionDef[]
}

export interface PreviewServerState {
  /** Preview Server 信息（null = 未启动 / 非 Electron） */
  serverInfo: PreviewServerInfo | null
  /** 启动状态 */
  status: PreviewServerStatus
  /** 错误信息 */
  errorMessage: string
  /**
   * 启动序号——每次 start 调用递增，用作取消令牌。
   * 异步 boot 完成后若序号已变（stop/reset/新 start 覆盖），则丢弃结果。
   * @internal 外部不应直接读写
   */
  _startGen: number
}

export interface PreviewServerActions {
  /** 启动 Preview Server（ApplicationLayout mount 时调用） */
  start: (appId: string) => Promise<void>
  /** 停止 Preview Server（ApplicationLayout unmount 或切换应用时调用） */
  stop: (appId: string) => Promise<void>
  /** 热更新：子页面保存成功后调用 */
  hotUpdate: (patch: HotUpdatePatch) => Promise<void>
  /** 重置到初始状态（切换应用时调用） */
  reset: () => void
}

// ── 初始状态 ────────────────────────────────────────────────────────────────────

const initialState: PreviewServerState = {
  serverInfo: null,
  status: 'idle',
  errorMessage: '',
  _startGen: 0,
}

// ── Store ───────────────────────────────────────────────────────────────────────

export const usePreviewServerStore = create<PreviewServerState & PreviewServerActions>()(
  (set, get) => ({
    ...initialState,

    start: async (appId) => {
      if (!isElectron()) return

      const gen = get()._startGen + 1
      set({ status: 'starting', errorMessage: '', _startGen: gen })

      try {
        // 并行加载启动所需数据
        const [appRes, schemaRes, functionsRes] = await Promise.all([
          applicationApi.fetchApplication(appId),
          schemaApi.fetchDataSchema(appId),
          cloudFunctionApi.listFunctions(appId),
        ])

        // 检查是否已被取消（stop/reset/新 start 覆盖了 gen）
        if (get()._startGen !== gen) return

        const uiJSON = appRes.data?.uiJSON ? JSON.parse(appRes.data.uiJSON) : {}
        const collections = schemaRes.data?.collections || []
        const cloudFunctions = functionsRes.data || []

        const info = await startPreviewServer({
          appId,
          uiJSON,
          collectionSchemas: collections,
          cloudFunctions,
        })

        if (get()._startGen !== gen) {
          // 启动完成但已被取消 —— 停止刚启动的服务
          stopPreviewServer(appId).catch(() => {})
          return
        }

        set({ serverInfo: info, status: 'running' })
      } catch (err: unknown) {
        if (get()._startGen !== gen) return
        set({
          status: 'error',
          errorMessage: err instanceof Error ? err.message : String(err),
        })
      }
    },

    stop: async (appId) => {
      const nextGen = get()._startGen + 1
      if (isElectron()) {
        await stopPreviewServer(appId).catch(() => {})
      }
      set({ ...initialState, _startGen: nextGen })
    },

    hotUpdate: async (patch) => {
      const { serverInfo, status } = get()
      if (!serverInfo || status !== 'running') return
      if (!isElectron()) return

      try {
        await hotUpdatePreviewServer(serverInfo.appId, patch)
      } catch (err: unknown) {
        console.warn('[previewServerStore] hotUpdate failed:', err)
      }
    },

    reset: () => set({ ...initialState, _startGen: get()._startGen + 1 }),
  }),
)
