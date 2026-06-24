/**
 * 模板实例化 —— 模板（ITemplate）→ View 实例
 *
 * 与 serialize 对称：把占位符填回真实值（每次落地都重生成 ID），
 * 再复用 Serializer.deserialize() 还原 View 实例树。
 *
 * 注意 ID 语义：模板实例化要求每次生成全新 ID（模板复用语义），
 * 这与序列化模块用于 undo/redo 时"ID 保持不变"的诉求相反，
 * 因此 ID 重生成由本模板层负责，Serializer 只做纯粹的对象还原。
 *
 * NodeView 走特殊路径：端口由构造函数按 schema 自动推导，
 * fromJSON 会跳过自动端口创建，故直接 new NodeView()。
 *
 * 设计决策参见 ADR-027 Step 4。
 */

import { v4 as uuid } from 'uuid'
import type { App } from '@/engine/App.js'
import type { Scene } from '@/engine/scene/Scene.js'
import { Serializer } from '@/engine/serialization/Serializer.js'
import { ViewType } from '@/foundation/constants.js'
import NodeView from '@/view/FlowViews/NodeView.js'
import type { FlowNode } from '@/types/index.js'
import type { ITemplate } from '@/types/template/template.js'
import {
    replaceIdPlaceholders,
    replaceParamPlaceholders,
    replaceAssetPlaceholderById,
    extractIdIndex,
    setRootPosition,
} from './placeholders.js'
import { setValueByPath } from './pathUtils.js'

/**
 * 将模板实例化为场景中的 View，并添加到当前场景
 *
 * @returns 新建 View 的 ID；当场景/应用不存在或实例化失败时返回 null
 */
export function instantiateTemplate(
    app: App | null,
    scene: Scene | null,
    template: ITemplate,
    position: { x: number; y: number },
    params?: Record<string, unknown>,
): string | null {
    if (!scene || !app) return null

    // 1. 深拷贝模板 root（RawJSON：{ $type, $value }）
    const wrappedRoot = JSON.parse(JSON.stringify(template.root))

    // 2. 解包出裸子树做占位符替换；占位符/ref/参数/资源/位置的 path 基准
    //    与 serialize 阶段一致（均基于裸子树）。处理完再包回去喂 deserialize。
    const root =
        wrappedRoot && typeof wrappedRoot === 'object' && '$value' in wrappedRoot
            ? wrappedRoot.$value
            : wrappedRoot

    // 3. 生成新 ID 并替换占位符
    const newIds: string[] = []
    for (let i = 0; i < template.idCount; i++) {
        newIds.push(uuid())
    }
    replaceIdPlaceholders(root, newIds)

    // 4. 替换 FlowSchema 中的内部 ID 引用
    for (const ref of template.internalIdRefs) {
        const idIndex = extractIdIndex(ref.placeholder)
        if (idIndex !== null && idIndex < newIds.length) {
            setValueByPath(root, ref.path, newIds[idIndex])
        }
    }

    // 5. 填充参数
    if (template.parameters.length > 0) {
        for (const param of template.parameters) {
            const value = params?.[param.id] ?? param.defaultValue
            replaceParamPlaceholders(root, param.id, value)
        }
    }

    // 6. 替换资源占位符
    if (template.assets.length > 0) {
        for (const asset of template.assets) {
            replaceAssetPlaceholderById(root, asset.id, asset.url)
        }
    }

    // 7. 取出根节点类型，用于选择实例化策略
    const rootType =
        wrappedRoot && typeof wrappedRoot === 'object' && '$type' in wrappedRoot
            ? wrappedRoot.$type
            : null

    // 8. 根据类型选择实例化策略
    let viewInstance: any

    if (rootType === ViewType.NODEVIEW) {
        // ── NodeView 特殊路径 ──
        // NodeView 的端口由构造函数根据 schema 自动推导，
        // 不走通用 deserialize（fromJSON 会跳过自动端口创建）。
        const schema = root.schema as FlowNode | undefined
        if (!schema) return null

        // 生成唯一 ID
        const nodeId = uuid()
        const fullSchema = { ...schema, id: nodeId, x: position.x, y: position.y }

        const nodeView = new NodeView({
            schema: fullSchema,
            nodeTitle: root.nodeTitle as string | undefined,
            style: { width: 140, height: 60 },
        })
        nodeView.translate(position.x, position.y, 0)
        viewInstance = nodeView
    } else {
        // ── 通用路径：通过 Serializer.deserialize 恢复 View 实例树 ──
        setRootPosition(root, position)

        const serializer = Serializer.getInstance()
        const deserializeInput =
            wrappedRoot && typeof wrappedRoot === 'object' && '$type' in wrappedRoot
                ? { $type: wrappedRoot.$type, $value: root }
                : root
        viewInstance = serializer.deserialize(deserializeInput)
    }

    if (!viewInstance) return null

    // 9. 添加到场景
    scene.addChild(viewInstance)
    app.notify()

    return viewInstance.id
}
