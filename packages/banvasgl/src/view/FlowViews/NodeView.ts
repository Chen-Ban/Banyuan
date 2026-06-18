/**
 * NodeView —— 流程图节点（v2.0.0 slots 架构适配）
 *
 * 基于 category + kind 判别联合类型，通过 slots[] 访问所有业务数据。
 * 端口自动推导，外观策略按 category/kind 组合决定。
 */

import Point3 from '@/foundation/math/Point3.js'
import { ViewType } from '@/foundation/constants.js'
import ContainerView from '@/view/ContainerView/index.js'
import Rectangle from '@/graph/combined/Polygon/Rectangle.js'
import Bounds from '@/graph/base/Bounds.js'
import PortView from './PortView.js'
import type {
    INodeView,
    PortDirection,
    IInteractResult,
    IContainerViewOptions,
    FlowNode,
} from '@/types/index.js'

// 节点默认尺寸
const NODE_DEFAULT_WIDTH  = 160
const NODE_DEFAULT_HEIGHT = 80
const PORT_RADIUS = 8

// ── 节点外观策略 ──

type NodeShape = 'rect' | 'diamond' | 'pill'

interface NodeAppearance {
    shape: NodeShape
    accentColor: string
    icon: string
}

/** 根据 category + kind 推导外观 —— 全量 25 种 kind */
function deriveAppearance(category: string, kind: string): NodeAppearance {
    switch (category) {
        case 'control': {
            switch (kind) {
                case 'condition': return { shape: 'diamond', accentColor: '#f59e0b', icon: '⟋' }
                case 'loop':      return { shape: 'rect',    accentColor: '#a855f7', icon: '⟳' }
                case 'parallel':  return { shape: 'rect',    accentColor: '#06b6d4', icon: '⫘' }
                case 'return':    return { shape: 'pill',    accentColor: '#ef4444', icon: '↩' }
                default:          return { shape: 'rect',    accentColor: '#6b7280', icon: '◆' }
            }
        }
        case 'function': {
            return { shape: 'rect', accentColor: '#6366f1', icon: '⊞' }
        }
        case 'action': {
            switch (kind) {
                case 'setVariable':    return { shape: 'rect', accentColor: '#6b7280', icon: '≔' }
                case 'setViewData':    return { shape: 'rect', accentColor: '#8b5cf6', icon: '📋' }
                case 'setViewVisible': return { shape: 'rect', accentColor: '#8b5cf6', icon: '👁' }
                case 'playAnimation':  return { shape: 'rect', accentColor: '#8b5cf6', icon: '▶' }
                case 'navigate':       return { shape: 'rect', accentColor: '#3b82f6', icon: '→' }
                case 'cloudFunction':  return { shape: 'rect', accentColor: '#f97316', icon: '⎇' }
                case 'httpRequest':    return { shape: 'rect', accentColor: '#f97316', icon: '⇄' }
                case 'dbQuery':        return { shape: 'rect', accentColor: '#10b981', icon: '⬡' }
                case 'dbInsert':       return { shape: 'rect', accentColor: '#10b981', icon: '⬡' }
                case 'dbUpdate':       return { shape: 'rect', accentColor: '#10b981', icon: '⬡' }
                case 'dbDelete':       return { shape: 'rect', accentColor: '#10b981', icon: '⬡' }
                default:               return { shape: 'rect', accentColor: '#3b82f6', icon: '●' }
            }
        }
        case 'source': {
            return { shape: 'pill', accentColor: '#8b5cf6', icon: kind === 'literal' ? '📝' : '🔗' }
        }
        case 'compute': {
            return { shape: 'pill', accentColor: '#8b5cf6', icon: '◆' }
        }
        default: {
            return { shape: 'rect', accentColor: '#d1d5db', icon: '●' }
        }
    }
}

// ── 端口推导 ──

export interface PortDefinition {
    id: string
    direction: PortDirection
    index?: number
    maxConnections?: number
}

/**
 * 从 FlowNode 推导端口（v2.0.0 slots 架构）。
 *
 * 端口 ID 编码约定：`{nodeId}_{suffix}`
 * - 控制输入: `_in`
 * - 控制输出（默认）: `_out`
 * - 数据输出（source/compute）: `_value`
 * - 条件分支: `_{slotIndex}`（0, 1, 2, …）
 * - 函数参数: `_param_{name}`
 */
