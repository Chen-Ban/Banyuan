/**
 * DeployAgent 核心实现
 * 通过 WebSocket 连接到 banyan 后端，接收部署指令并在本地执行
 */

import { WebSocket } from 'ws';
import { execFile } from 'node:child_process';
import { mkdir, cp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type {
  AgentConfig,
  AgentMessage,
  DeployRequest,
  DeployProgress,
  DeployResult,
} from './types.js';
import { scaffoldProject, scaffoldServer } from './scaffold.js';

const execFileAsync = promisify(execFile);

/** 重连参数 */
const INITIAL_RECONNECT_DELAY = 5000;
const MAX_RECONNECT_DELAY = 60000;
const HEARTBEAT_INTERVAL = 30000;

export class DeployAgent {
  private ws: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = INITIAL_RECONNECT_DELAY;
  private isConnected = false;
  private shouldReconnect = true;

  constructor(private config: AgentConfig) {}

  /** 连接到后端 WebSocket，包含自动重连逻辑 */
  async connect(): Promise<void> {
    this.shouldReconnect = true;
    this.doConnect();
  }

  /** 断开连接 */
  disconnect(): void {
    this.shouldReconnect = false;
    this.cleanup();
    if (this.ws) {
      this.ws.close(1000, 'Agent shutting down');
      this.ws = null;
    }
    this.log('Disconnected');
  }

  private doConnect(): void {
    this.log(`Connecting to ${this.config.backendWsUrl}...`);

    this.ws = new WebSocket(this.config.backendWsUrl);

    this.ws.on('open', () => {
      this.isConnected = true;
      this.reconnectDelay = INITIAL_RECONNECT_DELAY;
      this.log('Connected, sending auth...');

      // 发送认证
      this.send('auth', {
        agentToken: this.config.agentToken,
        tenantId: this.config.tenantId,
      });

      // 启动心跳
      this.startHeartbeat();
    });

    this.ws.on('message', (data) => {
      try {
        const msg: AgentMessage = JSON.parse(data.toString());
        this.handleMessage(msg);
      } catch (err) {
        this.log(`Failed to parse message: ${err}`);
      }
    });

    this.ws.on('close', (code, reason) => {
      this.isConnected = false;
      this.cleanup();
      this.log(`Connection closed: ${code} ${reason.toString()}`);

      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    });

    this.ws.on('error', (err) => {
      this.log(`WebSocket error: ${err.message}`);
    });
  }

  private handleMessage(msg: AgentMessage): void {
    switch (msg.type) {
      case 'auth:success':
        this.log('Authentication successful');
        break;

      case 'auth:fail':
        this.log('Authentication failed, disconnecting...');
        this.shouldReconnect = false;
        this.ws?.close();
        break;

      case 'heartbeat:ack':
        // 心跳确认，无需处理
        break;

      case 'deploy:start':
        this.handleDeployStart(msg.payload as DeployRequest).catch((err) => {
          this.log(`Deploy error: ${err}`);
        });
        break;

      case 'deploy:cancel':
        this.log(`Deploy cancelled: ${(msg.payload as { requestId: string }).requestId}`);
        break;

      default:
        this.log(`Unknown message type: ${msg.type}`);
    }
  }

  private async handleDeployStart(request: DeployRequest): Promise<void> {
    // uiJSON 可能是字符串（后端直接从 MongoDB 传输），需要 parse 为对象
    if (typeof request.uiJSON === 'string') {
      request.uiJSON = JSON.parse(request.uiJSON);
    }

    this.log(`Starting deploy: ${request.appSlug} (${request.deployType})`);

    try {
      let url: string;

      if (request.deployType === 'fullstack') {
        url = await this.deployFullstack(request);
      } else {
        url = await this.deployStatic(request);
      }

      this.sendResult(request.requestId, true, url);
      this.log(`Deploy success: ${url}`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.sendResult(request.requestId, false, undefined, errorMsg);
      this.log(`Deploy failed: ${errorMsg}`);
    }
  }

  private sendProgress(requestId: string, step: string, progress: number, message: string): void {
    const payload: DeployProgress = { requestId, step, progress, message };
    this.send('deploy:progress', payload);
  }

  private sendResult(requestId: string, success: boolean, url?: string, error?: string): void {
    const payload: DeployResult = { requestId, success, url, error };
    this.send('deploy:result', payload);
  }

  /** 执行静态应用部署 */
  private async deployStatic(request: DeployRequest): Promise<string> {
    const projectDir = join(this.config.deployRoot, request.appSlug);
    const wwwDir = '/opt/banyuan/www';
    const siteDir = join(wwwDir, request.appSlug);

    // Step 1: Scaffold 项目
    this.sendProgress(request.requestId, 'scaffold', 10, '生成项目文件...');
    await mkdir(projectDir, { recursive: true });
    await scaffoldProject(projectDir, request.uiJSON);

    // Step 2: 安装依赖
    this.sendProgress(request.requestId, 'install', 30, '安装依赖...');
    await this.exec('pnpm', ['install', '--frozen-lockfile'], projectDir);

    // Step 3: 构建
    this.sendProgress(request.requestId, 'build', 50, '构建应用...');
    await this.exec('pnpm', ['build'], projectDir);

    // Step 4: 复制 dist 到 www 目录
    this.sendProgress(request.requestId, 'copy', 70, '部署静态文件...');
    const distDir = join(projectDir, 'dist');
    await rm(siteDir, { recursive: true, force: true });
    await mkdir(siteDir, { recursive: true });
    await cp(distDir, siteDir, { recursive: true });

    // Step 5: 生成 nginx 配置
    this.sendProgress(request.requestId, 'nginx', 85, '配置 Nginx...');
    const nginxConf = this.generateNginxStaticConf(request.appSlug, request.tenantDomain, siteDir);
    const confPath = join(this.config.nginxSitesDir, `${request.appSlug}.${request.tenantDomain}.conf`);
    await writeFile(confPath, nginxConf);

    // Step 6: Reload nginx
    this.sendProgress(request.requestId, 'reload', 95, '重载 Nginx...');
    await this.exec('nginx', ['-s', 'reload']);

    // Step 7: 返回 URL
    const url = `https://${request.appSlug}.${request.tenantDomain}`;
    this.sendProgress(request.requestId, 'done', 100, '部署完成');
    return url;
  }

  /** 执行全栈应用部署（前端 + Koa 服务端 Docker 容器） */
  private async deployFullstack(request: DeployRequest): Promise<string> {
    const projectDir = join(this.config.deployRoot, request.appSlug);
    const wwwDir = '/opt/banyuan/www';
    const siteDir = join(wwwDir, request.appSlug);
    const containerPort = request.containerPort ?? 4000;
    const containerName = `banyuan-${request.appSlug}`;

    // Step 1: Scaffold 前端项目
    this.sendProgress(request.requestId, 'scaffold-frontend', 5, '生成前端项目文件...');
    await mkdir(projectDir, { recursive: true });
    await scaffoldProject(projectDir, request.uiJSON);

    // Step 2: 安装依赖并构建前端
    this.sendProgress(request.requestId, 'install', 15, '安装前端依赖...');
    await this.exec('pnpm', ['install', '--frozen-lockfile'], projectDir);

    this.sendProgress(request.requestId, 'build-frontend', 30, '构建前端...');
    await this.exec('pnpm', ['build'], projectDir);

    // Step 3: 复制前端 dist 到 www 目录
    this.sendProgress(request.requestId, 'copy', 40, '部署前端静态文件...');
    const distDir = join(projectDir, 'dist');
    await rm(siteDir, { recursive: true, force: true });
    await mkdir(siteDir, { recursive: true });
    await cp(distDir, siteDir, { recursive: true });

    // Step 4: Scaffold 服务端（生成 Koa + Mongoose + FlowRunner）
    this.sendProgress(request.requestId, 'scaffold-server', 50, '生成服务端代码...');
    const serverDir = join(projectDir, 'server');
    await rm(serverDir, { recursive: true, force: true });
    await scaffoldServer({
      serverDir,
      appSlug: request.appSlug,
      collections: request.collections ?? [],
      cloudFunctions: request.cloudFunctions ?? [],
      containerPort,
    });

    // Step 5: Docker build
    this.sendProgress(request.requestId, 'docker-build', 65, '构建服务端容器镜像...');
    await this.exec('docker', ['build', '-t', containerName, '.'], serverDir);

    // Step 6: 停止旧容器（如果存在）并启动新容器
    this.sendProgress(request.requestId, 'docker-run', 75, '启动服务端容器...');
    try {
      await this.exec('docker', ['stop', containerName]);
      await this.exec('docker', ['rm', containerName]);
    } catch {
      // 容器不存在，忽略
    }

    await this.exec('docker', [
      'run', '-d',
      '--name', containerName,
      '--restart', 'unless-stopped',
      '-p', `${containerPort}:${containerPort}`,
      '-e', `MONGODB_URI=${process.env.MONGODB_URI || 'mongodb://host.docker.internal:27017/banyuan_' + request.appSlug}`,
      '-e', `PORT=${containerPort}`,
      '--add-host', 'host.docker.internal:host-gateway',
      containerName,
    ]);

    // Step 7: 生成 nginx 配置（前端静态 + /api 反向代理到容器）
    this.sendProgress(request.requestId, 'nginx', 90, '配置 Nginx...');
    const nginxConf = this.generateNginxFullstackConf(
      request.appSlug,
      request.tenantDomain,
      siteDir,
      containerPort,
    );
    const confPath = join(this.config.nginxSitesDir, `${request.appSlug}.${request.tenantDomain}.conf`);
    await writeFile(confPath, nginxConf);

    // Step 8: Reload nginx
    this.sendProgress(request.requestId, 'reload', 95, '重载 Nginx...');
    await this.exec('nginx', ['-s', 'reload']);

    // Step 9: 返回 URL
    const url = `https://${request.appSlug}.${request.tenantDomain}`;
    this.sendProgress(request.requestId, 'done', 100, '全栈部署完成');
    return url;
  }

  // ---- Helper Methods ----

  private send(type: string, payload: unknown): void {
    if (this.ws && this.isConnected) {
      this.ws.send(JSON.stringify({ type, payload }));
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.send('heartbeat', { timestamp: Date.now() });
    }, HEARTBEAT_INTERVAL);
  }

  private scheduleReconnect(): void {
    this.log(`Reconnecting in ${this.reconnectDelay / 1000}s...`);
    this.reconnectTimer = setTimeout(() => {
      this.doConnect();
    }, this.reconnectDelay);

    // 指数退避
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY);
  }

  private cleanup(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private async exec(command: string, args: string[], cwd?: string): Promise<string> {
    const { stdout } = await execFileAsync(command, args, {
      cwd,
      maxBuffer: 50 * 1024 * 1024,
      env: { ...process.env, NODE_ENV: 'production' },
    });
    return stdout;
  }

  private generateNginxStaticConf(appSlug: string, tenantDomain: string, siteDir: string): string {
    return `server {
    listen 80;
    server_name ${appSlug}.${tenantDomain};

    root ${siteDir};
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;
}
`;
  }

  private generateNginxFullstackConf(
    appSlug: string,
    tenantDomain: string,
    siteDir: string,
    containerPort: number,
  ): string {
    return `server {
    listen 80;
    server_name ${appSlug}.${tenantDomain};

    root ${siteDir};
    index index.html;

    # API 请求代理到容器
    location /api/ {
        proxy_pass http://127.0.0.1:${containerPort};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 静态文件
    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;
}
`;
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString();
    console.log(`[DeployAgent] [${timestamp}] ${message}`);
  }
}
