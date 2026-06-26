/**
 * ECS 实例（EcsInstance）类型定义
 *
 * ECS 从 Tenant 内联字段解耦为独立资源实体。
 * 运营上保持 1:1（一个租户绑定一个 ECS 实例），
 * 模型上已解耦，未来可演进为资源池化分配。
 */

export type EcsInstanceStatus =
  | 'creating'        // 创建中
  | 'running'         // 实例运行中
  | 'allocating'      // 分配 EIP / 配置 DNS
  | 'ready'           // 全部就绪，agent 已在线
  | 'deprovisioning'  // 回收中
  | 'terminated'      // 已释放

/** 单条 ECS 监控指标快照 */
export interface IEcsMetric {
  /** 采集时间 */
  timestamp: Date
  /** CPU 使用率（0-100） */
  cpu: number
  /** 内存使用率（0-100） */
  memory: number
  /** 磁盘使用率（0-100） */
  disk: number
}

export interface IEcsInstance {
  /** 阿里云 ECS 实例 ID（如 i-2ze...），作为主键 */
  instanceId: string
  /** 当前绑定的租户 ID（可为 null，表示未分配/待回收） */
  tenantId?: string
  /** ECS 内网 IP */
  ecsPrivateIp: string
  /** 弹性公网 IP */
  eipAddress?: string
  /** EIP 分配 ID */
  eipAllocationId?: string
  /** 租户子域名（如 abc12345.banyuan.club） */
  domain?: string
  /** deploy-agent 认证 token */
  agentToken: string
  /** 实例状态 */
  status: EcsInstanceStatus
  /** 开通失败时的错误信息 */
  provisionError?: string
  /** 开通完成时间 */
  provisionedAt?: Date
  /** 释放时间 */
  terminatedAt?: Date
  /** 监控指标时间序列（最近 100 条） */
  metrics: IEcsMetric[]
  createdAt: Date
  updatedAt: Date
}