function derivePortsFromSchema(schema: FlowNode): PortDefinition[] {
    const ports: PortDefinition[] = []
    const { id, category, kind } = schema

    // source / compute: 仅数据输出端口（无控制流入口）
    if (category === 'source' || category === 'compute') {
        ports.push({ id: `${id}_value`, direction: 'output', maxConnections: Infinity })
        return ports
    }

    // control / action / function: 有控制输入
    ports.push({ id: `${id}_in`, direction: 'input' })

    if (kind === 'condition') {
        // 每个 slot 是一条条件分支，按索引生成输出端口
        for (let i = 0; i < schema.slots.length; i++) {
            ports.push({ id: `${id}_${i}`, direction: 'output' })
        }
    } else if (kind === 'return' || kind === 'navigate') {
        // 终点节点：无出端口
    } else if (kind === 'function') {
        // 函数节点：参数端口从 slots[0].input 的 key 推导
        const slot0 = schema.slots[0]
        if (slot0 && slot0.input) {
            for (const paramName of Object.keys(slot0.input)) {
                ports.push({ id: `${id}_param_${paramName}`, direction: 'input', maxConnections: Infinity })
            }
        }
        ports.push({ id: `${id}_out`, direction: 'output' })
    } else {
        // 默认：一个控制输出端口
        ports.push({ id: `${id}_out`, direction: 'output' })
    }

    return ports
}

// ── 标题推导 ──

/** 全量 25 种 kind → 中文标题 */
const KIND_TITLES: Record<string, string> = {
    // control
    condition: '条件分支',
    loop: '循环',
    parallel: '并行执行',
    return: '返回',
    // function
    function: '本地函数',
    // action
    setVariable: '设置变量',
    setViewData: '设置 View 数据',
    setViewVisible: '显隐控制',
    playAnimation: '播放动画',
    navigate: '跳转页面',
    cloudFunction: '云函数',
    httpRequest: 'HTTP 请求',
    dbQuery: '数据库查询',
    dbInsert: '数据库插入',
    dbUpdate: '数据库更新',
    dbDelete: '数据库删除',
    // source
    literal: '字面量',
    context: '上下文',
    // compute
    math: '算术运算',
    compare: '比较运算',
    logic: '逻辑运算',
    concat: '拼接字符串',
    format: '格式化',
    get: '字段提取',
}

function deriveTitleFromSchema(schema: FlowNode): string {
    return KIND_TITLES[schema.kind] || schema.kind || 'Node'
}

// ── 摘要行推导 ──

/** 将 SlotValue 转为可读字符串 */
function slotToString(slot: unknown): string {
    if (slot === null || slot === undefined) return 'null'
    if (typeof slot === 'string') return slot.length > 12 ? `"${slot.slice(0, 12)}…"` : `"${slot}"`
    if (typeof slot === 'number' || typeof slot === 'boolean') return String(slot)
    if (typeof slot === 'object') {
        // DataRef 或普通对象
        const obj = slot as Record<string, unknown>
        if ('nodeId' in obj && 'field' in obj) {
            return `↗ ${String(obj.field)}`
        }
        return '{…}'
    }
    return '?'
}

