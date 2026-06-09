/**
 * PreviewServerOrchestrator — 预览态本地后端编排器（Electron 主进程）
 *
 * 在应用创建者本地机器上运行：
 *   1. 接收 { appId, appJSON, collectionSchemas, cloudFunctions }
 *   2. 调用 deploy-agent scaffoldServer 生成后端工程到临时目录
 *   3. npm install + 起 Node 进程，返回本地服务地址
 *   4. 按 appId 维护端口表与进程复用
 *   5. 支持热更新（文件 diff 写入，CollectionSchema 变更时重启）
 *   6. 进程生命周期管理（idle 超时自动销毁）
 *
 * 关联决策：ADR app/architecture A5
 * 关联方案：docs/specs/app/preview-local-backend.md
 */

import { randomUUID } from 'crypto';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { spawn, type ChildProcess } from 'child_process';
import { scaffoldServer, type ScaffoldServerOptions, type CollectionDef, type CloudFunctionDef } from '@banyuan/deploy-agent';

// ─── 类型定义 ────────────────────────────────────────────────────────────────

export interface PreviewServerInput {
  appId: string;
  appSlug?: string;
  appJSON: Record<string, unknown>;
  collectionSchemas: CollectionDef[];
  cloudFunctions: CloudFunctionDef[];
}

export type PreviewServerStatus = 'starting' | 'running' | 'stopping' | 'stopped' | 'error';

export interface PreviewServerInstance {
  appId: string;
  port: number;
  status: PreviewServerStatus;
  serverDir: string;
  url: string;
  process: ChildProcess | null;
  createdAt: number;
  updatedAt: number;
  /** 最近一次输入快照（用于热更新 diff） */
  lastInput: PreviewServerInput;
  error?: string;
}

export interface PreviewServerInfo {
  appId: string;
  port: number;
  status: PreviewServerStatus;
  url: string;
  createdAt: number;
  updatedAt: number;
  error?: string;
}

// ─── 常量 ────────────────────────────────────────────────────────────────────

/** 预览服务端口范围：9100-9199（最多同时 100 个预览） */
const PORT_RANGE_START = 9100;
const PORT_RANGE_END = 9199;

/** 空闲超时：30 分钟无活动后自动销毁 */
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/** 本地 Mongo 默认 URI（开发者本地环境） */
const LOCAL_MONGO_URI = process.env.PREVIEW_MONGO_URI || 'mongodb://localhost:27017';

/** 临时目录前缀 */
const TEMP_DIR_PREFIX = 'banyuan-preview-';

// ─── 编排器实现 ──────────────────────────────────────────────────────────────

export class PreviewServerOrchestrator {
  /** appId → PreviewServerInstance */
  private instances = new Map<string, PreviewServerInstance>();

  /** 已占用端口 */
  private usedPorts = new Set<number>();

  /** appId → idle timer */
  private idleTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // ─── 公开 API ──────────────────────────────────────────────────────────

  /**
   * 启动或复用预览服务
   * 同一 appId 复用已有进程（热更新），不同 appId 分配新端口
   */
  async start(input: PreviewServerInput): Promise<PreviewServerInfo> {
    const { appId } = input;

    // 已有运行中实例 → 热更新
    const existing = this.instances.get(appId);
    if (existing && (existing.status === 'running' || existing.status === 'starting')) {
      await this.hotUpdate(existing, input);
      this.resetIdleTimer(appId);
      return this.toInfo(existing);
    }

    // 创建新实例
    const port = this.allocatePort();
    const serverDir = path.join(os.tmpdir(), `${TEMP_DIR_PREFIX}${appId}-${randomUUID().slice(0, 8)}`);

    const instance: PreviewServerInstance = {
      appId,
      port,
      status: 'starting',
      serverDir,
      url: `http://localhost:${port}`,
      process: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastInput: input,
    };

    this.instances.set(appId, instance);

    try {
      // Step 1: scaffold 生成后端工程
      await this.scaffold(instance, input);

      // Step 2: npm install
      await this.install(instance);

      // Step 3: 起进程
      await this.spawnServer(instance);

      instance.status = 'running';
      instance.updatedAt = Date.now();
      this.resetIdleTimer(appId);

      console.log(`[PreviewServer] ${appId} running on port ${port}`);
      return this.toInfo(instance);
    } catch (err) {
      instance.status = 'error';
      instance.error = err instanceof Error ? err.message : String(err);
      instance.updatedAt = Date.now();
      this.usedPorts.delete(port);
      console.error(`[PreviewServer] ${appId} start failed:`, err);
      throw err;
    }
  }

