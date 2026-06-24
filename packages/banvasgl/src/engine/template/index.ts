/**
 * 模板模块 —— serializeTemplate（View → 模板）& instantiateTemplate（模板 → View）
 *
 * 本模块是建立在 engine/serialization 之上的"模板层"：负责占位符化、ID 重生成、
 * 坐标归零等模板语义，实例化时复用 Serializer 还原 View 实例。
 *
 * 对外通过 createTemplateActions(getApp) 暴露 ITemplateActions，
 * 由 actions/viewActions 代理为 view.serializeTemplate / view.instantiateTemplate。
 *
 * 设计决策参见 ADR-027 Step 4。
 */

import type { App } from '@/engine/App.js'
import type {
    ITemplate,
    ITemplateActions,
    ITemplateSerializeConfig,
} from '@/types/template/template.js'
import { serializeTemplate } from './TemplateSerializer.js'
import { instantiateTemplate } from './TemplateInstantiator.js'

/**
 * 创建模板操作实例
 */
export function createTemplateActions(
    getApp: () => App | null,
): ITemplateActions {
    const getScene = () => getApp()?.getCurrentScene() ?? null

    return {
        serialize(
            viewId: string,
            config: ITemplateSerializeConfig,
        ): ITemplate | null {
            return serializeTemplate(getScene(), viewId, config)
        },

        instantiate(
            template: ITemplate,
            position: { x: number; y: number },
            params?: Record<string, unknown>,
        ): string | null {
            return instantiateTemplate(getApp(), getScene(), template, position, params)
        },
    }
}

export { serializeTemplate } from './TemplateSerializer.js'
export { instantiateTemplate } from './TemplateInstantiator.js'