function deriveSummaryFromSchema(schema: FlowNode): string | null {
    const { category, kind } = schema
    const slot0 = schema.slots[0]

    if (category === 'source') {
        if (kind === 'literal') {
            return slot0 ? slotToString((slot0 as { value: unknown }).value) : '?'
        }
        if (kind === 'context') {
            return slot0 ? (slot0 as { path: string }).path ?? '?' : '?'
        }
    }

    if (category === 'compute') {
        if (!slot0) return null
        const inp = (slot0 as { input: Record<string, unknown> }).input
        switch (kind) {
            case 'math':    return `${slotToString(inp.a)} ${inp.op} ${slotToString(inp.b)}`
            case 'compare': return `${slotToString(inp.a)} ${inp.op} ${slotToString(inp.b)}`
            case 'logic':   return `${inp.op}(${slotToString(inp.a)}, ${slotToString(inp.b)})`
            case 'concat':  return `${slotToString(inp.a)} + ${slotToString(inp.b)}`
            case 'format':  return String(inp.template ?? '')
            case 'get':     return `${slotToString(inp.object)}.${inp.path}`
        }
    }

    if (category === 'action') {
        if (!slot0) return null
        const inp = (slot0 as { input: Record<string, unknown> }).input
        const s = slot0 as { next?: string; onError?: unknown }
        switch (kind) {
            case 'setVariable':    return `${slotToString(inp.target)} = ${slotToString(inp.value)}`
            case 'setViewData':    return `${slotToString(inp.viewId)}.${slotToString(inp.key)} ← ${slotToString(inp.value)}`
            case 'setViewVisible': return `${slotToString(inp.viewId)} ${inp.visible ? '显示' : '隐藏'}`
            case 'playAnimation':  return `${slotToString(inp.viewId)} ▶ ${slotToString(inp.animationId)}`
            case 'navigate':       return `→ ${slotToString(inp.target)}`
            case 'cloudFunction':  return `📞 ${slotToString(inp.functionId)}`
            case 'httpRequest':    return `${slotToString(inp.method) || 'GET'} ${slotToString(inp.url)}`
            case 'dbQuery':        return `${slotToString(inp.collection)} → rows`
            case 'dbInsert':       return `${slotToString(inp.collection)} ← insert`
            case 'dbUpdate':       return `${slotToString(inp.collection)} ← update`
            case 'dbDelete':       return `${slotToString(inp.collection)} ← delete`
        }
    }

    if (category === 'control') {
        switch (kind) {
            case 'condition': return `${schema.slots.length} 分支`
            case 'loop':      return `while (…)`
            case 'parallel': {
                const ps = slot0 as { body?: unknown[]; mode?: string } | undefined
                const count = ps?.body?.length ?? 0
                return `${count} 分支${ps?.mode ? ` (${ps.mode})` : ''}`
            }
            case 'return': return slot0 && Object.keys(slot0.input ?? {}).length > 0 ? '有返回值' : '终止'
        }
    }

    if (category === 'function') {
        return null
    }

    return null
}

// ── NodeView 类 ──

export interface NodeViewOptions extends IContainerViewOptions {
    schema: FlowNode
    nodeTitle?: string
    ports?: PortDefinition[]
}

export default class NodeView extends ContainerView implements INodeView {
    public readonly type = ViewType.NODEVIEW
    public nodeTitle: string
    public schema: FlowNode
    private appearance: NodeAppearance

    constructor(options: NodeViewOptions) {
        const w = options.style?.width  ?? NODE_DEFAULT_WIDTH
        const h = options.style?.height ?? NODE_DEFAULT_HEIGHT

        super({
            ...options,
            id: options.schema.id,
            style: { width: w, height: h, overflow: 'visible', ...(options.style ?? {}) },
            content: new Rectangle(0, 0, w as number, h as number),
        })

        this.schema = options.schema
        const cat = options.schema.category
        const kind = options.schema.kind
        this.nodeTitle = options.nodeTitle ?? deriveTitleFromSchema(options.schema)
        this.appearance = deriveAppearance(cat, kind)

        // 自动推导端口
        const ports = options.ports ?? derivePortsFromSchema(options.schema)
        this.createPorts(ports)
    }

    private createPorts(portDefs: PortDefinition[]): void {
        for (const def of portDefs) {
            const port = new PortView({
                id: def.id,
                portDirection: def.direction,
                portIndex: def.index,
                maxConnections: def.maxConnections,
            })
            this.addChild(port)
        }
    }

    protected override interactChildren(scrolledPoint: Point3, bufferCtx: CanvasRenderingContext2D): IInteractResult {
        // 将 scrolledPoint 转回世界坐标传给 PortView 子节点
        const worldPoint = this.getMVPMatrix().multiply(scrolledPoint)
        // PortView 优先
        for (const child of this.children) {
            if (child instanceof PortView) {
                const result = child.interact(worldPoint, bufferCtx)
                if (result.view && result.content && result.extraData) return result
            }
        }
        // 回退到默认子节点检测
        return super.interactChildren(scrolledPoint, bufferCtx)
    }

    public copy(): NodeView {
        return new NodeView({
            id: this.id,
            schema: this.schema,
            nodeTitle: this.nodeTitle,
            style: { ...this.style },
            matrix: this.matrix.copy(),
        })
    }
}
