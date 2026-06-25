/**
 * 租户（Tenant）类型定义
 */

export type ProvisionStatus =
  | 'none' // 未开通（默认）
  | 'pending' // 等待开通
  | 'creating_ecs' // 创建 ECS 实例中
  | 'configuring_dns' // 配置 DNS 解析中
  | 'initializing' // 执行初始化脚本中
  | 'installing_agent' // 安装 deploy-agent 中
  | 'ready' // 开通完成，agent 已就绪
  | 'failed' // 开通失败

export interface ITenant {
  tenantId: string
  name: string
  plan: 'free' | 'pro'

  // ─── ECS 开通信息 ───────────────────────────────────────────────────────────
  /** ECS 实例 ID（如 i-2ze...） */
  ecsInstanceId?: string
  /** ECS 内网 IP */
  ecsPrivateIp?: string
  /** 弹性公网 IP */
  eipAddress?: string
  /** EIP 分配 ID */
  eipAllocationId?: string
  /** 租户子域名（如 abc12345.banyuan.club） */
  domain?: string
  /** deploy-agent 认证 token */
  agentToken?: string
  /** 开通状态 */
  provisionStatus: ProvisionStatus
  /** 开通失败时的错误信息 */
  provisionError?: string
  /** 开通完成时间 */
  provisionedAt?: Date

  createdAt: Date
  updatedAt: Date
}
