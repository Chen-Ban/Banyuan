/**
 * patchProjection — Patch 语义的 Projection 写入
 *
 * ADR-041: 修复 projectionToUIJSON 全量覆盖导致 App-level lifetimes 丢失的问题。
 * patchProjection 只更新指定的 Scene，保留未涉及的 Scene 和 App 级配置不变。
 */
import type { SerializedData } from '@banyuan/banvasgl'
import type { AIProjectionScene, AIAppLifetimes } from './projection.types.js'
import { fromAIProjection } from './projection.js'

// ─── 输入类型 ─────────────────────────────────────────────────────────────────

export interface PatchProjectionInput {
  /** 需要写入/更新的页面列表。id 已存在则替换，不存在则追加。 */
  scenes?: AIProjectionScene[]
  /** App 生命周期覆写。传入时整体替换 App.lifetimes。 */
  lifetimes?: AIAppLifetimes
}

export interface PatchProjectionResult {
  /** 更新了的页面 id 列表 */
  updated: string[]
  /** 新增的页面 id 列表 */
  added: string[]
  /** 未被触及（保持原样）的页面 id 列表 */
  unchanged: string[]
  /** App lifetimes 是否被更新 */
  lifetimesUpdated: boolean
}

// ─── 核心实现 ─────────────────────────────────────────────────────────────────

/**
 * Patch 语义写入 Projection。
 *
 * 读取当前 UI 定义 JSON → 对传入的 scene 按 id 匹配：
 *   - id 已存在 → 替换该 scene（更新）
 *   - id 不存在 → 追加到末尾（新增）
 * 未传入的 scene 和 App-level 字段（lifetimes 等）完全保留不动。
 *
 * @param currentUIJSON - 当前完整的 UI 定义 JSON 字符串（App.serialize() 输出）
 * @param input - 要写入的页面列表
 * @param version - BanvasGL 版本号
 * @returns 新的 UI 定义 JSON 字符串 + 变更摘要
 */
export function patchProjection(
  currentUIJSON: string,
  input: PatchProjectionInput,
  version: string,
): { uiJSON: string; result: PatchProjectionResult } {
  const appSerialized: SerializedData = JSON.parse(currentUIJSON)
  const appData = appSerialized.data

  // 确保 scenes 数组存在
  if (!appData || !Array.isArray(appData.scenes)) {
    appData.scenes = []
  }

  const existingScenes: Array<{ $type: string; $value: any }> = appData.scenes
  const result: PatchProjectionResult = { updated: [], added: [], unchanged: [], lifetimesUpdated: false }

  // ── App lifetimes 覆写 ──
  if (input.lifetimes !== undefined) {
    appData.lifetimes = {
      onLaunch: input.lifetimes.onLaunch ?? null,
      onUnlaunch: input.lifetimes.onUnlaunch ?? null,
    }
    result.lifetimesUpdated = true
  }

  // ── Scene Patch ──
  if (input.scenes && input.scenes.length > 0) {
    // 构建现有 scene 的 id → index 映射
    const idToIndex = new Map<string, number>()
    for (let i = 0; i < existingScenes.length; i++) {
      const sceneValue = existingScenes[i].$value ?? existingScenes[i]
      if (sceneValue.id) {
        idToIndex.set(sceneValue.id, i)
      }
    }

    // 收集被触及的 scene id
    const touchedIds = new Set<string>()

    for (const scene of input.scenes) {
      const sceneSerializedData = fromAIProjection(scene, version)
      // fromAIProjection 返回 { type: "SCENE", version, data: { $type: "SCENE", $value: ... } }
      const sceneWrapper = sceneSerializedData.data

      const existingIndex = idToIndex.get(scene.id)
      if (existingIndex !== undefined) {
        // 替换已有 scene
        existingScenes[existingIndex] = sceneWrapper
        result.updated.push(scene.id)
      } else {
        // 追加新 scene
        existingScenes.push(sceneWrapper)
        result.added.push(scene.id)
      }
      touchedIds.add(scene.id)
    }

    // 记录未被触及的 scene
    for (const [id] of idToIndex) {
      if (!touchedIds.has(id)) {
        result.unchanged.push(id)
      }
    }
  }

  // 重新序列化（保留原有的 App-level 字段：lifetimes、metadata 等）
  const patchedUIJSON = JSON.stringify({
    ...appSerialized,
    data: {
      ...appData,
      scenes: existingScenes,
    },
    metadata: {
      ...appSerialized.metadata,
      timestamp: Date.now(),
      source: 'AI Projection Patch',
    },
  })

  return { uiJSON: patchedUIJSON, result }
}

/**
 * 基于 BanvasHostAdapter 的便捷版本（读取 → patch → 写回）
 *
 * 这是 Orchestrator commit 阶段的主要调用入口。
 */
export async function patchProjectionViaAdapter(
  adapter: {
    getAppJSON(): Promise<string>
    setAppJSON(json: string): Promise<void>
    getAppMeta(): Promise<{ version: string }>
  },
  input: PatchProjectionInput,
): Promise<PatchProjectionResult> {
  const [fetchedJSON, meta] = await Promise.all([adapter.getAppJSON(), adapter.getAppMeta()])

  // 空应用时构造最小 App 结构
  const appJSON =
    fetchedJSON ||
    JSON.stringify({
      type: 'APP',
      version: meta.version,
      data: { lifetimes: { onLaunch: null, onUnlaunch: null }, scenes: [] },
      metadata: { timestamp: Date.now(), source: 'AI Projection Patch' },
    })

  const { uiJSON: patchedJSON, result } = patchProjection(appJSON, input, meta.version)
  await adapter.setAppJSON(patchedJSON)
  return result
}
