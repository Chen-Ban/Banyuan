/**
 * action 求值器 —— 产生副作用
 */

import { NodeKind } from '@/types/foundation/flow/enums.js'
import type { NodeEvaluator } from "./types.js"
import type { FlowSetVariableNode, FlowSetViewDataNode, FlowSetViewVisibleNode, FlowPlayAnimationNode, FlowNavigateNode, FlowCloudFunctionNode } from '@/types/foundation/flow/nodes/action.js'

// ── setVariable ──

export const setVariableExecutor: NodeEvaluator<FlowSetVariableNode> = {
  kind: NodeKind.SetVariable,
  outputPorts: [],
  async evaluate(node, inputs, ctx) {
    const target = node.slots[0].input.target as string
    const value = inputs.value

    const parts = target.split('.')
    if (parts[0] === 'state') {
      // state.* 已废弃 — 请迁移到 setViewData（设置 view 数据）或 vars.local（临时变量）
      console.warn(
        `[setVariable] state.* 已废弃，请使用 setViewData / setViewVisible / playAnimation 节点。` +
        `收到目标: ${target}`
      )
      return {}
    }
    if (parts[0] === 'vars' && parts[1] === 'local') {
      const key = parts.slice(2).join('.')
      ctx.stack.local[key] = value
      return {}
    }
    // 默认写入 vars.local
    ctx.stack.local[target] = value
    return {}
  },
}

// ── setViewData ──

export const setViewDataExecutor: NodeEvaluator<FlowSetViewDataNode> = {
  kind: NodeKind.SetViewData,
  outputPorts: [],
  async evaluate(_node, inputs, ctx) {
    const cap = ctx.cap as any
    if (typeof cap.setViewData === 'function') {
      cap.setViewData(
        String(inputs.viewId ?? ''),
        String(inputs.key ?? ''),
        inputs.value,
      )
    }
    return {}
  },
}

// ── setViewVisible ──

export const setViewVisibleExecutor: NodeEvaluator<FlowSetViewVisibleNode> = {
  kind: NodeKind.SetViewVisible,
  outputPorts: [],
  async evaluate(_node, inputs, ctx) {
    const cap = ctx.cap as any
    if (typeof cap.setViewVisible === 'function') {
      cap.setViewVisible(
        String(inputs.viewId ?? ''),
        Boolean(inputs.visible),
      )
    }
    return {}
  },
}

// ── playAnimation ──

export const playAnimationExecutor: NodeEvaluator<FlowPlayAnimationNode> = {
  kind: NodeKind.PlayAnimation,
  outputPorts: [],
  async evaluate(_node, inputs, ctx) {
    const cap = ctx.cap as any
    if (typeof cap.playAnimation === 'function') {
      cap.playAnimation(
        String(inputs.viewId ?? ''),
        String(inputs.animationId ?? ''),
      )
    }
    return {}
  },
}

// ── navigate ──

export const navigateExecutor: NodeEvaluator<FlowNavigateNode> = {
  kind: NodeKind.Navigate,
  outputPorts: [],
  async evaluate(_node, inputs, ctx) {
    const cap = ctx.cap as any
    if (typeof cap.navigate === 'function') {
      await cap.navigate(String(inputs.target ?? ''))
    }
    return {}
  },
}

// ── cloudFunction ──

export const cloudFunctionExecutor: NodeEvaluator<FlowCloudFunctionNode> = {
  kind: NodeKind.CloudFunction,
  outputPorts: ['status', 'body', 'headers'],
  async evaluate(_node, inputs, ctx) {
    const cap = ctx.cap as any
    const http = cap.httpClient
    if (!http) throw new Error('httpClient not available in context')

    const result = await http.request(
      String(inputs.method ?? 'POST'),
      `/api/functions/${String(inputs.functionId ?? '')}`,
      { 'Content-Type': 'application/json' },
      inputs.args,
    )
    return {
      outputs: {
        status: result.status,
        body: result.body,
        headers: result.headers,
      },
    }
  },
}
