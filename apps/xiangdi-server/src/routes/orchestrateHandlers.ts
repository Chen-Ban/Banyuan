/**
 * Orchestrator 工具处理器构建器
 *
 * ADR-041: 为 Frontend Worker 和 Backend Worker 构建工具处理器实现。
 * 这些处理器通过 BanyanClient / RemoteKnowledgeStore / RemoteMaterialStore
 * 与外部服务交互，由 Orchestrator Graph 注入 Worker SubAgent。
 */
import type { ServerResponse } from 'http'
import type { FrontendToolHandlers, BackendToolHandlers, AIProjectionScene, AIProjectionApp, AIAppLifetimes } from '@banyuan/xiangdi-agent'
import { uiJSONToProjection, patchProjection } from '@banyuan/xiangdi-agent'
import type { BanyanClient, CloudFunctionInfo, SchemaCollectionInfo } from '../banyan/index.js'
import type { RemoteKnowledgeStore } from '../knowledge/RemoteKnowledgeStore.js'
import type { RemoteMaterialStore } from '../banyan/RemoteMaterialStore.js'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 内存态应用数据（单次请求生命周期内维持）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface AppRuntimeState {
  uiJSON: string
  schema: SchemaCollectionInfo[]
  cloudFunctions: CloudFunctionInfo[]
  version: string
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Frontend Tool Handlers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface BuildFrontendHandlersConfig {
  state: AppRuntimeState
  knowledgeStore: RemoteKnowledgeStore
  materialStore: RemoteMaterialStore
}

export function buildFrontendToolHandlers(config: BuildFrontendHandlersConfig): FrontendToolHandlers {
  const { state, knowledgeStore, materialStore } = config

  return {
    async knowledgeSearch(input: { query: string; topK?: number }) {
      const results = await knowledgeStore.query(input.query, { topK: input.topK ?? 5 })
      return JSON.stringify(results.slice(0, input.topK ?? 5))
    },

    async readPages(input: { pageId?: string }) {
      if (!state.uiJSON) return JSON.stringify({ pages: [], message: '应用尚无页面数据' })

      const appProjection = uiJSONToProjection(state.uiJSON)
      if (!appProjection.scenes || appProjection.scenes.length === 0) {
        return JSON.stringify({ pages: [], message: '应用尚无页面数据' })
      }

      if (input.pageId) {
        const page = appProjection.scenes.find(s => s.id === input.pageId)
        if (!page) return JSON.stringify({ error: `页面 ${input.pageId} 不存在` })
        return JSON.stringify(page)
      }

      // 返回摘要列表（含 App lifetimes 信息）
      const summary = appProjection.scenes.map(s => ({ id: s.id, name: s.name, nodeCount: s.children.length }))
      return JSON.stringify({ pages: summary, lifetimes: appProjection.lifetimes })
    },

    async writePage(input: { pageId: string; scene: Record<string, unknown> }) {
      const scene = input.scene as unknown as AIProjectionScene
      // 确保 scene.id 与 pageId 一致
      scene.id = input.pageId

      const { uiJSON: patched, result } = patchProjection(
        state.uiJSON || JSON.stringify({
          type: 'APP',
          version: state.version,
          data: { lifetimes: { onLaunch: null, onUnlaunch: null }, scenes: [] },
          metadata: { timestamp: Date.now(), source: 'AI Projection Patch' },
        }),
        { scenes: [scene] },
        state.version,
      )
      state.uiJSON = patched
      return JSON.stringify({ success: true, ...result })
    },

    async createPage(input: { name: string; pageId?: string }) {
      const pageId = input.pageId ?? crypto.randomUUID()
      const emptyScene: AIProjectionScene = {
        id: pageId,
        name: input.name,
        size: { width: 375, height: 812 },
        children: [],
      }
      const { uiJSON: patched } = patchProjection(
        state.uiJSON || JSON.stringify({
          type: 'APP',
          version: state.version,
          data: { lifetimes: { onLaunch: null, onUnlaunch: null }, scenes: [] },
          metadata: { timestamp: Date.now(), source: 'AI Projection Patch' },
        }),
        { scenes: [emptyScene] },
        state.version,
      )
      state.uiJSON = patched
      return JSON.stringify({ success: true, pageId })
    },

    async deletePage(input: { pageId: string }) {
      if (!state.uiJSON) return JSON.stringify({ error: '应用无数据' })

      const parsed = JSON.parse(state.uiJSON)
      if (parsed.data?.scenes) {
        parsed.data.scenes = parsed.data.scenes.filter((s: { $value?: { id?: string }; id?: string }) => {
          const sceneId = s.$value?.id ?? s.id
          return sceneId !== input.pageId
        })
      }
      state.uiJSON = JSON.stringify(parsed)
      return JSON.stringify({ success: true, deletedPageId: input.pageId })
    },

    async materialSearch(input: { keyword: string; category?: string }) {
      const results = await materialStore.search(input.keyword)
      return JSON.stringify(results)
    },

    async materialGetDetail(input: { materialId: string }) {
      const detail = await materialStore.getDetail(input.materialId)
      if (!detail) return JSON.stringify({ error: `物料 ${input.materialId} 不存在` })
      return JSON.stringify(detail)
    },
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Backend Tool Handlers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface BuildBackendHandlersConfig {
  state: AppRuntimeState
  knowledgeStore: RemoteKnowledgeStore
  sseWriter?: (event: string, data: unknown) => void
}

export function buildBackendToolHandlers(config: BuildBackendHandlersConfig): BackendToolHandlers {
  const { state, knowledgeStore, sseWriter } = config

  return {
    async knowledgeSearch(input: { query: string; topK?: number }) {
      const results = await knowledgeStore.query(input.query, { topK: input.topK ?? 5 })
      return JSON.stringify(results.slice(0, input.topK ?? 5))
    },

    async readSchema(_input: Record<string, unknown>) {
      return JSON.stringify({ collections: state.schema })
    },

    async readCloudFunctions(input: { functionId?: string }) {
      if (input.functionId) {
        const fn = state.cloudFunctions.find(f => f.functionId === input.functionId)
        if (!fn) return JSON.stringify({ error: `云函数 ${input.functionId} 不存在` })
        return JSON.stringify(fn)
      }
      // 摘要列表
      const summary = state.cloudFunctions.map(f => ({
        functionId: f.functionId,
        name: f.name,
        displayName: f.displayName,
        description: f.description,
      }))
      return JSON.stringify({ functions: summary, count: summary.length })
    },

    async writeSchema(input: { collections: unknown[] }) {
      state.schema = input.collections as SchemaCollectionInfo[]
      sseWriter?.('schema_update', { collections: state.schema })
      return JSON.stringify({ success: true, count: state.schema.length })
    },

    async writeCloudFunction(input: {
      functionId: string
      name: string
      displayName: string
      description: string
      flowSchema: Record<string, unknown>
    }) {
      const existing = state.cloudFunctions.findIndex(f => f.functionId === input.functionId)
      const entry: CloudFunctionInfo = {
        functionId: input.functionId,
        name: input.name,
        displayName: input.displayName,
        description: input.description,
        flowSchema: input.flowSchema,
        version: existing >= 0 ? (state.cloudFunctions[existing].version + 1) : 1,
      }
      if (existing >= 0) {
        state.cloudFunctions[existing] = entry
      } else {
        state.cloudFunctions.push(entry)
      }
      return JSON.stringify({ success: true, functionId: input.functionId, action: existing >= 0 ? 'updated' : 'created' })
    },

    async deleteCloudFunction(input: { functionId: string }) {
      const before = state.cloudFunctions.length
      state.cloudFunctions = state.cloudFunctions.filter(f => f.functionId !== input.functionId)
      const deleted = state.cloudFunctions.length < before
      return JSON.stringify({ success: deleted, functionId: input.functionId })
    },
  }
}
