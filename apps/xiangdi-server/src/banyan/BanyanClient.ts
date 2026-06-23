/**
 * BanyanClient — Banyan 后端内部 API 客户端（Pull-based 架构）
 *
 * XiangDi 服务在 Agent 执行过程中，通过此客户端按需拉取应用数据：
 *   - GET /internal/apps/:appId/ui-definition → 获取 UI 定义 JSON 字符串
 *   - GET /internal/apps/:appId/schema         → 获取 CollectionSchema
 *   - GET /internal/apps/:appId/cloud-functions → 获取所有云函数列表
 *   - GET /internal/apps/:appId/cloud-functions/:functionId → 获取单个云函数
 *
 * 鉴权：通过 X-Internal-Token header（与 INTERNAL_API_TOKEN 环境变量对齐）
 *
 * 设计决策：
 *   - 替代原先“请求体传入 appJSON/appSchema”的 push 模式
 *   - XiangDi 服务按需获取数据，减小请求体体积，支持更灵活的工具组合
 *   - 错误处理：请求失败时抛出 ServiceUnavailableError，由调用方决定是否降级
 */

import http from 'http'
import https from 'https'
import { ServiceUnavailableError } from '../errors.js'
import { logger } from '../logger.js'

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

export interface CloudFunctionInfo {
    functionId: string
    name: string
    displayName: string
    description: string
    flowSchema: Record<string, unknown>
    version: number
}

export interface SchemaFieldInfo {
    name: string
    displayName: string
    type: string
    required: boolean
    defaultValue?: unknown
    refCollection?: string
    enumValues?: string[]
}

export interface SchemaCollectionInfo {
    name: string
    displayName: string
    fields: SchemaFieldInfo[]
}

// ─── 配置 ─────────────────────────────────────────────────────────────────────

export interface BanyanClientConfig {
    /** Banyan 后端基础 URL，默认 http://localhost:3001 */
    baseUrl?: string
    /** 内部认证 token（对应 banyan 后端的 INTERNAL_API_TOKEN 环境变量） */
    internalToken?: string
    /** 请求超时（ms），默认 10000 */
    timeout?: number
}

// ─── 实现 ─────────────────────────────────────────────────────────────────────

export class BanyanClient {
    private readonly baseUrl: string
    private readonly internalToken?: string
    private readonly timeout: number

    constructor(config: BanyanClientConfig = {}) {
        this.baseUrl = config.baseUrl ?? (process.env.BANYAN_URL ?? 'http://localhost:3001')
        this.internalToken = config.internalToken ?? process.env.INTERNAL_API_TOKEN ?? '__dev_internal_token__'
        this.timeout = config.timeout ?? 10000
    }

    /**
     * 获取应用的 appJSON（App 级别序列化字符串）
     * @throws ServiceUnavailableError 当 banyan 后端不可用时
     */
    async getUIDefinition(appId: string): Promise<string> {
        const resp = await this.get<{ success: boolean; data: { uiJSON: string } }>(`/internal/apps/${appId}/ui-definition`)
        return resp.data?.uiJSON ?? ''
    }

    /**
     * 获取应用的 Schema（集合定义列表）
     * @throws ServiceUnavailableError 当 banyan 后端不可用时
     */
    async getSchema(appId: string): Promise<SchemaCollectionInfo[]> {
        const resp = await this.get<{ success: boolean; data: { collections: SchemaCollectionInfo[] } }>(`/internal/apps/${appId}/schema`)
        return resp.data?.collections ?? []
    }

    /**
     * 获取应用的所有云函数列表
     * @throws ServiceUnavailableError 当 banyan 后端不可用时
     */
    async getCloudFunctions(appId: string): Promise<CloudFunctionInfo[]> {
        const resp = await this.get<{ success: boolean; data: { functions: CloudFunctionInfo[] } }>(`/internal/apps/${appId}/cloud-functions`)
        return resp.data?.functions ?? []
    }

    /**
     * 获取单个云函数详情
     * @throws ServiceUnavailableError 当 banyan 后端不可用时
     */
    async getCloudFunction(appId: string, functionId: string): Promise<CloudFunctionInfo | null> {
        const resp = await this.get<{ success: boolean; data: { function: CloudFunctionInfo } }>(`/internal/apps/${appId}/cloud-functions/${functionId}`)
        return resp.data?.function ?? null
    }

