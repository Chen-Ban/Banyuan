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
      console.log('[previewServerStore] start called, isElectron:', isElectron(), 'appId:', appId)

      if (!isElectron()) {
        console.warn('[previewServerStore] 非 Electron 环境，跳过 Preview Server 启动')
        return
      }

      const gen = get()._startGen + 1
      set({ status: 'starting', errorMessage: '', _startGen: gen })

      try {
        // 并行加载启动所需数据
        console.log('[previewServerStore] 加载应用数据...')
        const [appRes, schemaRes, functionsRes] = await Promise.all([
          applicationApi.fetchApplication(appId),
          schemaApi.fetchDataSchema(appId),
          cloudFunctionApi.listFunctions(appId),
        ])
        console.log('[previewServerStore] 数据加载完成')

        // 检查是否已被取消（stop/reset/新 start 覆盖了 gen）
        if (get()._startGen !== gen) {
          console.warn('[previewServerStore] 启动已取消（gen 不匹配）')
          return
        }

        const uiJSON = appRes.data?.uiJSON ? JSON.parse(appRes.data.uiJSON) : {}
        const collections = schemaRes.data?.collections || []
        const cloudFunctions = functionsRes.data || []

        console.log('[previewServerStore] 调用 startPreviewServer IPC...')
        const info = await startPreviewServer({
          appId,
          uiJSON,
          collectionSchemas: collections,
          cloudFunctions,
        })

        if (get()._startGen !== gen) {
          // 启动完成但已被取消 —— 停止刚启动的服务
          console.warn('[previewServerStore] 启动完成但已被取消')
          stopPreviewServer(appId).catch(() => {})
          return
        }

        console.log('[previewServerStore] Preview Server 启动成功:', info.url)
        set({ serverInfo: info, status: 'running' })
      } catch (err: unknown) {
        if (get()._startGen !== gen) return
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[previewServerStore] 启动失败:', msg)
        set({
          status: 'error',
          errorMessage: msg,
        })
      }
    },

    stop: async (appId) => {
      // 立即递增 gen 以取消所有在途 start()——必须在 await 之前同步执行，
      // 否则 React StrictMode 下第二次 start() 的 gen 会被异步 set 覆盖
      const nextGen = get()._startGen + 1
      set({ _startGen: nextGen })

      if (isElectron()) {
        await stopPreviewServer(appId).catch(() => {})
      }
      // 重置状态（gen 不可覆盖，已在上面设置）
      set({ serverInfo: null, status: 'idle', errorMessage: '' })
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
