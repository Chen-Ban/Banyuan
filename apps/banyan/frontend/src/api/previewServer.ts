/**
 * Preview Server API — 前端调用层
 *
 * 通过 Electron IPC 与主进程通信，编排本地 Preview Server。
 * 仅在 Electron 环境中可用（window.electronAPI 存在时）。
 *
 * 用途：预览态进入时 start，退出时 stop，获取本地后端端点地址。
 */

import type { PreviewServerInput, PreviewServerInfo } from '../types/electron.js';

/** 是否运行在 Electron 环境中 */
export function isElectron(): boolean {
  return typeof window !== 'undefined' && window.electronAPI != null;
}

/**
 * 启动/复用本地 Preview Server
 * @returns 服务信息（含 url 端点地址）
 * @throws 非 Electron 环境或启动失败
 */
export async function startPreviewServer(input: PreviewServerInput): Promise<PreviewServerInfo> {
  if (!isElectron()) {
    throw new Error('[PreviewServer] Not in Electron environment');
  }
  return window.electronAPI!.preview.start(input);
}

/**
 * 停止本地 Preview Server
 */
export async function stopPreviewServer(appId: string): Promise<void> {
  if (!isElectron()) return;
  return window.electronAPI!.preview.stop(appId);
}

/**
 * 获取本地 Preview Server 状态
 */
export async function getPreviewServerStatus(appId: string): Promise<PreviewServerInfo | null> {
  if (!isElectron()) return null;
  return window.electronAPI!.preview.getStatus(appId);
}

/**
 * 列出所有活跃的本地 Preview Server
 */
export async function listPreviewServers(): Promise<PreviewServerInfo[]> {
  if (!isElectron()) return [];
  return window.electronAPI!.preview.listAll();
}

export type { PreviewServerInput, PreviewServerInfo };
