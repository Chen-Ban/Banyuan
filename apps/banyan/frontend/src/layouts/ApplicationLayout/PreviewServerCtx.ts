/**
 * PreviewServerCtx — Preview Server 生命周期管理
 *
 * 提供应用级 Context，在 ApplicationLayout 层管理 Preview Server 的启停和热更新。
 *
 * 职责：
 *   - mount 时启动 Preview Server（Electron IPC）
 *   - unmount 时停止 Preview Server
 *   - 暴露 hotUpdate 方法供子页面保存后触发热更新
 *   - 非 Electron 环境下静默降级（serverInfo = null）
 *
 * 消费方：
 *   - PreviewPage：读 serverInfo.url → setBackendEndpoint
 *   - DataBrowserPage：读 serverInfo.url → 查询业务数据
 *   - DatabasePage：保存后调 hotUpdate({ collections })
 *   - FunctionsPage：保存后调 hotUpdate({ cloudFunctions })
 */

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
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

export interface PreviewServerCtxValue {
  /** Preview Server 信息（null = 未启动 / 非 Electron） */
  serverInfo: PreviewServerInfo | null
  /** 启动状态 */
  status: PreviewServerStatus
  /** 错误信息 */
  errorMessage: string
  /** 热更新：子页面保存成功后调用 */
  hotUpdate: (patch: HotUpdatePatch) => Promise<void>
}

// ── Context ─────────────────────────────────────────────────────────────────────

export const PreviewServerCtx = createContext<PreviewServerCtxValue>({
  serverInfo: null,
  status: 'idle',
  errorMessage: '',
  hotUpdate: async () => {},
})

export const usePreviewServerCtx = () => useContext(PreviewServerCtx)

// ── Hook：在 ApplicationLayout 中使用 ───────────────────────────────────────────

export function usePreviewServer(appId: string | undefined): PreviewServerCtxValue {
  const [serverInfo, setServerInfo] = useState<PreviewServerInfo | null>(null)
  const [status, setStatus] = useState<PreviewServerStatus>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const mountedRef = useRef(true)
  const appIdRef = useRef(appId)
  appIdRef.current = appId

  // ── 启动 Preview Server ──────────────────────────────────────────────────
  useEffect(() => {
    if (!appId || !isElectron()) return

    let cancelled = false
    setStatus('starting')
    setErrorMessage('')

    const boot = async () => {
      try {
        // 并行加载启动所需数据
        const [appRes, schemaRes, functionsRes] = await Promise.all([
          applicationApi.fetchApplication(appId),
          schemaApi.fetchSchema(appId),
          cloudFunctionApi.listFunctions(appId),
        ])

        if (cancelled) return

        const appJSON = appRes.data?.appJSON ? JSON.parse(appRes.data.appJSON) : {}
        const collections = schemaRes.data?.collections || []
        const cloudFunctions = functionsRes.data || []

        const info = await startPreviewServer({
          appId,
          appJSON,
          collectionSchemas: collections,
          cloudFunctions,
        })

        if (cancelled) return
        setServerInfo(info)
        setStatus('running')
      } catch (err: unknown) {
        if (cancelled) return
        setStatus('error')
        setErrorMessage(err instanceof Error ? err.message : String(err))
      }
    }

    boot()

    return () => {
      cancelled = true
      // 停止 Preview Server
      if (isElectron() && appId) {
        stopPreviewServer(appId).catch(() => {})
      }
      setServerInfo(null)
      setStatus('idle')
      setErrorMessage('')
    }
  }, [appId])

  // ── 热更新 ───────────────────────────────────────────────────────────────
  const hotUpdate = useCallback(async (patch: HotUpdatePatch) => {
    const currentAppId = appIdRef.current
    if (!currentAppId || !isElectron() || status !== 'running') return

    try {
      await hotUpdatePreviewServer(currentAppId, patch)
    } catch (err: unknown) {
      console.warn('[PreviewServer] hotUpdate failed:', err)
    }
  }, [status])

  // ── cleanup ref ──────────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  return { serverInfo, status, errorMessage, hotUpdate }
}
