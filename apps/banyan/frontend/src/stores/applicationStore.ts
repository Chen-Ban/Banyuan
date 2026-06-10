/**
 * ApplicationStore — 应用编辑态全局状态（zustand）
 *
 * 持有业务数据：appJSON（string）/ collections / cloudFunctions
 *   - save()：调用聚合端点 PUT /apps/:appId/save-all 持久化后推送 PreviewServer
 *   - refreshFromBackend()：AI done 后拉取最新数据并推送 PreviewServer
 *   - flushAppJSON()：将画布/编辑器实时态写回 store.appJSON
 *   - load()：初始化加载全量数据
 *
 * 画布引擎实例（actions）直接挂载到 store：
 *   - 当前活跃画布页（UIPage / PreviewPage）将 IBanvasActions 实例挂载到 store
 *   - store 内部可直接调用引擎能力：序列化、设计尺寸读写
 *   - 外部消费方也可通过 store.actions 直接操作画布内容
 *
 * Flush 总线（registerFlushHandler）：
 *   - UIPage（画布）/ DatabasePage（FieldEditor）/ FunctionsPage（FlowEditor）
 *     各自注册 handler，将本地实时态/dirty 态刷回 store
 *   - 保存 / AI 发送前调用 requestFlush() 广播触发
 *
 * 消费方：
 *   - ApplicationLayout：写入 appName、触发 save、build、机型切换
 *   - UIPage：挂载 actions，注册 flush handler，同步引擎 designSize 到 store
 *   - PreviewPage：挂载 actions，读 designSize
 *   - DatabasePage / FunctionsPage：注册 flush handler，CRUD 后更新 store
 *   - AiBar：onBeforeSend 调用 requestFlush + save，done 后调用 refreshFromBackend
 *   - Sidebar：读 appName
 *   - HomePage：写 initialPrompt
 *
 * 设计决策来源：docs/adr/app/mechanism.md M6 + docs/specs/app/metadata-dataflow.md
 */

import { create } from 'zustand'
import type { IBanvasActions } from '@banyuan/banvasgl'
import * as fullStateApi from '@/api/application/fullState'
import type { CollectionDef } from '@/api/backend/schema'
import type { CloudFunctionDef } from '@/api/backend/cloudFunctions'
import { hotUpdatePreview } from '@/utils/previewBridge'

// ── 类型定义 ─────────────────────────────────────────────────────────────────────

export interface DesignSize {
  width: number
  height: number
}

export interface ApplicationState {
  // ── 业务数据 ─────────────────────────────────────────────────────────────────
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

  // ── 画布引擎实例 ────────────────────────────────────────────────────────────
  /**
   * 当前活跃画布页挂载的引擎操作集（IBanvasActions）。
   * 挂载后 store 可直接调用引擎能力（序列化 / 设计尺寸），
   * 外部也可通过 store.actions 直接操作画布内容。
   */
  actions: IBanvasActions | null

  // ── initialPrompt ──────────────────────────────────────────────────────────
  /**
   * 首页创建应用后的初始 prompt（带缓冲语义）。
   * key: appId, value: prompt
   */
  initialPrompt: Map<string, string>
}

export interface ApplicationActions {
  // ── 业务数据操作 ─────────────────────────────────────────────────────────────
  /** 初始化加载：拉取全量数据并推送 PreviewServer */
  load: (appId: string) => Promise<void>
  /** 全量保存：HTTP save-all → 推送 PreviewServer */
  save: () => Promise<void>
  /** AI done 后拉取最新数据并推送 PreviewServer */
  refreshFromBackend: () => Promise<void>
  /** 将实时态写回 store.appJSON（仅更新 appJSON，不触发 hotUpdate） */
  flushAppJSON: (serialized: string) => void
  /** 更新 collections（CRUD 后调用） */
  setCollections: (collections: CollectionDef[]) => void
  /** 更新 cloudFunctions（CRUD 后调用） */
  setCloudFunctions: (cloudFunctions: CloudFunctionDef[]) => void

  // ── 应用元数据 ─────────────────────────────────────────────────────────────
  setAppName: (name: string) => void

  // ── 设计尺寸 ───────────────────────────────────────────────────────────────
  setDesignSize: (size: DesignSize) => void
  /** Layout 机型选择器调用：更新 store 状态 + 通过 actions 通知画布引擎 */
  changeDesignSize: (size: DesignSize) => void

  // ── 画布引擎实例挂载 ────────────────────────────────────────────────────────
  /** 活跃画布页挂载引擎实例。返回卸载函数。 */
  registerActions: (actions: IBanvasActions) => () => void
  /** 取当前画布最新序列化结果（画布未挂载时返回 store.appJSON 兜底） */
  getSerializedApp: () => string

  // ── Flush 总线（子页面注册 handler 将本地态刷回 store） ─────────────────────
  /**
   * 请求 flush（触发已注册的 handler 将本地态刷回 store）。
   * 返回 Promise 在全部 flush 完成后 resolve。
   */
  requestFlush: () => Promise<void>
  /**
   * 子页面注册 flush 处理器。返回取消注册函数。
   * UIPage（画布）/ DatabasePage（FieldEditor）/ FunctionsPage（FlowEditor）使用。
   */
  registerFlushHandler: (handler: () => Promise<void>) => () => void

  // ── initialPrompt ──────────────────────────────────────────────────────────
  setInitialPrompt: (appId: string, prompt: string) => void
  consumeInitialPrompt: (appId: string) => string | undefined
  clearInitialPrompt: (appId: string) => void

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
  actions: null,
  initialPrompt: new Map(),
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
    // 直接通知画布引擎
    get().actions?.app.setDesignSize(size.width, size.height)
  },

  // ── 画布引擎实例挂载 ────────────────────────────────────────────────────────
  registerActions: (actions) => {
    set({ actions })
    return () => {
      // 仅当卸载的是当前实例时才清空，避免快速切换页面时误清新实例
      if (get().actions === actions) set({ actions: null })
    }
  },

  getSerializedApp: () => {
    const actions = get().actions
    return actions ? actions.app.getSerializedApp() : get().appJSON
  },

  // ── Flush 总线 ──────────────────────────────────────────────────────────────
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

  // ── 重置 ──────────────────────────────────────────────────────────────────
  reset: () => {
    flushHandlers.clear()
    set({ ...initialState, initialPrompt: new Map() })
  },
}))
