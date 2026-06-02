import { WebSocketServer, WebSocket } from 'ws'
import type { Server as HttpServer, IncomingMessage } from 'http'
import crypto from 'crypto'

// ─── 消息协议（与 @banyuan/deploy-agent 对齐）────────────────────────────────────

/**
 * 后端 → Agent 的消息类型
 */
export type ServerToAgentType = 'deploy:start' | 'deploy:cancel' | 'heartbeat:ack' | 'auth:success' | 'auth:fail'

/**
 * Agent → 后端的消息类型
 */
export type AgentToServerType = 'auth' | 'heartbeat' | 'deploy:progress' | 'deploy:result'

export interface ServerMessage {
  type: ServerToAgentType
  payload?: Record<string, unknown>
}

export interface AgentMessage {
  type: AgentToServerType
  payload?: Record<string, unknown>
}

// ─── 数据模型（与 CollectionSchema / CloudFunction 模型同步）──────────────────

export type FieldType = 'string' | 'number' | 'boolean' | 'date' | 'enum' | 'ref' | 'array' | 'object'

export interface FieldDef {
  name: string
  displayName: string
  type: FieldType
  required: boolean
  defaultValue?: unknown
  refCollection?: string
  enumValues?: string[]
}

export interface CollectionDef {
  name: string
  displayName: string
  fields: FieldDef[]
}

export interface CloudFunctionDef {
  functionId: string
  name: string
  displayName: string
  description: string
  /** FlowSchema JSON（{ nodes: [], edges: [] }） */
  flowSchema: Record<string, unknown>
}

// ─── DeployRequest ────────────────────────────────────────────────────────────

export interface DeployRequest {
  requestId: string
  appId: string
  appSlug: string
  appJSON: string
  deployType: 'static' | 'fullstack'
  /** 租户域名（如 abc12345.banyuan.club） */
  tenantDomain: string
  /** 画布宽度 */
  width: number
  /** 画布高度 */
  height: number
  /** BanvasGL 版本 */
  canvasVersion: string
  /** 数据集合定义（fullstack 模式） */
  collections?: CollectionDef[]
  /** 云函数定义（fullstack 模式） */
  cloudFunctions?: CloudFunctionDef[]
}

export interface DeployProgress {
  requestId: string
  step: string
  progress: number // 0-100
  message: string
}

export interface DeployResult {
  requestId: string
  success: boolean
  url?: string
  error?: string
}

// ─── 内部类型 ───────────────────────────────────────────────────────────────────

interface PendingRequest {
  tenantId: string
  resolve: (result: DeployResult) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout
}

interface ConnectionMeta {
  ws: WebSocket
  authenticated: boolean
  lastHeartbeat: number
  heartbeatTimer: NodeJS.Timeout | null
}

// ─── 常量 ─────────────────────────────────────────────────────────────────────

const WS_PATH = '/ws/agent'
const AUTH_TIMEOUT_MS = 10_000
const HEARTBEAT_INTERVAL_MS = 60_000
const DEPLOY_TIMEOUT_MS = 5 * 60_000

// ─── AgentGateway ───────────────────────────────────────────────────────────────

export class AgentGateway {
  private wss: WebSocketServer | null = null
  /** tenantId → 连接元信息 */
  private connections = new Map<string, ConnectionMeta>()
  /** requestId → resolve/reject 回调 */
  private pendingRequests = new Map<string, PendingRequest>()
  /** requestId → progress callback */
  private progressCallbacks = new Map<string, (progress: DeployProgress) => void>()

