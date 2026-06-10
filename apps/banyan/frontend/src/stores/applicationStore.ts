/**
 * ApplicationStore — 应用编辑态全局状态（zustand）
 *
 * Phase 1（metadata-dataflow spec）重设计：
 *   - 持有业务数据：appJSON（string）/ collections / cloudFunctions
 *   - save()：调用聚合端点 PUT /apps/:appId/save-all 持久化后推送 PreviewServer
 *   - refreshFromBackend()：AI done 后拉取最新数据并推送 PreviewServer
 *   - flushAppJSON()：UIPage 将 ref 实时态 flush 到 store
 *   - load()：初始化加载全量数据
 *
 * 保留原有的 UI 编辑态注册机制：
 *   - getSerializedApp / designSizeHandler / flushHandler / initialPrompt
 *
 * 消费方：
 *   - ApplicationLayout：写入 appName、触发 save、build
 *   - UIPage：注册 getSerializedApp / designSizeHandler，flush appJSON
 *   - PreviewPage：读 designSize
 *   - DatabasePage / FunctionsPage：CRUD 后更新 store collections/cloudFunctions
 *   - AiBar：onBeforeSend 调用 requestFlush + save，done 后调用 refreshFromBackend
 *   - Sidebar：读 appName
 *   - HomePage：写 initialPrompt
 *
 * 设计决策来源：docs/adr/app/mechanism.md M6 + docs/specs/app/metadata-dataflow.md
 */

import { create } from 'zustand'
import * as fullStateApi from '@/api/fullState'
import type { CollectionDef } from '@/api/schema'
import type { CloudFunctionDef } from '@/api/cloudFunctions'
import { hotUpdatePreview } from '@/utils/previewBridge'

// ── 类型定义 ─────────────────────────────────────────────────────────────────────

export interface DesignSize {
  width: number
  height: number
}

export interface ApplicationState {
  // ── 业务数据（M6 新增） ─────────────────────────────────────────────────────
  /** 当前应用 ID */
  appId: string | null
  /** App.serialize() 产出的完整 JSON 字符串 */
  appJSON: string
  /** 数据表定义 */
  collections: CollectionDef[]
  /** 云函数定义 */
  cloudFunctions: CloudFunctionDef[]

  // ── 状态标识 ─────────────────────────────────────────────────────────────────
  /** appJSON 是否有未保存的编辑 */
  isDirty: boolean
  /** 是否正在保存 */
  isSaving: boolean

  // ── 应用元数据 ─────────────────────────────────────────────────────────────
  /** 当前应用名称 */
  appName: string

  // ── 设计尺寸 ───────────────────────────────────────────────────────────────
  /** 当前应用设计尺寸 */
  designSize: DesignSize

  // ── 画布序列化（UIPage 注册） ──────────────────────────────────────────────
  /** UIPage 注册的序列化函数，供 handleBuild / handleSave 调用 */
  getSerializedApp: (() => string) | null

  // ── designSize 写入引擎的回调（UIPage / PreviewPage 注册） ─────────────────
  /** 当前活跃页面注册的 setDesignSize 回调 */
  designSizeHandler: ((size: DesignSize) => void) | null

  // ── initialPrompt ──────────────────────────────────────────────────────────
  /**
   * 首页创建应用后的初始 prompt（带缓冲语义）。
   * key: appId, value: prompt
   */
  initialPrompt: Map<string, string>

  // ── AI 回调 ────────────────────────────────────────────────────────────────
  /** AI 流式推送 appJSON 快照 */
  onAppSnapshot: ((appJSON: string) => void) | null
  /** AI 完成后回调 */
  onDone: ((appJSON: string) => void) | null
}

export interface ApplicationActions {
  // ── 业务数据操作（M6 新增） ─────────────────────────────────────────────────
  /** 初始化加载：拉取全量数据并推送 PreviewServer */
  load: (appId: string) => Promise<void>
  /** 全量保存：flush → HTTP save-all → 推送 PreviewServer */
  save: () => Promise<void>
  /** AI done 后拉取最新数据并推送 PreviewServer */
  refreshFromBackend: () => Promise<void>
  /** UIPage 将 ref 实时态 flush 到 store（仅更新 appJSON，不触发 hotUpdate） */
  flushAppJSON: (serialized: string) => void
  /** 更新 collections（CRUD 后调用） */
  setCollections: (collections: CollectionDef[]) => void
  /** 更新 cloudFunctions（CRUD 后调用） */
  setCloudFunctions: (cloudFunctions: CloudFunctionDef[]) => void

  // ── 应用元数据 ─────────────────────────────────────────────────────────────
  setAppName: (name: string) => void

  // ── 设计尺寸 ───────────────────────────────────────────────────────────────
  setDesignSize: (size: DesignSize) => void
  /** Layout 机型选择器调用：更新 store 状态 + 通知引擎 */
  changeDesignSize: (size: DesignSize) => void

  // ── 画布序列化注册 ─────────────────────────────────────────────────────────
  registerGetSerializedApp: (fn: () => string) => void
  unregisterGetSerializedApp: () => void

  // ── designSize handler 注册 ────────────────────────────────────────────────
  registerDesignSizeHandler: (fn: (size: DesignSize) => void) => void
  unregisterDesignSizeHandler: () => void

  // ── Flush 事件（子页面注册 handler 将本地态刷回 store） ─────────────────────
  /**
   * 请求 flush（触发 UIPage 等注册的 handler 将 ref 数据 flush 到 store）。
   * 返回 Promise 在全部 flush 完成后 resolve。
   */
  requestFlush: () => Promise<void>
  /**
   * 子页面注册 flush 处理器。返回取消注册函数。
   * UIPage 注册时执行 ref → store 的 flush。
   */
  registerFlushHandler: (handler: () => Promise<void>) => () => void

