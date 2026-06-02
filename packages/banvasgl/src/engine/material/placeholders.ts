/**
 * 物料占位符层 —— 收集与替换 ID / 参数 / 资源占位符的纯函数集合
 *
 * 物料模板在 serialize 阶段把易变信息（ID、可参数化字段、资源 URL）替换为占位符，
 * 在 instantiate 阶段再填回真实值。本文件汇总这些无状态的递归遍历逻辑，
 * 与 Serializer 的"对象 ⇄ JSON"职责正交。
 */

import { v4 as uuid } from 'uuid'
import type {
    IMaterialAsset,
    IMaterialParameter,
    IMaterialParameterBinding,
    IInternalIdRef,
} from '@/types/material/material.js'
import { getValueByPath, setValueByPath } from './pathUtils.js'

// ── 占位符格式 ──
export const ID_PLACEHOLDER_RE = /\{\{id:(\d+)\}\}/g
export const PARAM_PLACEHOLDER_RE = /\{\{param:([^}]+)\}\}/g
export const ASSET_PLACEHOLDER_RE = /\{\{asset:([^}]+)\}\}/g

/** 资源 URL 模式匹配（http/https 链接中常见的图片/视频/音频后缀） */
const ASSET_URL_RE = /^https?:\/\/.+\.(png|jpe?g|gif|webp|svg|mp4|webm|mp3|wav|ogg|woff2?|ttf|otf)(\?.*)?$/i

// ══════════════════════════════════════════════════════════════════════════════
// serialize 阶段：收集 / 占位符化
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 递归收集 JSON 树中所有 id 字段
 */
export function collectIds(
    obj: any,
    idMap: Map<string, string>,
    nextPlaceholder: () => string,
): void {
    if (obj === null || obj === undefined || typeof obj !== 'object') return

    if (Array.isArray(obj)) {
        for (const item of obj) {
            collectIds(item, idMap, nextPlaceholder)
        }
        return
    }

    // 收集当前节点的 id
    if (typeof obj.id === 'string' && obj.id && !idMap.has(obj.id)) {
        idMap.set(obj.id, nextPlaceholder())
    }

    // 递归子节点
    for (const value of Object.values(obj)) {
        if (typeof value === 'object' && value !== null) {
            collectIds(value, idMap, nextPlaceholder)
        }
    }
}

/**
 * 深拷贝对象并将所有 id 字段值替换为占位符
 */
export function deepCloneAndReplace(obj: any, idMap: Map<string, string>): any {
    if (obj === null || obj === undefined) return obj
    if (typeof obj !== 'object') return obj

    if (Array.isArray(obj)) {
        return obj.map(item => deepCloneAndReplace(item, idMap))
    }

    const result: Record<string, any> = {}
    for (const [key, value] of Object.entries(obj)) {
        if (key === 'id' && typeof value === 'string' && idMap.has(value)) {
            result[key] = idMap.get(value)!
        } else if (typeof value === 'object' && value !== null) {
            result[key] = deepCloneAndReplace(value, idMap)
        } else {
            result[key] = value
        }
    }
    return result
}

/**
 * 扫描 FlowSchema（events + lifetimes）中引用的 viewId
 *
 * FlowSchema 节点中的 targetViewId 等字段如果匹配已知 ID，记录为 internalIdRef
 */
export function scanFlowSchemaRefs(
    obj: any,
    currentPath: string,
    idMap: Map<string, string>,
    refs: IInternalIdRef[],
): void {
    if (obj === null || obj === undefined || typeof obj !== 'object') return

    if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
            scanFlowSchemaRefs(obj[i], `${currentPath}[${i}]`, idMap, refs)
        }
        return
    }

    for (const [key, value] of Object.entries(obj)) {
        const path = currentPath ? `${currentPath}.${key}` : key

        // 检查字符串值是否为 ID 占位符
        if (typeof value === 'string' && key !== 'id') {
            // 检查是否是已替换的占位符（在 events/lifetimes 的 FlowSchema 中）
            if (ID_PLACEHOLDER_RE.test(value)) {
                ID_PLACEHOLDER_RE.lastIndex = 0
                // 只有在 events 或 lifetimes 路径下才记录
                if (isFlowSchemaPath(currentPath)) {
                    refs.push({ path, placeholder: value })
                }
            }
        } else if (typeof value === 'object' && value !== null) {
            scanFlowSchemaRefs(value, path, idMap, refs)
        }
    }
}

