import { EcsManager } from './EcsManager.js'
import { DnsManager } from './DnsManager.js'
import { EcsInstance } from '../models/index.js'
import crypto from 'crypto'
import { logger } from '../utils/logger.js'

export interface ProvisionResult {
  instanceId: string
  eipAddress: string
  domain: string
}

export class TeamProvisionService {
  private ecsManager = new EcsManager()
  private dnsManager = new DnsManager()

  /**
   * 为团队开通完整环境
   *
   * 与旧版的关键区别：
   * - ECS 资源信息写入 EcsInstance 表而非 Team 表
   * - Team 表不再持有任何 ECS 相关字段
   * - 通过 EcsInstance.teamId 关联到团队
   *
   * 步骤：
   * 1. 创建 ECS 实例
   * 2. 等待实例 Running
   * 3. 分配弹性公网 IP
   * 4. 绑定 EIP 到实例
   * 5. 添加 DNS 解析（subdomain + wildcard）
   * 6. 执行初始化脚本（安装 Docker、MongoDB、Node.js、Nginx、acme.sh）
   * 7. 执行 deploy-agent 部署脚本
   * 8. 更新 EcsInstance 记录
   */
  async provision(teamId: string): Promise<void> {
    const subdomain = teamId.slice(-8)
    const baseDomain = process.env.DNS_DOMAIN || ''
    const domain = `${subdomain}.${baseDomain}`
    const backendUrl = process.env.BACKEND_PUBLIC_URL || 'http://localhost:3001'
    const agentToken = crypto.randomBytes(32).toString('hex')

    let instanceId = ''

    try {
      // Step 1: 创建 ECS 实例
      logger.info(`[Provision ${teamId}] Step 1: Creating ECS instance...`)
      const result = await this.ecsManager.createInstance(teamId)
      instanceId = result.instanceId

      // 写入 EcsInstance 记录（初始状态）
      await EcsInstance.create({
        instanceId,
        teamId,
        ecsPrivateIp: result.privateIp,
        agentToken,
        status: 'creating',
      })

      // Step 2: 等待实例 Running
      logger.info(`[Provision ${teamId}] Step 2: Waiting for instance ${instanceId} to be running...`)
      await this.ecsManager.waitInstanceRunning(instanceId)
      await EcsInstance.updateOne({ instanceId }, { $set: { status: 'running' } })

      // Step 3: 分配弹性公网 IP
      logger.info(`[Provision ${teamId}] Step 3: Allocating EIP...`)
      const { allocationId, eipAddress } = await this.ecsManager.allocateEip()
      await EcsInstance.updateOne({ instanceId }, { $set: { status: 'allocating', eipAddress, eipAllocationId: allocationId } })

      // Step 4: 绑定 EIP 到实例
      logger.info(`[Provision ${teamId}] Step 4: Binding EIP ${eipAddress} to instance ${instanceId}...`)
      await this.ecsManager.bindEip(instanceId, allocationId)

      // Step 5: 添加 DNS 解析（subdomain + wildcard）
      logger.info(`[Provision ${teamId}] Step 5: Configuring DNS for ${domain}...`)
      await this.dnsManager.addSubdomain(subdomain, eipAddress)
      await this.dnsManager.addWildcard(subdomain, eipAddress)
      await EcsInstance.updateOne({ instanceId }, { $set: { domain } })

      // Step 6: 执行初始化脚本
      logger.info(`[Provision ${teamId}] Step 6: Running init script...`)
      const initScript = this.generateInitScript(teamId, domain)
      await this.ecsManager.runInitScript(instanceId, initScript)

      // Step 7: 执行 deploy-agent 部署脚本
      logger.info(`[Provision ${teamId}] Step 7: Installing deploy-agent...`)
      const agentScript = this.generateAgentScript(teamId, backendUrl, agentToken)
      await this.ecsManager.runInitScript(instanceId, agentScript)

      // Step 8: 更新 EcsInstance 记录——全部就绪
      logger.info(`[Provision ${teamId}] Step 8: Updating EcsInstance record...`)
      await EcsInstance.updateOne(
        { instanceId },
        {
          $set: {
            status: 'ready',
            provisionedAt: new Date(),
          },
        },
      )

      logger.info(`[Provision ${teamId}] Provision completed successfully.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error(`[Provision ${teamId}] Failed: ${message}`)
      if (instanceId) {
        await EcsInstance.updateOne(
          { instanceId },
          {
            $set: {
              status: 'failed' as const,
              provisionError: message,
            },
          },
        ).catch(() => {})
      }
    }
  }

  /**
   * 获取开通状态——从 EcsInstance 读取
   */
  async getProvisionStatus(teamId: string): Promise<string> {
    const instance = await EcsInstance.findOne({ teamId }).lean()
    return instance?.status ?? 'none'
  }

  /**
   * 生成初始化 shell 脚本
   */
  private generateInitScript(teamId: string, domain: string): string {
    const dnsDomain = process.env.DNS_DOMAIN || ''
    return `#!/bin/bash
set -e

echo "[Provision ${teamId}] Starting initialization..."

# 系统更新
export DEBIAN_FRONTEND=noninteractive
apt-get update -y

# 安装 Docker
echo "[Provision ${teamId}] Installing Docker..."
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# 安装 MongoDB 7
echo "[Provision ${teamId}] Installing MongoDB 7..."
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-7.0.list
apt-get update
apt-get install -y mongodb-org
systemctl enable mongod
systemctl start mongod

# 安装 Node.js 22 via NodeSource
echo "[Provision ${teamId}] Installing Node.js 22..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

# 安装 pnpm
echo "[Provision ${teamId}] Installing pnpm..."
npm install -g pnpm

# 安装 Nginx
echo "[Provision ${teamId}] Installing Nginx..."
apt-get install -y nginx
systemctl enable nginx

# 创建应用目录
mkdir -p /opt/banyuan/apps
mkdir -p /opt/banyuan/www

# 配置 Nginx 基础配置
cat > /etc/nginx/sites-available/${domain} << 'NGINX_CONF'
server {
    listen 80;
    server_name ${domain} *.${domain};

    # 默认：静态应用通过 subdomain 路由
    set $app_dir /opt/banyuan/www/default;
    if ($host ~* ^([a-z0-9-]+)\\.${domain}$) {
        set $app_dir /opt/banyuan/www/$1;
    }

    location / {
        root $app_dir;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    location /assets/ {
        root $app_dir;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
NGINX_CONF

ln -sf /etc/nginx/sites-available/${domain} /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# 安装 acme.sh
echo "[Provision ${teamId}] Installing acme.sh..."
curl https://get.acme.sh | sh -s email=admin@${dnsDomain}

echo "[Provision ${teamId}] Initialization completed."
`
  }

  /**
   * 生成 deploy-agent 安装脚本
   * 从 npm registry 安装 @banyuan/deploy-agent，配置 systemd 服务
   */
  private generateAgentScript(teamId: string, backendUrl: string, agentToken: string): string {
    const wsUrl = backendUrl.replace(/^http/, 'ws') + '/ws/agent'

    return `#!/bin/bash
set -e

echo "[Provision ${teamId}] Installing deploy-agent..."

# 从 npm registry 安装 @banyuan/deploy-agent
npm install -g @banyuan/deploy-agent

# 创建配置目录和工作目录
mkdir -p /etc/deploy-agent
mkdir -p /opt/banyuan/apps
mkdir -p /opt/banyuan/www

# 配置 systemd 服务
cat > /etc/systemd/system/deploy-agent.service << EOF
[Unit]
Description=Banyuan Deploy Agent for team ${teamId}
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/deploy-agent
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=TEAM_ID=${teamId}
Environment=AGENT_TOKEN=${agentToken}
Environment=BACKEND_WS_URL=${wsUrl}
Environment=DEPLOY_ROOT=/opt/banyuan/apps
Environment=NGINX_SITES_DIR=/etc/nginx/sites-enabled
WorkingDirectory=/opt/banyuan

[Install]
WantedBy=multi-user.target
EOF

# 启动服务
systemctl daemon-reload
systemctl enable deploy-agent
systemctl start deploy-agent

echo "[Provision ${teamId}] Deploy-agent installed and started."
`
  }
}

export const teamProvisionService = new TeamProvisionService()
