/**
 * 物料模块 —— serialize（View → 物料模板）& instantiate（物料模板 → View）
 *
 * 本模块是建立在 engine/serialization 之上的"模板层"：负责占位符化、ID 重生成、
 * 坐标归零等模板语义，实例化时复用 Serializer 还原 View 实例。
 *
 * 对外通过 createMaterialActions(getApp) 暴露 IMaterialActions，
 * 由 actions/viewActions 代理为 view.serializeMaterial / view.instantiateMaterial。
 *
 * 设计决策参见 ADR-027 Step 4。
 */

import type { App } from '@/engine/App.js'
import type {
    IMaterial,
    IMaterialTemplate,
    IMaterialActions,
    IMaterialSerializeConfig,
} from '@/types/material/material.js'
import { serializeMaterial } from './MaterialSerializer.js'
import { instantiateMaterial } from './MaterialInstantiator.js'

/**
 * 创建物料操作实例
 */
export function createMaterialActions(
    getApp: () => App | null,
): IMaterialActions {
    const getScene = () => getApp()?.getCurrentScene() ?? null

    return {
        serialize(
            viewId: string,
            config: IMaterialSerializeConfig,
        ): IMaterialTemplate | null {
            return serializeMaterial(getScene(), viewId, config)
        },

        instantiate(
            material: IMaterial | IMaterialTemplate,
            position: { x: number; y: number },
            params?: Record<string, unknown>,
        ): string | null {
            return instantiateMaterial(getApp(), getScene(), material, position, params)
        },
    }
}

export { serializeMaterial } from './MaterialSerializer.js'
export { instantiateMaterial } from './MaterialInstantiator.js'