/** 判断路径是否在 FlowSchema 范围内（events.* 或 lifetimes.*） */
function isFlowSchemaPath(path: string): boolean {
    return path.startsWith('events.') || path.startsWith('lifetimes.')
        || path.includes('.events.') || path.includes('.lifetimes.')
}

/**
 * 提取 JSON 中所有看起来像资源 URL 的字符串值
 */
export function extractAssets(
    obj: any,
    assets: IMaterialAsset[],
    assetMap: Map<string, string>,
): void {
    if (obj === null || obj === undefined || typeof obj !== 'object') return

    if (Array.isArray(obj)) {
        for (const item of obj) {
            extractAssets(item, assets, assetMap)
        }
        return
    }

    for (const value of Object.values(obj)) {
        if (typeof value === 'string' && ASSET_URL_RE.test(value) && !assetMap.has(value)) {
            const assetId = uuid()
            const type = inferAssetType(value)
            assets.push({
                id: assetId,
                type,
                url: value,
            })
            assetMap.set(value, `{{asset:${assetId}}}`)
        } else if (typeof value === 'object' && value !== null) {
            extractAssets(value, assets, assetMap)
        }
    }
}

/** 根据 URL 后缀推断资源类型 */
function inferAssetType(url: string): IMaterialAsset['type'] {
    const lower = url.toLowerCase()
    if (/\.(png|jpe?g|gif|webp|svg)/.test(lower)) return 'image'
    if (/\.(mp4|webm)/.test(lower)) return 'video'
    if (/\.(mp3|wav|ogg)/.test(lower)) return 'audio'
    if (/\.(woff2?|ttf|otf)/.test(lower)) return 'font'
    return 'other'
}

/**
 * 将 JSON 中的资源 URL 替换为占位符
 */
export function replaceAssetUrls(obj: any, assetMap: Map<string, string>): void {
    if (obj === null || obj === undefined || typeof obj !== 'object') return

    if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
            if (typeof obj[i] === 'string' && assetMap.has(obj[i])) {
                obj[i] = assetMap.get(obj[i])!
            } else if (typeof obj[i] === 'object' && obj[i] !== null) {
                replaceAssetUrls(obj[i], assetMap)
            }
        }
        return
    }

    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string' && assetMap.has(value)) {
            obj[key] = assetMap.get(value)!
        } else if (typeof value === 'object' && value !== null) {
            replaceAssetUrls(value, assetMap)
        }
    }
}

/**
 * 应用参数绑定：将指定路径的值替换为参数占位符
 */
export function applyParameterBindings(
    root: Record<string, any>,
    bindings: IMaterialParameterBinding[],
    parameters: IMaterialParameter[],
): void {
    for (const binding of bindings) {
        // 获取当前值作为默认值
        const currentValue = getValueByPath(root, binding.bindingPath)
        const defaultValue = binding.defaultValue ?? currentValue

        // 替换为占位符
        setValueByPath(root, binding.bindingPath, `{{param:${binding.id}}}`)

        // 记录参数定义
        parameters.push({
            id: binding.id,
            label: binding.label,
            description: binding.description,
            type: binding.type,
            defaultValue,
            bindingPath: binding.bindingPath,
            options: binding.options,
            required: binding.required,
        })
    }
}

/**
 * 根节点 transform 归零
 *
 * BanvasGL 序列化格式中 matrix 是 $type/$value 包装的 16 元素数组。
 * 我们只需将平移分量（[12], [13]）置为 0。
 */
