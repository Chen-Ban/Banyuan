/**
 * BanyanClient — Banyan 后端内部 API 客户端（Pull-based 架构）
 *
 * XiangDi 服务在 Agent 执行过程中，通过此客户端按需拉取应用数据：
 *   - GET /internal/apps/:appId/pages          → 获取 pages JSON 数组
 *   - GET /internal/apps/:appId/schema         → 获取 CollectionSchema
 *   - GET /internal/apps/:appId/cloud-functions → 获取所有云函数列表
 *   - GET /internal/apps/:appId/cloud-functions/:functionId → 获取单个云函数
 *
 * 鉴权：通过 X-Internal-Token header（与 INTERNAL_API_TOKEN 环境变量对齐）
 *
 * 设计决策：
 *   - 替代原先"请求体传入 pages/appSchema"的 push 模式
 *   - XiangDi 服务按需获取数据，减小请求体体积，支持更灵活的工具组合
 *   - 容错：请求失败时返回空值而非抛异常，不阻塞 Agent 主流程
 */

import http from 'http'
import https from 'https'

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
        this.internalToken = config.internalToken ?? process.env.INTERNAL_API_TOKEN
        this.timeout = config.timeout ?? 10000
    }

    /**
     * 获取应用的 pages（JSON 字符串数组）
     */
    async getPages(appId: string): Promise<string[]> {
        const data = await this.get<{ pages: string[] }>(`/internal/apps/${appId}/pages`)
        return data?.pages ?? []
    }

    /**
     * 获取应用的 Schema（集合定义列表）
     */
    async getSchema(appId: string): Promise<SchemaCollectionInfo[]> {
        const data = await this.get<{ collections: SchemaCollectionInfo[] }>(`/internal/apps/${appId}/schema`)
        return data?.collections ?? []
    }

    /**
     * 获取应用的所有云函数列表
     */
    async getCloudFunctions(appId: string): Promise<CloudFunctionInfo[]> {
        const data = await this.get<{ functions: CloudFunctionInfo[] }>(`/internal/apps/${appId}/cloud-functions`)
        return data?.functions ?? []
    }

    /**
     * 获取单个云函数详情
     */
    async getCloudFunction(appId: string, functionId: string): Promise<CloudFunctionInfo | null> {
        const data = await this.get<{ function: CloudFunctionInfo }>(`/internal/apps/${appId}/cloud-functions/${functionId}`)
        return data?.function ?? null
    }

    // ─── HTTP 请求内核 ──────────────────────────────────────────────────────

    private get<T>(path: string): Promise<T | null> {
        return new Promise((resolve) => {
            const url = new URL(path, this.baseUrl)
            const isHttps = url.protocol === 'https:'
            const transport = isHttps ? https : http

            const options: http.RequestOptions = {
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 3001),
                path: url.pathname,
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    ...(this.internalToken ? { 'X-Internal-Token': this.internalToken } : {}),
                },
                timeout: this.timeout,
            }

            const req = transport.request(options, (res) => {
                if (res.statusCode && res.statusCode >= 400) {
                    console.error(`[BanyanClient] GET ${path} → ${res.statusCode}`)
                    resolve(null)
                    return
                }

                let data = ''
                res.on('data', (chunk: Buffer) => { data += chunk.toString() })
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data) as T)
                    } catch {
                        console.error(`[BanyanClient] 解析响应失败: GET ${path}`)
                        resolve(null)
                    }
                })
                res.on('error', () => resolve(null))
            })

            req.on('error', (err) => {
                console.error(`[BanyanClient] 请求失败 GET ${path}:`, err.message)
                resolve(null)
            })

            req.on('timeout', () => {
                req.destroy()
                console.error(`[BanyanClient] 请求超时 GET ${path}`)
                resolve(null)
            })

            req.end()
        })
    }
}
