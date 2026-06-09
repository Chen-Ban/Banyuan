/**
 * Electron Preload Script
 *
 * 通过 contextBridge 安全地向 Renderer 进程暴露主进程能力。
 * Renderer 通过 window.electronAPI.xxx 调用。
 */

import { contextBridge, ipcRenderer } from 'electron';

export interface PreviewServerInput {
  appId: string;
  appSlug?: string;
  appJSON: Record<string, unknown>;
  collectionSchemas: unknown[];
  cloudFunctions: unknown[];
}

export interface PreviewServerInfo {
  appId: string;
  port: number;
  status: string;
  url: string;
  createdAt: number;
  updatedAt: number;
  error?: string;
}

/**
 * 暴露给 Renderer 的 API 定义
 */
const electronAPI = {
  // ─── Preview Server 编排 ─────────────────────────────────────────────
  preview: {
    /** 启动/复用本地 Preview Server */
    start: (input: PreviewServerInput): Promise<PreviewServerInfo> =>
      ipcRenderer.invoke('preview:start', input),

    /** 停止某 appId 的 Preview Server */
    stop: (appId: string): Promise<void> =>
      ipcRenderer.invoke('preview:stop', appId),

    /** 获取某 appId 的 Preview Server 状态 */
    getStatus: (appId: string): Promise<PreviewServerInfo | null> =>
      ipcRenderer.invoke('preview:status', appId),

    /** 列出所有活跃 Preview Server */
    listAll: (): Promise<PreviewServerInfo[]> =>
      ipcRenderer.invoke('preview:list'),
  },

  // ─── 通用能力（可扩展） ──────────────────────────────────────────────
  platform: process.platform,
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

/** 为 Renderer 端 TypeScript 提供类型定义 */
export type ElectronAPI = typeof electronAPI;
