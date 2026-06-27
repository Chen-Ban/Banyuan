import { WebSocketServer, WebSocket } from 'ws'
import type { Server as HttpServer, IncomingMessage } from 'http'
import crypto from 'crypto'
import { EcsInstance } from '../models/index.js'
import type { IEcsInstance } from '../models/types/index.js'
import { logger } from '../utils/logger.js'

// ─── 消息协议（与 @banyuan/deploy-agent 对齐）────────────────────────────────────

/**
 * 后端 → Agent 的消息类型
 */
export type ServerToAgentType =
  | 'deploy:start'
  | 'deploy:cancel'
  | 'heartbeat:ack'
  | 'auth:success'
  | 'auth:fail'

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
  uiJSON: string
  deployType: 'static' | 'fullstack'
  /** 团队域名（如 abc12345.banyuan.club） */
  teamDomain: string
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
  teamId: string
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
  /** teamId → 连接元信息 */
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
        logger.warn('[AgentGateway] 连接缺少 token 参数，拒绝升级')
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

    logger.info(`[AgentGateway] WebSocket 服务已附加，路径: ${WS_PATH}`)
  }

  /**
   * 检查某个团队的 agent 是否在线
   */
  isAgentOnline(teamId: string): boolean {
    const meta = this.connections.get(teamId)
    return meta !== undefined && meta.authenticated && meta.ws.readyState === WebSocket.OPEN
  }

  /**
   * 向指定团队的 agent 发送部署指令
   * 返回 Promise，在 agent 返回结果时 resolve
   */
  deploy(
    teamId: string,
    request: DeployRequest,
    onProgress?: (p: DeployProgress) => void,
  ): Promise<DeployResult> {
    return new Promise<DeployResult>((resolve, reject) => {
      const meta = this.connections.get(teamId)
      if (!meta || !meta.authenticated || meta.ws.readyState !== WebSocket.OPEN) {
        reject(new Error(`[AgentGateway] 团队 ${teamId} 的 agent 不在线`))
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

      // 注册 pending request（含 teamId 以便断线时清理）
      this.pendingRequests.set(requestId, { teamId, resolve, reject, timeout })

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

      logger.info(`[AgentGateway] 已向团队 ${teamId} 发送部署指令，requestId=${requestId}`)
    })
  }

  /**
   * 获取所有在线的 agent 团队列表
   */
  getOnlineAgents(): string[] {
    const agents: string[] = []
    for (const [teamId, meta] of this.connections) {
      if (meta.authenticated && meta.ws.readyState === WebSocket.OPEN) {
        agents.push(teamId)
      }
    }
    return agents
  }

  // ─── 私有方法 ──────────────────────────────────────────────────────────────────

  private handleNewConnection(ws: WebSocket, token: string): void {
    // 等待 auth 消息，超时则断开
    const authTimeout = setTimeout(() => {
      logger.warn('[AgentGateway] 连接认证超时，关闭连接')
      ws.close(4001, 'Authentication timeout')
    }, AUTH_TIMEOUT_MS)

    const tempMeta: ConnectionMeta = {
      ws,
      authenticated: false,
      lastHeartbeat: Date.now(),
      heartbeatTimer: null,
    }

    // 首条消息必须是 auth
    const onFirstMessage = async (raw: Buffer | string) => {
      ws.off('message', onFirstMessage)
      clearTimeout(authTimeout)

      try {
        const data: AgentMessage = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf-8'))

        if (data.type !== 'auth') {
          logger.warn('[AgentGateway] 首条消息非 auth 类型，关闭连接')
          ws.close(4002, 'First message must be auth')
          return
        }

        // deploy-agent 发送 { agentToken, teamId }
        const { teamId, agentToken } = data.payload as { teamId: string; agentToken: string }

        if (!teamId || !agentToken) {
          logger.warn('[AgentGateway] auth 消息缺少 teamId 或 agentToken')
          const failMsg: ServerMessage = {
            type: 'auth:fail',
            payload: { reason: 'Missing teamId or agentToken' },
          }
          ws.send(JSON.stringify(failMsg))
          ws.close(4003, 'Missing teamId or agentToken')
          return
        }

        // 验证 token 一致性（URL token 与 auth payload agentToken 必须一致）
        if (token !== agentToken) {
          logger.warn(`[AgentGateway] 团队 ${teamId} token 不匹配`)
          const failMsg: ServerMessage = { type: 'auth:fail', payload: { reason: 'Token mismatch' } }
          ws.send(JSON.stringify(failMsg))
          ws.close(4004, 'Token mismatch')
          return
        }

        // DB 校验：从 EcsInstance 表验证 agentToken 是否匹配
        let instance: IEcsInstance | null
        try {
          instance = await EcsInstance.findOne({ teamId }).lean()
        } catch (dbErr) {
          const msg = dbErr instanceof Error ? dbErr.message : String(dbErr)
          logger.error(`[AgentGateway] 团队 ${teamId} EcsInstance 查询失败: ${msg}`)
          const failMsg: ServerMessage = { type: 'auth:fail', payload: { reason: 'Internal error' } }
          ws.send(JSON.stringify(failMsg))
          ws.close(1011, 'Internal error')
          return
        }
        if (!instance) {
          logger.warn(`[AgentGateway] 团队 ${teamId} 未找到绑定的 ECS 实例`)
          const failMsg: ServerMessage = { type: 'auth:fail', payload: { reason: 'No ECS instance bound' } }
          ws.send(JSON.stringify(failMsg))
          ws.close(4005, 'No ECS instance bound')
          return
        }
        if (instance.agentToken !== agentToken) {
          logger.warn(`[AgentGateway] 团队 ${teamId} agentToken 与 EcsInstance 不匹配`)
          const failMsg: ServerMessage = {
            type: 'auth:fail',
            payload: { reason: 'Agent token mismatch with database' },
          }
          ws.send(JSON.stringify(failMsg))
          ws.close(4006, 'Agent token mismatch with database')
          return
        }

        // 如果该团队已有连接，关闭旧连接
        const existing = this.connections.get(teamId)
        if (existing) {
          logger.info(`[AgentGateway] 团队 ${teamId} 已有连接，关闭旧连接`)
          this.cleanupConnection(teamId)
        }

        // 标记已认证
        tempMeta.authenticated = true
        tempMeta.lastHeartbeat = Date.now()

        // 启动心跳检测
        tempMeta.heartbeatTimer = setInterval(() => {
          this.checkHeartbeat(teamId)
        }, HEARTBEAT_INTERVAL_MS)

        this.connections.set(teamId, tempMeta)

        // 注册后续消息处理
        this.handleConnection(ws, teamId)

        logger.info(`[AgentGateway] 团队 ${teamId} 认证成功，agent 已上线`)

        // 发送认证确认（auth:success）
        const ack: ServerMessage = { type: 'auth:success', payload: { teamId } }
        ws.send(JSON.stringify(ack))
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e)
        logger.error(`[AgentGateway] 解析 auth 消息失败: ${errMsg}`)
        ws.close(4005, 'Invalid auth message')
      }
    }

    ws.on('message', onFirstMessage)

    ws.on('close', () => {
      clearTimeout(authTimeout)
      ws.off('message', onFirstMessage)
    })
  }

  private handleConnection(ws: WebSocket, teamId: string): void {
    ws.on('message', (raw: Buffer | string) => {
      try {
        const data: AgentMessage = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf-8'))
        this.handleMessage(teamId, data)
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e)
        logger.error(`[AgentGateway] 团队 ${teamId} 消息解析失败: ${errMsg}`)
      }
    })

    ws.on('close', (code, reason) => {
      logger.info(
        `[AgentGateway] 团队 ${teamId} 连接关闭，code=${code}, reason=${reason.toString('utf-8')}`,
      )
      this.handleDisconnect(teamId)
    })

    ws.on('error', (err) => {
      logger.error(`[AgentGateway] 团队 ${teamId} 连接错误: ${err.message}`)
      this.handleDisconnect(teamId)
    })
  }

  private handleMessage(teamId: string, data: AgentMessage): void {
    const meta = this.connections.get(teamId)
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
            logger.info(
              `[AgentGateway] 团队 ${teamId} 部署完成，requestId=${requestId}, success=${result.success}`,
            )
          }
        }
        break
      }

      default: {
        logger.warn(`[AgentGateway] 团队 ${teamId} 收到未知消息类型: ${data.type}`)
        break
      }
    }
  }

  private handleDisconnect(teamId: string): void {
    this.cleanupConnection(teamId)

    // 主动 reject 该团队所有 pending 请求
    for (const [requestId, pending] of this.pendingRequests) {
      if (pending.teamId === teamId) {
        clearTimeout(pending.timeout)
        this.pendingRequests.delete(requestId)
        this.progressCallbacks.delete(requestId)
        pending.reject(new Error(`[AgentGateway] 团队 ${teamId} agent 断线，部署中止`))
      }
    }

    logger.info(`[AgentGateway] 团队 ${teamId} 已断开，agent 离线`)
  }

  private cleanupConnection(teamId: string): void {
    const meta = this.connections.get(teamId)
    if (!meta) return

    if (meta.heartbeatTimer) {
      clearInterval(meta.heartbeatTimer)
    }

    if (meta.ws.readyState === WebSocket.OPEN || meta.ws.readyState === WebSocket.CONNECTING) {
      meta.ws.close(1000, 'Connection replaced or cleaned up')
    }

    this.connections.delete(teamId)
  }

  private checkHeartbeat(teamId: string): void {
    const meta = this.connections.get(teamId)
    if (!meta) return

    const elapsed = Date.now() - meta.lastHeartbeat
    if (elapsed > HEARTBEAT_INTERVAL_MS) {
      logger.warn(`[AgentGateway] 团队 ${teamId} 心跳超时（${Math.round(elapsed / 1000)}s），断开连接`)
      meta.ws.close(4010, 'Heartbeat timeout')
      this.handleDisconnect(teamId)
    }
  }
}

export const agentGateway = new AgentGateway()
