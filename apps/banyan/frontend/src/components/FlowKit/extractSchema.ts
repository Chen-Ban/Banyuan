import type { View } from '@banyuan/banvasgl'
import type { FlowSchema, FlowNode, FlowEdge } from '@banyuan/banvasgl'
import { NodeView, EdgeView } from '@banyuan/banvasgl'

/**
 * extractSchema —— 从视图列表中提取完整 FlowSchema
 *
 * 遍历 NodeView 和 EdgeView：
 * - NodeView.schema 包含完整业务数据，坐标从 View.matrix 读取
 * - EdgeView 根据端口 ID 反推 from/to nodeId 和 branch
 *
 * 这是流程图的"序列化"操作，等价于主画布的 Serializer.serialize()。
 *
 * @param children 当前页面的顶层子视图列表（通过 actions.page.getTopLevelViews() 获取）
 */
export function extractSchema(children: View[]): FlowSchema {
    const nodes: FlowNode[] = []
    const edges: FlowEdge[] = []

    for (const child of children) {
        if (child instanceof NodeView) {
            nodes.push({
                ...child.schema,
                x: child.matrix.get(0, 3),
                y: child.matrix.get(1, 3),
            })
        } else if (child instanceof EdgeView) {
            if (!child.fromPortId || !child.toPortId) continue

            // 从端口 ID 反推 nodeId：格式为 ${nodeId}_${suffix}
            const fromNodeId = child.fromPortId.replace(/_[^_]+$/, '')
            const toNodeId = child.toPortId.replace(/_[^_]+$/, '')
            const fromSuffix = child.fromPortId.slice(fromNodeId.length + 1)

            let branch: 'true' | 'false' | 'error' | undefined
            if (fromSuffix === 'true') branch = 'true'
            else if (fromSuffix === 'false') branch = 'false'
            else if (fromSuffix === 'error') branch = 'error'

            edges.push({
                id: child.id || `edge_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                from: fromNodeId,
                to: toNodeId,
                branch,
            })
        }
    }

    return { nodes, edges }
}