export function zeroRootTransform(root: Record<string, any>): void {
    if (root.matrix) {
        // matrix 可能是 { $type: 'Matrix4', $value: number[] } 或直接是 number[]
        if (root.matrix.$value && Array.isArray(root.matrix.$value)) {
            root.matrix.$value[12] = 0
            root.matrix.$value[13] = 0
        } else if (Array.isArray(root.matrix)) {
            root.matrix[12] = 0
            root.matrix[13] = 0
        }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// instantiate 阶段：占位符回填
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 设置根节点位置（instantiate 时使用）
 */
export function setRootPosition(root: Record<string, any>, position: { x: number; y: number }): void {
    if (root.matrix) {
        if (root.matrix.$value && Array.isArray(root.matrix.$value)) {
            root.matrix.$value[12] = position.x
            root.matrix.$value[13] = position.y
        } else if (Array.isArray(root.matrix)) {
            root.matrix[12] = position.x
            root.matrix[13] = position.y
        }
    }
}

/**
 * 递归替换所有 {{id:N}} 占位符为真实 UUID
 */
export function replaceIdPlaceholders(obj: any, newIds: string[]): void {
    if (obj === null || obj === undefined || typeof obj !== 'object') return

    if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
            if (typeof obj[i] === 'string' && ID_PLACEHOLDER_RE.test(obj[i])) {
                ID_PLACEHOLDER_RE.lastIndex = 0
                obj[i] = obj[i].replace(ID_PLACEHOLDER_RE, (_: string, idx: string) => {
                    const index = parseInt(idx, 10)
                    return index < newIds.length ? newIds[index] : _
                })
            } else if (typeof obj[i] === 'object' && obj[i] !== null) {
                replaceIdPlaceholders(obj[i], newIds)
            }
        }
        return
    }

    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string' && ID_PLACEHOLDER_RE.test(value)) {
            ID_PLACEHOLDER_RE.lastIndex = 0
            obj[key] = value.replace(ID_PLACEHOLDER_RE, (_: string, idx: string) => {
                const index = parseInt(idx, 10)
                return index < newIds.length ? newIds[index] : _
            })
        } else if (typeof value === 'object' && value !== null) {
            replaceIdPlaceholders(value, newIds)
        }
    }
}

/**
 * 递归替换所有 {{param:paramId}} 占位符为实际值
 */
export function replaceParamPlaceholders(obj: any, paramId: string, value: unknown): void {
    const placeholder = `{{param:${paramId}}}`

    if (obj === null || obj === undefined || typeof obj !== 'object') return

    if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
            if (obj[i] === placeholder) {
                obj[i] = value
            } else if (typeof obj[i] === 'object' && obj[i] !== null) {
                replaceParamPlaceholders(obj[i], paramId, value)
            }
        }
        return
    }

    for (const [key, val] of Object.entries(obj)) {
        if (val === placeholder) {
            obj[key] = value
        } else if (typeof val === 'object' && val !== null) {
            replaceParamPlaceholders(val, paramId, value)
        }
    }
}

/**
 * 递归替换 {{asset:assetId}} 占位符为实际 URL
 */
export function replaceAssetPlaceholderById(obj: any, assetId: string, url: string): void {
    const placeholder = `{{asset:${assetId}}}`

    if (obj === null || obj === undefined || typeof obj !== 'object') return

    if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
            if (obj[i] === placeholder) {
                obj[i] = url
            } else if (typeof obj[i] === 'object' && obj[i] !== null) {
                replaceAssetPlaceholderById(obj[i], assetId, url)
            }
        }
        return
    }

    for (const [key, val] of Object.entries(obj)) {
        if (val === placeholder) {
            obj[key] = url
        } else if (typeof val === 'object' && val !== null) {
            replaceAssetPlaceholderById(val, assetId, url)
        }
    }
}

/** 从占位符字符串提取 ID 索引 */
export function extractIdIndex(placeholder: string): number | null {
    const match = /\{\{id:(\d+)\}\}/.exec(placeholder)
    return match ? parseInt(match[1], 10) : null
}
