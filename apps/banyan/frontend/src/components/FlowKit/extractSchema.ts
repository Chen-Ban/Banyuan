/**
 * extractSchema —— 从视图树中提取 FlowSchema + 布局信息
 *
 * v2.0.0 重写：
 * - nodes 为 Record<string, FlowNode>（符合 FlowSchema 类型）
 * - 边信息从 EdgeView 反推写入对应 node.slots[*].next
 * - 布局信息单独存储为 layout: Record<string, {x, y}>
 *
 * @param children 当前页面的顶层子视图列表（通过 actions.page.getTopLevelViews() 获取）
 */

import type { View } from '@banyuan/banvasgl'
import type { FlowSchema, FlowNode } from '@banyuan/banvasgl'
import { NodeView, EdgeView } from '@banyuan/banvasgl'
import { FLOW_SCHEMA_VERSION } from '@banyuan/banvasgl'

/** 提取结果的完整类型：FlowSchema 执行数据 + 可视化布局 */
export interface ExtractedFlowSchema extends FlowSchema {
  /** 节点位置信息（nodeId → 世界坐标） */
  layout: Record<string, { x: number; y: number }>
}

export function extractSchema(children: View[]): ExtractedFlowSchema {
  const nodes: Record<string, FlowNode> = {}
  const layout: Record<string, { x: number; y: number }> = {}

  // ── 第一遍：收集所有 NodeView → 构建 nodes + layout ──
  const nodeViews: NodeView[] = []
  for (const child of children) {
    if (child instanceof NodeView) {
      nodeViews.push(child)
      // 深拷贝 schema 以避免修改原 NodeView 的数据
      const schema = JSON.parse(JSON.stringify(child.schema)) as FlowNode
      nodes[schema.id] = schema
      layout[schema.id] = {
        x: child.matrix.get(0, 3),
        y: child.matrix.get(1, 3),
      }
    }
  }

  // ── 第二遍：收集所有 EdgeView → 写入 slots[*].next ──
  for (const child of children) {
    if (!(child instanceof EdgeView)) continue
    if (!child.fromPortId || !child.toPortId) continue

    // 从端口 ID 反推 nodeId 和 slotIndex
    // 端口格式: {nodeId}_{suffix}
    const fromLastUnderscore = child.fromPortId.lastIndexOf('_')
    if (fromLastUnderscore < 0) continue

    const fromNodeId = child.fromPortId.slice(0, fromLastUnderscore)
    const fromSuffix = child.fromPortId.slice(fromLastUnderscore + 1)

    const toLastUnderscore = child.toPortId.lastIndexOf('_')
    if (toLastUnderscore < 0) continue
    const toNodeId = child.toPortId.slice(0, toLastUnderscore)

    const fromNode = nodes[fromNodeId]
    if (!fromNode || !fromNode.slots) continue

    // 确定写入哪个 slot
    if (fromSuffix === 'out' || fromSuffix === 'value') {
      // 默认输出端口 → 写入 slots[0].next
      if (fromNode.slots.length > 0) {
        const slot = fromNode.slots[0] as unknown as Record<string, unknown>
        slot.next = toNodeId
      }
    } else if (/^\d+$/.test(fromSuffix)) {
      // 数字后缀 → condition 节点的分支索引
      const slotIndex = parseInt(fromSuffix, 10)
      if (slotIndex < fromNode.slots.length) {
        const slot = fromNode.slots[slotIndex] as unknown as Record<string, unknown>
        slot.next = toNodeId
      }
    }
    // 其他后缀（如 _param_xxx）不写入 next，因为这些是数据端口
  }

  // ── 推导 entry：选择第一个 category 为 control 或 action 的节点 ──
  let entry = ''
  for (const nodeId of Object.keys(nodes)) {
    const node = nodes[nodeId]
    if (node.category === 'control' || node.category === 'action') {
      // 优先选择没有入边的节点（没有其他节点的 next 指向它）
      const hasIncoming = Object.values(nodes).some((n) =>
        n.slots?.some((s) => (s as unknown as Record<string, unknown>).next === nodeId)
      )
      if (!hasIncoming) {
        entry = nodeId
        break
      }
    }
  }
  // 如果没有找到无入边的节点，取第一个 control/action
  if (!entry) {
    for (const nodeId of Object.keys(nodes)) {
      const node = nodes[nodeId]
      if (node.category === 'control' || node.category === 'action') {
        entry = nodeId
        break
      }
    }
  }

  return {
    version: FLOW_SCHEMA_VERSION,
    entry,
    nodes,
    layout,
  }
}