  /**
   * 停止某 appId 的预览服务
   */
  async stop(appId: string): Promise<void> {
    const instance = this.instances.get(appId);
    if (!instance) return;

    instance.status = 'stopping';
    instance.updatedAt = Date.now();

    this.clearIdleTimer(appId);

    // kill 进程
    if (instance.process && !instance.process.killed) {
      instance.process.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        const forceTimer = setTimeout(() => {
          if (instance.process && !instance.process.killed) {
            instance.process.kill('SIGKILL');
          }
          resolve();
        }, 2000);
        instance.process!.once('exit', () => {
          clearTimeout(forceTimer);
          resolve();
        });
      });
    }

    // 释放端口
    this.usedPorts.delete(instance.port);

    // 清理临时目录
    await this.cleanup(instance.serverDir);

    instance.status = 'stopped';
    instance.process = null;
    instance.updatedAt = Date.now();
    this.instances.delete(appId);

    console.log(`[PreviewServer] ${appId} stopped`);
  }

  /**
   * 获取某 appId 的预览服务状态
   */
  getStatus(appId: string): PreviewServerInfo | undefined {
    const instance = this.instances.get(appId);
    if (!instance) return undefined;
    return this.toInfo(instance);
  }

  /**
   * 列出所有活跃的预览服务
   */
  listAll(): PreviewServerInfo[] {
    return Array.from(this.instances.values()).map((inst) => this.toInfo(inst));
  }

  /**
   * 停止所有预览服务（app 退出时调用）
   */
  async stopAll(): Promise<void> {
    const appIds = Array.from(this.instances.keys());
    await Promise.allSettled(appIds.map((id) => this.stop(id)));
  }

  // ─── 内部方法 ──────────────────────────────────────────────────────────

  private allocatePort(): number {
    for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
      if (!this.usedPorts.has(port)) {
        this.usedPorts.add(port);
        return port;
      }
    }
    throw new Error('[PreviewServer] No available ports in range 9100-9199');
  }

  private async scaffold(instance: PreviewServerInstance, input: PreviewServerInput): Promise<void> {
    const { appId, appSlug, collectionSchemas, cloudFunctions } = input;

    const options: ScaffoldServerOptions = {
      serverDir: instance.serverDir,
      appSlug: appSlug || appId,
      collections: collectionSchemas,
      cloudFunctions,
      containerPort: instance.port,
    };

    await scaffoldServer(options);
  }

  private async install(instance: PreviewServerInstance): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const proc = spawn('npm', ['install', '--production', '--prefer-offline'], {
        cwd: instance.serverDir,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'production' },
      });

      let stderr = '';
      proc.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`npm install failed (code ${code}): ${stderr.slice(0, 500)}`));
        }
      });

      proc.on('error', (err) => reject(err));
    });
  }

  private async spawnServer(instance: PreviewServerInstance): Promise<void> {
    const mongoDb = `banyuan_preview_${instance.appId}`;
    const mongoUri = `${LOCAL_MONGO_URI}/${mongoDb}`;

    const proc = spawn('node', ['index.js'], {
      cwd: instance.serverDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PORT: String(instance.port),
        MONGODB_URI: mongoUri,
        NODE_ENV: 'development',
      },
    });

    instance.process = proc;

    // 等待服务就绪（监听 stdout 中的标志输出或超时）
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Preview server start timeout (15s)'));
      }, 15000);

      let stdout = '';
      const onData = (chunk: Buffer) => {
        stdout += chunk.toString();
        if (stdout.includes('[Banyuan Server] Running on port')) {
          clearTimeout(timeout);
          proc.stdout?.off('data', onData);
          resolve();
        }
      };

      proc.stdout?.on('data', onData);

      proc.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      proc.on('exit', (code) => {
        if (code !== null && code !== 0) {
          clearTimeout(timeout);
          reject(new Error(`Preview server exited with code ${code}`));
        }
      });
    });

    // 监听进程异常退出
    proc.on('exit', (code) => {
      if (instance.status === 'running') {
        console.warn(`[PreviewServer] ${instance.appId} exited unexpectedly (code ${code})`);
        instance.status = 'error';
        instance.error = `Process exited with code ${code}`;
        instance.updatedAt = Date.now();
        this.usedPorts.delete(instance.port);
        this.clearIdleTimer(instance.appId);
      }
    });
  }

  /**
   * 热更新策略：
   *   - CloudFunctions 变更：写 functions.json 即可（FlowRunner 每次调用时从文件读取）
   *   - CollectionSchema 变更：写 schema.json + 重启进程（Mongoose 模型在启动时初始化）
   */
  private async hotUpdate(instance: PreviewServerInstance, input: PreviewServerInput): Promise<void> {
    const { collectionSchemas, cloudFunctions } = input;
    const { lastInput } = instance;

    const collectionsChanged = JSON.stringify(collectionSchemas) !== JSON.stringify(lastInput.collectionSchemas);
    const functionsChanged = JSON.stringify(cloudFunctions) !== JSON.stringify(lastInput.cloudFunctions);

    if (!collectionsChanged && !functionsChanged) {
      instance.lastInput = input;
      instance.updatedAt = Date.now();
      return;
    }

    if (functionsChanged) {
      await fs.writeFile(
        path.join(instance.serverDir, 'functions.json'),
        JSON.stringify(cloudFunctions, null, 2),
      );
    }

    if (collectionsChanged) {
      await fs.writeFile(
        path.join(instance.serverDir, 'schema.json'),
        JSON.stringify(collectionSchemas, null, 2),
      );
      // CollectionSchema 变更需要重启进程
      await this.restartProcess(instance);
    }

    instance.lastInput = input;
    instance.updatedAt = Date.now();
    console.log(`[PreviewServer] ${instance.appId} hot-updated (collections: ${collectionsChanged}, functions: ${functionsChanged})`);
  }

  private async restartProcess(instance: PreviewServerInstance): Promise<void> {
    if (instance.process && !instance.process.killed) {
      instance.process.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, 2000);
        instance.process!.once('exit', () => { clearTimeout(t); resolve(); });
      });
    }
    await this.spawnServer(instance);
    console.log(`[PreviewServer] ${instance.appId} restarted`);
  }

  private resetIdleTimer(appId: string): void {
    this.clearIdleTimer(appId);
    const timer = setTimeout(() => {
      console.log(`[PreviewServer] ${appId} idle timeout, stopping...`);
      this.stop(appId).catch((err) => {
        console.error(`[PreviewServer] ${appId} idle stop failed:`, err);
      });
    }, IDLE_TIMEOUT_MS);
    this.idleTimers.set(appId, timer);
  }

  private clearIdleTimer(appId: string): void {
    const timer = this.idleTimers.get(appId);
    if (timer) {
      clearTimeout(timer);
      this.idleTimers.delete(appId);
    }
  }

  private async cleanup(dir: string): Promise<void> {
    try {
      if (existsSync(dir)) {
        await fs.rm(dir, { recursive: true, force: true });
      }
    } catch (err) {
      console.warn(`[PreviewServer] cleanup failed for ${dir}:`, err);
    }
  }

  private toInfo(instance: PreviewServerInstance): PreviewServerInfo {
    return {
      appId: instance.appId,
      port: instance.port,
      status: instance.status,
      url: instance.url,
      createdAt: instance.createdAt,
      updatedAt: instance.updatedAt,
      error: instance.error,
    };
  }
}
