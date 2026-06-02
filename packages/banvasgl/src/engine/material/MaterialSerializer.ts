/**
 * 物料序列化 —— View 子树 → 物料模板（IMaterialTemplate）
 *
 * 这是建立在 Serializer 之上的"模板层"：
 *   1. 先用 view.toJSON() 拿到全量数据；
 *   2. 再把易变信息（ID / 可参数化字段 / 资源 URL）替换为占位符；
 *   3. 根节点坐标归零，便于落地时按鼠标位置重定位。
 *
 * 占位符化 / 坐标归零等模板语义与 Serializer 的"对象 ⇄ JSON"职责正交，
 * 因此独立于序列化模块，仅在 instantiate 阶段复用 Serializer 还原实例。
 *
 * 设计决策参见 ADR-027 Step 4。
 */

import type { Scene } from '@/engine/scene/Scene.js'
import type {
    IMaterialTemplate,
    IMaterialSerializeConfig,
    IMaterialParameter,
    IMaterialAsset,
    IInternalIdRef,
} from '@/types/material/material.js'
import {
    collectIds,
    deepCloneAndReplace,
    scanFlowSchemaRefs,
    extractAssets,
    replaceAssetUrls,
    applyParameterBindings,
    zeroRootTransform,
} from './placeholders.js'

/**
 * 将场景中指定 View 子树序列化为物料模板
 *
 * @returns 物料模板；当场景或视图不存在时返回 null
 */
export function serializeMaterial(
    scene: Scene | null,
    viewId: string,
    config: IMaterialSerializeConfig,
): IMaterialTemplate | null {
    if (!scene) return null

    const view = scene.findViewById(viewId)
    if (!view) return null

    // 1. 获取完整子树 JSON
    const json = view.toJSON()

    // 2. 收集所有 ID 并建立映射
    const idMap = new Map<string, string>() // oldId → placeholder
    let idCounter = 0
    collectIds(json, idMap, () => `{{id:${idCounter++}}}`)

    // 3. 深拷贝并替换 ID
    const root = deepCloneAndReplace(json, idMap)

    // 4. 扫描 FlowSchema 中的 viewId 引用
    const internalIdRefs: IInternalIdRef[] = []
    scanFlowSchemaRefs(root, '', idMap, internalIdRefs)

    // 5. 提取资源 URL
    const assets: IMaterialAsset[] = []
    const assetMap = new Map<string, string>() // url → placeholder
    extractAssets(root, assets, assetMap)

    // 6. 替换资源 URL 为占位符
    if (assetMap.size > 0) {
        replaceAssetUrls(root, assetMap)
    }

    // 7. 处理参数绑定
    const parameters: IMaterialParameter[] = []
    if (config.parameterBindings && config.parameterBindings.length > 0) {
        applyParameterBindings(root, config.parameterBindings, parameters)
    }

    // 8. 根节点 transform 归零（将坐标置为原点）
    zeroRootTransform(root)

    // 9. 包装为全量数据协议（{ $type, $value }）
    //    物料数据 = 带占位符的全量数据子集；Serializer.deserialize() 依赖顶层 $type
    //    分派到 View.fromJSON 才能还原实例。占位符/参数/资源/ref 均已在裸子树上处理完成。
    const wrappedRoot = { $type: view.type, $value: root }

    return {
        root: wrappedRoot,
        idCount: idCounter,
        internalIdRefs,
        parameters,
        assets,
    }
}
