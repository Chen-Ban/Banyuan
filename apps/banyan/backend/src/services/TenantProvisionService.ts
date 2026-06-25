import { EcsManager } from './EcsManager.js'
import { DnsManager } from './DnsManager.js'
import { Tenant } from '../models/Tenant.js'
import type { ProvisionStatus } from '../models/types/index.js'

export interface ProvisionResult {
  instanceId: string
  eipAddress: string
  domain: string
}

export class TenantProvisionService {
  private ecsManager = new EcsManager()
  private dnsManager = new DnsManager()

  /**
   * 为租户开通完整环境
   * 步骤：
   * 1. 创建 ECS 实例
   * 2. 等待实例 Running
   * 3. 分配弹性公网 IP
   * 4. 绑定 EIP 到实例
   * 5. 添加 DNS 解析（subdomain + wildcard）
   * 6. 执行初始化脚本（安装 Docker、MongoDB、Node.js、Nginx、acme.sh）
   * 7. 执行 deploy-agent 部署脚本
   * 8. 更新 Tenant 记录
   */
  async provision(tenantId: string): Promise<void> {
    const subdomain = tenantId.slice(-8)
    const domain = `${subdomain}.banyuan.club`
    const backendUrl = process.env.BACKEND_PUBLIC_URL || 'http://localhost:3001'

    try {
      // Step 1: 创建 ECS 实例
      console.log(`[Provision ${tenantId}] Step 1: Creating ECS instance...`)
      await this.updateStatus(tenantId, 'creating_ecs')
      const { instanceId, privateIp } = await this.ecsManager.createInstance(tenantId)

      // Step 2: 等待实例 Running
      console.log(`[Provision ${tenantId}] Step 2: Waiting for instance ${instanceId} to be running...`)
      await this.ecsManager.waitInstanceRunning(instanceId)

      // Step 3: 分配弹性公网 IP
      console.log(`[Provision ${tenantId}] Step 3: Allocating EIP...`)
      const { allocationId, eipAddress } = await this.ecsManager.allocateEip()

      // Step 4: 绑定 EIP 到实例
      console.log(`[Provision ${tenantId}] Step 4: Binding EIP ${eipAddress} to instance ${instanceId}...`)
      await this.ecsManager.bindEip(instanceId, allocationId)

      // Step 5: 添加 DNS 解析（subdomain + wildcard）
      console.log(`[Provision ${tenantId}] Step 5: Configuring DNS for ${domain}...`)
      await this.updateStatus(tenantId, 'configuring_dns')
      await this.dnsManager.addSubdomain(subdomain, eipAddress)
      await this.dnsManager.addWildcard(subdomain, eipAddress)

      // Step 6: 执行初始化脚本
      console.log(`[Provision ${tenantId}] Step 6: Running init script...`)
      await this.updateStatus(tenantId, 'initializing')
      const initScript = this.generateInitScript(tenantId, domain)
      await this.ecsManager.runInitScript(instanceId, initScript)

      // Step 7: 执行 deploy-agent 部署脚本
      console.log(`[Provision ${tenantId}] Step 7: Installing deploy-agent...`)
      await this.updateStatus(tenantId, 'installing_agent')
      const agentScript = this.generateAgentScript(tenantId, backendUrl)
      await this.ecsManager.runInitScript(instanceId, agentScript)

      // Step 8: 更新 Tenant 记录
      console.log(`[Provision ${tenantId}] Step 8: Updating tenant record...`)
      await Tenant.updateOne(
        { tenantId },
        {
          $set: {
            ecsInstanceId: instanceId,
            ecsPrivateIp: privateIp,
            eipAddress,
            eipAllocationId: allocationId,
            domain,
            provisionStatus: 'ready' as ProvisionStatus,
            provisionedAt: new Date(),
          },
        },
      )

      console.log(`[Provision ${tenantId}] Provision completed successfully.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[Provision ${tenantId}] Failed: ${message}`)
      await Tenant.updateOne(
        { tenantId },
        {
          $set: {
            provisionStatus: 'failed' as ProvisionStatus,
            provisionError: message,
          },
        },
      ).catch(() => {})
    }
  }

  /**
   * 获取开通状态
   */
  async getProvisionStatus(tenantId: string): Promise<ProvisionStatus> {
    const tenant = await Tenant.findOne({ tenantId }).lean()
    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`)
    }
    return tenant.provisionStatus || 'none'
  }

  /**
   * 生成初始化 shell 脚本
   * 安装：Docker CE、MongoDB 7、Node.js 22 (via NodeSource)、pnpm、Nginx、acme.sh
   * 配置：nginx 基础配置、SSL 证书申请（通配符）
   */
  private generateInitScript(tenantId: string, domain: string): string {
    return `#!/bin/bash
set -e

echo "[Provision ${tenantId}] Starting initialization..."

# 系统更新
export DEBIAN_FRONTEND=noninteractive
apt-get update -y

# 安装 Docker
echo "[Provision ${tenantId}] Installing Docker..."
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# 安装 MongoDB 7
echo "[Provision ${tenantId}] Installing MongoDB 7..."
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-7.0.list
apt-get update
apt-get install -y mongodb-org
systemctl enable mongod
systemctl start mongod

# 安装 Node.js 22 via NodeSource
echo "[Provision ${tenantId}] Installing Node.js 22..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

# 安装 pnpm
echo "[Provision ${tenantId}] Installing pnpm..."
npm install -g pnpm

# 安装 Nginx
echo "[Provision ${tenantId}] Installing Nginx..."
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
echo "[Provision ${tenantId}] Installing acme.sh..."
curl https://get.acme.sh | sh -s email=admin@banyuan.club

echo "[Provision ${tenantId}] Initialization completed."
`
  }

  /**
   * 生成 deploy-agent 安装脚本
   * 从 npm registry 安装 @banyuan/deploy-agent，配置 systemd 服务
   */
  private generateAgentScript(tenantId: string, backendUrl: string): string {
    // 从 Tenant 记录中获取 agentToken（已在创建时写入）
    const wsUrl = backendUrl.replace(/^http/, 'ws') + '/ws/agent'

    return `#!/bin/bash
set -e

echo "[Provision ${tenantId}] Installing deploy-agent..."

# 从 npm registry 安装 @banyuan/deploy-agent
npm install -g @banyuan/deploy-agent

# 创建配置目录和工作目录
mkdir -p /etc/deploy-agent
mkdir -p /opt/banyuan/apps
mkdir -p /opt/banyuan/www

# 配置 systemd 服务
cat > /etc/systemd/system/deploy-agent.service << EOF
[Unit]
Description=Banyuan Deploy Agent for tenant ${tenantId}
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/deploy-agent
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=TENANT_ID=${tenantId}
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

echo "[Provision ${tenantId}] Deploy-agent installed and started."
`
  }

  /**
   * 更新租户的 provisionStatus 字段
   */
  private async updateStatus(tenantId: string, status: ProvisionStatus): Promise<void> {
    await Tenant.updateOne({ tenantId }, { $set: { provisionStatus: status } })
  }
}

export const tenantProvisionService = new TenantProvisionService()
