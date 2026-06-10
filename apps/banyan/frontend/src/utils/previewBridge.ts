/**
 * PreviewServer 下推桥接工具
 *
 * 将最新 collections + cloudFunctions 通过 IPC 推送给 PreviewServer 做 hotUpdate。
 * - 从 applicationStore 自取当前 appId（PreviewServer 生命周期与应用页一致）
 * - 非 Electron 环境时静默跳过（无 PreviewServer 可接收）
 *
 * 设计决策来源：docs/adr/app/protocol.md C5 + docs/specs/app/metadata-dataflow.md 步骤 2
 */

import type { CollectionDef } from '@/api/backend/schema'
import type { CloudFunctionDef } from '@/api/backend/cloudFunctions'
import { useApplicationStore } from '@/stores/applicationStore'

/**
 * 将最新 collections + cloudFunctions 推送给 PreviewServer 做 hotUpdate。
 *
 * - 调用方无需传 appId（从 store 自取）
 * - 非 Electron 环境静默跳过
 * - 内部 try/catch，不阻塞主流程
 */
export async function hotUpdatePreview(
  collections: CollectionDef[],
  cloudFunctions: CloudFunctionDef[],
): Promise<void> {
  if (!window.electronAPI?.preview) return

  const appId = useApplicationStore.getState().appId
  if (!appId) return

  try {
    await window.electronAPI.preview.hotUpdate(appId, { collections, cloudFunctions })
  } catch (err) {
    // PreviewServer 可能未启动，不阻塞主流程
    console.warn('[previewBridge] hotUpdate IPC error:', err)
  }
}