  /**
   * 将 WebSocket 服务附加到已有的 HTTP server 上
   * 路径：/ws/agent
   */
  attach(server: HttpServer): void {
    this.wss = new WebSocketServer({ noServer: true })

    server.on('upgrade', (request: IncomingMessage, socket, head) => {
      const url = new URL(request.url ?? '', `http://${request.headers.host ?? 'localhost'}`)

      if (url.pathname !== WS_PATH) {
        socket.destroy()
        return
      }

      const token = url.searchParams.get('token')
      if (!token) {
        console.warn('[AgentGateway] 连接缺少 token 参数，拒绝升级')
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        socket.destroy()
        return
      }

      this.wss!.handleUpgrade(request, socket, head, (ws) => {
        this.wss!.emit('connection', ws, request)
      })
    })

    this.wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
      const url = new URL(request.url ?? '', `http://${request.headers.host ?? 'localhost'}`)
      const token = url.searchParams.get('token') ?? ''

      this.handleNewConnection(ws, token)
    })

    console.log(`[AgentGateway] WebSocket 服务已附加，路径: ${WS_PATH}`)
  }

  /**
   * 检查某个租户的 agent 是否在线
   */
  isAgentOnline(tenantId: string): boolean {
    const meta = this.connections.get(tenantId)
    return meta !== undefined && meta.authenticated && meta.ws.readyState === WebSocket.OPEN
  }

  /**
   * 向指定租户的 agent 发送部署指令
   * 返回 Promise，在 agent 返回结果时 resolve
   */
  deploy(
    tenantId: string,
    request: DeployRequest,
    onProgress?: (p: DeployProgress) => void,
  ): Promise<DeployResult> {
    return new Promise<DeployResult>((resolve, reject) => {
      const meta = this.connections.get(tenantId)
      if (!meta || !meta.authenticated || meta.ws.readyState !== WebSocket.OPEN) {
        reject(new Error(`[AgentGateway] 租户 ${tenantId} 的 agent 不在线`))
        return
      }

      const requestId = request.requestId || crypto.randomUUID()
      const deployRequest: DeployRequest = { ...request, requestId }

      // 注册 progress 回调
      if (onProgress) {
        this.progressCallbacks.set(requestId, onProgress)
      }

      // 设置超时
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId)
        this.progressCallbacks.delete(requestId)
        reject(new Error(`[AgentGateway] 部署请求 ${requestId} 超时（${DEPLOY_TIMEOUT_MS / 1000}s）`))
      }, DEPLOY_TIMEOUT_MS)

      // 注册 pending request（含 tenantId 以便断线时清理）
      this.pendingRequests.set(requestId, { tenantId, resolve, reject, timeout })

      // 发送部署指令（使用 deploy:start 类型，与 agent 协议对齐）
      const message: ServerMessage = {
        type: 'deploy:start',
        payload: deployRequest as unknown as Record<string, unknown>,
      }

      meta.ws.send(JSON.stringify(message), (err) => {
        if (err) {
          clearTimeout(timeout)
          this.pendingRequests.delete(requestId)
          this.progressCallbacks.delete(requestId)
          reject(new Error(`[AgentGateway] 发送部署指令失败: ${err.message}`))
        }
      })

      console.log(`[AgentGateway] 已向租户 ${tenantId} 发送部署指令，requestId=${requestId}`)
    })
  }

  /**
   * 获取所有在线的 agent 租户列表
   */
  getOnlineAgents(): string[] {
    const agents: string[] = []
    for (const [tenantId, meta] of this.connections) {
      if (meta.authenticated && meta.ws.readyState === WebSocket.OPEN) {
        agents.push(tenantId)
      }
    }
    return agents
  }

  // ─── 私有方法 ──────────────────────────────────────────────────────────────────

  private handleNewConnection(ws: WebSocket, token: string): void {
    // 等待 auth 消息，超时则断开
    const authTimeout = setTimeout(() => {
      console.warn('[AgentGateway] 连接认证超时，关闭连接')
      ws.close(4001, 'Authentication timeout')
    }, AUTH_TIMEOUT_MS)

    const tempMeta: ConnectionMeta = {
      ws,
      authenticated: false,
      lastHeartbeat: Date.now(),
      heartbeatTimer: null,
    }

    // 首条消息必须是 auth
    const onFirstMessage = (raw: Buffer | string) => {
      ws.off('message', onFirstMessage)
      clearTimeout(authTimeout)

      try {
        const data: AgentMessage = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf-8'))

        if (data.type !== 'auth') {
          console.warn('[AgentGateway] 首条消息非 auth 类型，关闭连接')
          ws.close(4002, 'First message must be auth')
          return
        }

        // deploy-agent 发送 { agentToken, tenantId }
        const { tenantId, agentToken } = data.payload as { tenantId: string; agentToken: string }

        if (!tenantId || !agentToken) {
          console.warn('[AgentGateway] auth 消息缺少 tenantId 或 agentToken')
          const failMsg: ServerMessage = { type: 'auth:fail', payload: { reason: 'Missing tenantId or agentToken' } }
          ws.send(JSON.stringify(failMsg))
          ws.close(4003, 'Missing tenantId or agentToken')
          return
        }

        // 验证 token 一致性（URL token 与 auth payload agentToken 必须一致）
        if (token !== agentToken) {
          console.warn(`[AgentGateway] 租户 ${tenantId} token 不匹配`)
          const failMsg: ServerMessage = { type: 'auth:fail', payload: { reason: 'Token mismatch' } }
          ws.send(JSON.stringify(failMsg))
          ws.close(4004, 'Token mismatch')
          return
        }

        // TODO: 验证 token 是否属于该 tenantId（查询 Tenant 文档的 agentToken 字段）
        // 当前版本信任 token 一致性校验

        // 如果该租户已有连接，关闭旧连接
        const existing = this.connections.get(tenantId)
        if (existing) {
          console.log(`[AgentGateway] 租户 ${tenantId} 已有连接，关闭旧连接`)
          this.cleanupConnection(tenantId)
        }

        // 标记已认证
        tempMeta.authenticated = true
        tempMeta.lastHeartbeat = Date.now()

        // 启动心跳检测
        tempMeta.heartbeatTimer = setInterval(() => {
          this.checkHeartbeat(tenantId)
        }, HEARTBEAT_INTERVAL_MS)

        this.connections.set(tenantId, tempMeta)

        // 注册后续消息处理
        this.handleConnection(ws, tenantId)

        console.log(`[AgentGateway] 租户 ${tenantId} 认证成功，agent 已上线`)

        // 发送认证确认（auth:success）
        const ack: ServerMessage = { type: 'auth:success', payload: { tenantId } }
        ws.send(JSON.stringify(ack))
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e)
        console.error(`[AgentGateway] 解析 auth 消息失败: ${errMsg}`)
        ws.close(4005, 'Invalid auth message')
      }
    }

    ws.on('message', onFirstMessage)

    ws.on('close', () => {
      clearTimeout(authTimeout)
      ws.off('message', onFirstMessage)
    })
  }

  private handleConnection(ws: WebSocket, tenantId: string): void {
    ws.on('message', (raw: Buffer | string) => {
      try {
        const data: AgentMessage = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf-8'))
        this.handleMessage(tenantId, data)
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e)
        console.error(`[AgentGateway] 租户 ${tenantId} 消息解析失败: ${errMsg}`)
      }
    })

    ws.on('close', (code, reason) => {
      console.log(`[AgentGateway] 租户 ${tenantId} 连接关闭，code=${code}, reason=${reason.toString('utf-8')}`)
      this.handleDisconnect(tenantId)
    })

    ws.on('error', (err) => {
      console.error(`[AgentGateway] 租户 ${tenantId} 连接错误: ${err.message}`)
      this.handleDisconnect(tenantId)
    })
  }

  private handleMessage(tenantId: string, data: AgentMessage): void {
    const meta = this.connections.get(tenantId)
    if (!meta) return

    switch (data.type) {
      case 'heartbeat': {
        meta.lastHeartbeat = Date.now()
        // 回复心跳确认
        const ack: ServerMessage = { type: 'heartbeat:ack' }
        meta.ws.send(JSON.stringify(ack))
        break
      }

      case 'deploy:progress': {
        const progress = data.payload as unknown as DeployProgress
        const requestId = progress.requestId
        if (requestId) {
          const callback = this.progressCallbacks.get(requestId)
          if (callback) {
            callback(progress)
          }
        }
        break
      }

      case 'deploy:result': {
        const result = data.payload as unknown as DeployResult
        const requestId = result.requestId
        if (requestId) {
          const pending = this.pendingRequests.get(requestId)
          if (pending) {
            clearTimeout(pending.timeout)
            this.pendingRequests.delete(requestId)
            this.progressCallbacks.delete(requestId)
            pending.resolve(result)
            console.log(`[AgentGateway] 租户 ${tenantId} 部署完成，requestId=${requestId}, success=${result.success}`)
          }
        }
        break
      }

      default: {
        console.warn(`[AgentGateway] 租户 ${tenantId} 收到未知消息类型: ${data.type}`)
        break
      }
    }
  }

  private handleDisconnect(tenantId: string): void {
    this.cleanupConnection(tenantId)

    // 主动 reject 该租户所有 pending 请求
    for (const [requestId, pending] of this.pendingRequests) {
      if (pending.tenantId === tenantId) {
        clearTimeout(pending.timeout)
        this.pendingRequests.delete(requestId)
        this.progressCallbacks.delete(requestId)
        pending.reject(new Error(`[AgentGateway] 租户 ${tenantId} agent 断线，部署中止`))
      }
    }

    console.log(`[AgentGateway] 租户 ${tenantId} 已断开，agent 离线`)
  }

  private cleanupConnection(tenantId: string): void {
    const meta = this.connections.get(tenantId)
    if (!meta) return

    if (meta.heartbeatTimer) {
      clearInterval(meta.heartbeatTimer)
    }

    if (meta.ws.readyState === WebSocket.OPEN || meta.ws.readyState === WebSocket.CONNECTING) {
      meta.ws.close(1000, 'Connection replaced or cleaned up')
    }

    this.connections.delete(tenantId)
  }

  private checkHeartbeat(tenantId: string): void {
    const meta = this.connections.get(tenantId)
    if (!meta) return

    const elapsed = Date.now() - meta.lastHeartbeat
    if (elapsed > HEARTBEAT_INTERVAL_MS) {
      console.warn(`[AgentGateway] 租户 ${tenantId} 心跳超时（${Math.round(elapsed / 1000)}s），断开连接`)
      meta.ws.close(4010, 'Heartbeat timeout')
      this.handleDisconnect(tenantId)
    }
  }
}

export const agentGateway = new AgentGateway()