  // ── initialPrompt ──────────────────────────────────────────────────────────
  setInitialPrompt: (appId: string, prompt: string) => void
  consumeInitialPrompt: (appId: string) => string | undefined
  clearInitialPrompt: (appId: string) => void

  // ── AI 回调注册 ────────────────────────────────────────────────────────────
  registerAiCallbacks: (cbs: { onAppSnapshot?: (json: string) => void; onDone?: (json: string) => void }) => void
  unregisterAiCallbacks: () => void

  // ── 重置 ──────────────────────────────────────────────────────────────────
  reset: () => void
}

// ── Flush 处理器注册表（不放入 store state 避免触发渲染） ─────────────────────────

const flushHandlers = new Set<() => Promise<void>>()

// ── Store 定义 ───────────────────────────────────────────────────────────────────

const initialState: ApplicationState = {
  appId: null,
  appJSON: '',
  collections: [],
  cloudFunctions: [],
  isDirty: false,
  isSaving: false,
  appName: '',
  designSize: { width: 1280, height: 800 },
  getSerializedApp: null,
  designSizeHandler: null,
  initialPrompt: new Map(),
  onAppSnapshot: null,
  onDone: null,
}

export const useApplicationStore = create<ApplicationState & ApplicationActions>()((set, get) => ({
  ...initialState,

  // ── 业务数据操作 ─────────────────────────────────────────────────────────────

  load: async (appId) => {
    set({ appId })
    const res = await fullStateApi.getFullState(appId)
    if (res.success && res.data) {
      set({
        appJSON: res.data.appJSON,
        collections: res.data.collections,
        cloudFunctions: res.data.cloudFunctions,
        isDirty: false,
      })
      // 初始化推送 PreviewServer
      hotUpdatePreview(res.data.collections, res.data.cloudFunctions)
    }
  },

  save: async () => {
    const { appId, appJSON, collections, cloudFunctions, isSaving } = get()
    if (!appId || isSaving) return

    set({ isSaving: true })
    try {
      await fullStateApi.saveAll(appId, { appJSON, collections, cloudFunctions })
      set({ isDirty: false })
      // 持久化成功后推送 PreviewServer
      hotUpdatePreview(collections, cloudFunctions)
    } finally {
      set({ isSaving: false })
    }
  },

  refreshFromBackend: async () => {
    const appId = get().appId
    if (!appId) return
    const res = await fullStateApi.getFullState(appId)
    if (res.success && res.data) {
      set({
        appJSON: res.data.appJSON,
        collections: res.data.collections,
        cloudFunctions: res.data.cloudFunctions,
        isDirty: false,
      })
      // 推送 PreviewServer
      hotUpdatePreview(res.data.collections, res.data.cloudFunctions)
    }
  },

  flushAppJSON: (serialized) => {
    set({ appJSON: serialized, isDirty: true })
  },

  setCollections: (collections) => {
    set({ collections })
    hotUpdatePreview(collections, get().cloudFunctions)
  },

  setCloudFunctions: (cloudFunctions) => {
    set({ cloudFunctions })
    hotUpdatePreview(get().collections, cloudFunctions)
  },

  // ── 应用元数据 ─────────────────────────────────────────────────────────────
  setAppName: (name) => set({ appName: name }),

  // ── 设计尺寸 ───────────────────────────────────────────────────────────────
  setDesignSize: (size) => set({ designSize: size }),
  changeDesignSize: (size) => {
    set({ designSize: size })
    const handler = get().designSizeHandler
    if (handler) handler(size)
  },

  // ── 画布序列化注册 ─────────────────────────────────────────────────────────
  registerGetSerializedApp: (fn) => set({ getSerializedApp: fn }),
  unregisterGetSerializedApp: () => set({ getSerializedApp: null }),

  // ── designSize handler 注册 ────────────────────────────────────────────────
  registerDesignSizeHandler: (fn) => set({ designSizeHandler: fn }),
  unregisterDesignSizeHandler: () => set({ designSizeHandler: null }),

  // ── Flush 事件 ──────────────────────────────────────────────────────────────
  requestFlush: () => {
    if (flushHandlers.size === 0) {
      return Promise.resolve()
    }
    return Promise.all([...flushHandlers].map((h) => h())).then(() => {})
  },

  registerFlushHandler: (handler) => {
    flushHandlers.add(handler)
    return () => { flushHandlers.delete(handler) }
  },

  // ── initialPrompt ──────────────────────────────────────────────────────────
  setInitialPrompt: (appId, prompt) => {
    set((s) => {
      const next = new Map(s.initialPrompt)
      next.set(appId, prompt)
      return { initialPrompt: next }
    })
  },

  consumeInitialPrompt: (appId) => {
    const prompt = get().initialPrompt.get(appId)
    if (prompt !== undefined) {
      set((s) => {
        const next = new Map(s.initialPrompt)
        next.delete(appId)
        return { initialPrompt: next }
      })
    }
    return prompt
  },

  clearInitialPrompt: (appId) => {
    set((s) => {
      const next = new Map(s.initialPrompt)
      next.delete(appId)
      return { initialPrompt: next }
    })
  },

  // ── AI 回调注册 ────────────────────────────────────────────────────────────
  registerAiCallbacks: (cbs) => set({
    onAppSnapshot: cbs.onAppSnapshot ?? null,
    onDone: cbs.onDone ?? null,
  }),
  unregisterAiCallbacks: () => set({ onAppSnapshot: null, onDone: null }),

  // ── 重置 ──────────────────────────────────────────────────────────────────
  reset: () => {
    flushHandlers.clear()
    set({ ...initialState, initialPrompt: new Map() })
  },
}))