    /**
     * 搜索物料（通过后端 /api/materials/search）
     */
    async searchMaterials(keyword: string, limit?: number): Promise<{ material_id: string; name: string; description?: string; tags?: string[]; parameterNames?: string[] }[]> {
        const params = new URLSearchParams({ keyword })
        if (limit) params.set('limit', String(limit))
        const resp = await this.get<{ success: boolean; data: { material_id: string; name: string; description?: string; tags?: string[]; template?: { parameters?: { name: string }[] } }[] }>(`/api/materials/search?${params.toString()}`)
        const materials = resp.data ?? []
        return materials.map((m) => ({
            material_id: m.material_id,
            name: m.name,
            description: m.description,
            tags: m.tags,
            parameterNames: m.template?.parameters?.map((p) => p.name),
        }))
    }

    /**
     * 获取物料详情
     */
    async getMaterialDetail(materialId: string): Promise<{ material_id: string; name: string; description?: string; tags?: string[]; parameters: { id: string; name: string; type: string; description?: string; defaultValue?: unknown; required?: boolean }[]; assets: { id: string; type: string; url: string }[] } | null> {
        try {
            const resp = await this.get<{ success: boolean; data: { material_id: string; name: string; description?: string; tags?: string[]; template?: { parameters?: { id: string; name: string; type: string; description?: string; defaultValue?: unknown; required?: boolean }[]; assets?: { id: string; type: string; url: string }[] } } }>(`/api/materials/${materialId}`)
            const m = resp.data
            if (!m) return null
            return {
                material_id: m.material_id,
                name: m.name,
                description: m.description,
                tags: m.tags,
                parameters: m.template?.parameters ?? [],
                assets: m.template?.assets ?? [],
            }
        } catch {
            return null
        }
    }

    // ─── HTTP 请求内核 ──────────────────────────────────────────────────────

    private get<T>(path: string): Promise<T> {
        return new Promise((resolve, reject) => {
            const url = new URL(path, this.baseUrl)
            const isHttps = url.protocol === 'https:'
            const transport = isHttps ? https : http

            const options: http.RequestOptions = {
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 3001),
                path: url.pathname + url.search,
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    ...(this.internalToken ? { 'X-Internal-Token': this.internalToken } : {}),
                },
                timeout: this.timeout,
            }

            const req = transport.request(options, (res) => {
                if (res.statusCode && res.statusCode >= 400) {
                    const errMsg = `GET ${path} responded with status ${res.statusCode}`
                    logger.error(`[BanyanClient] ${errMsg}`, undefined, { path, statusCode: res.statusCode })
                    reject(new ServiceUnavailableError('BanyanBackend', errMsg))
                    // Drain the response to free up the socket
                    res.resume()
                    return
                }

                let data = ''
                res.on('data', (chunk: Buffer) => { data += chunk.toString() })
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data) as T)
                    } catch (parseErr) {
                        const errMsg = `Failed to parse response for GET ${path}`
                        logger.error(`[BanyanClient] ${errMsg}`, parseErr)
                        reject(new ServiceUnavailableError('BanyanBackend', errMsg, parseErr instanceof Error ? parseErr : undefined))
                    }
                })
                res.on('error', (err) => {
                    logger.error(`[BanyanClient] Response stream error for GET ${path}`, err)
                    reject(new ServiceUnavailableError('BanyanBackend', `Response error for GET ${path}: ${err.message}`, err))
                })
            })

            req.on('error', (err) => {
                logger.error(`[BanyanClient] Request failed GET ${path}`, err)
                reject(new ServiceUnavailableError('BanyanBackend', `Request failed: ${err.message}`, err))
            })

            req.on('timeout', () => {
                req.destroy()
                const errMsg = `Request timeout for GET ${path} (${this.timeout}ms)`
                logger.error(`[BanyanClient] ${errMsg}`)
                reject(new ServiceUnavailableError('BanyanBackend', errMsg))
            })

            req.end()
        })
    }
}
