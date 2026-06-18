/**
 * NodeView —— 流程图节点（v2.0.0 适配）
 *
 * 适配 Push-Pull 调度 + ControlEdge/DataEdge 二分边模型。
 * 节点按 category 采用不同外观策略。
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

/** 根据 category + kind 推导外观 */
function deriveAppearance(category: string, kind: string): NodeAppearance {
    // 按 category 优先
    switch (category) {
        case 'control': {
            switch (kind) {
                case 'condition': return { shape: 'diamond', accentColor: '#f59e0b', icon: '⟋' }
                case 'while':     return { shape: 'rect', accentColor: '#a855f7', icon: '⟳' }
                case 'forEach':   return { shape: 'rect', accentColor: '#a855f7', icon: '↻' }
                case 'parallel':  return { shape: 'rect', accentColor: '#06b6d4', icon: '⫘' }
                case 'return':    return { shape: 'pill', accentColor: '#ef4444', icon: '↩' }
                default:          return { shape: 'rect', accentColor: '#6b7280', icon: '◆' }
            }
        }
        case 'function': {
            switch (kind) {
                case 'function':  return { shape: 'rect', accentColor: '#6366f1', icon: '⊞' }
                default:               return { shape: 'rect', accentColor: '#6366f1', icon: '◆' }
            }
        }
        case 'action': {
            switch (kind) {
                case 'setVariable': return { shape: 'rect', accentColor: '#6b7280', icon: '≔' }
                case 'navigate':    return { shape: 'rect', accentColor: '#3b82f6', icon: '→' }
                case 'cloudFunction': return { shape: 'rect', accentColor: '#f97316', icon: '⎇' }
                case 'httpRequest': return { shape: 'rect', accentColor: '#f97316', icon: '⇄' }
                case 'dbQuery':     return { shape: 'rect', accentColor: '#10b981', icon: '⬡' }
                case 'dbInsert':    return { shape: 'rect', accentColor: '#10b981', icon: '⬡' }
                case 'dbUpdate':    return { shape: 'rect', accentColor: '#10b981', icon: '⬡' }
                case 'dbDelete':    return { shape: 'rect', accentColor: '#10b981', icon: '⬡' }
                default:            return { shape: 'rect', accentColor: '#3b82f6', icon: '●' }
            }
        }
        case 'source':  return { shape: 'pill', accentColor: '#8b5cf6', icon: '◈' }
        case 'compute': return { shape: 'pill', accentColor: '#8b5cf6', icon: '◆' }
        default:        return { shape: 'rect', accentColor: '#d1d5db', icon: '●' }
    }
}

// ── 端口推导 ──

export interface PortDefinition {
    id: string
    direction: PortDirection
    index?: number
    maxConnections?: number
}

/** 从 FlowNode 推导端口（v2.0.0：无 error 端口——error 走 onError 子图） */
function derivePortsFromSchema(schema: FlowNode): PortDefinition[] {
    const ports: PortDefinition[] = []
    const cat = (schema as any).category as string
    const kind = (schema as any).kind as string

    // source / compute: 仅数据输出端口
    if (cat === 'source' || cat === 'compute') {
        ports.push({ id: `${schema.id}_value`, direction: 'output', maxConnections: Infinity })
        return ports
    }

    // function: 根据 inputs 动态推导
    if (kind === 'function') {
        const sf = schema as any
        ports.push({ id: `${schema.id}_in`, direction: 'input' })
        if (sf.inputs) {
            for (const [name] of Object.entries(sf.inputs as Record<string, unknown>)) {
                ports.push({ id: `${schema.id}_param_${name}`, direction: 'input' })
            }
        }
        ports.push({ id: `${schema.id}_out`, direction: 'output' })
        return ports
    }

    // control / action 节点: 控制入 + 控制出
    ports.push({ id: `${schema.id}_in`, direction: 'input' })

    if (kind === 'condition') {
        const cond = schema as any
        if (cond.cases) {
            for (const c of cond.cases as Array<{ label: string }>) {
                ports.push({ id: `${schema.id}_${c.label}`, direction: 'output' })
            }
        }
        if (cond.default) {
            ports.push({ id: `${schema.id}_${cond.default}`, direction: 'output' })
        }
    } else {
        // navigate / return 不能有出端口（终点节点）
        if (kind !== 'navigate' && kind !== 'return') {
            ports.push({ id: `${schema.id}_out`, direction: 'output' })
        }
    }

    return ports
}

// ── 标题推导 ──

function deriveTitleFromSchema(schema: FlowNode): string {
    const kind = (schema as any).kind as string
    switch (kind) {
        // control
        case 'condition': return '条件分支'
        case 'while':     return '循环'
        case 'forEach':   return '遍历列表'
        case 'parallel':  return '并行执行'
        case 'return':    return '返回'
        case 'function': return (schema as any).name || '本地函数'
        // action
        case 'setVariable': return '设置变量'
        case 'navigate':    return '跳转页面'
        case 'cloudFunction': return '云函数'
        case 'httpRequest': return 'HTTP 请求'
        case 'dbQuery':     return '数据库查询'
        case 'dbInsert':    return '数据库插入'
        case 'dbUpdate':    return '数据库更新'
        case 'dbDelete':    return '数据库删除'
        // source
        case 'source': {
            const src = schema as any
            return src.from === 'literal' ? '字面量' : `上下文: ${src.path || '?'}`
        }
        // compute
        case 'math':    return '算术运算'
        case 'compare': return '比较运算'
        case 'logic':   return '逻辑运算'
        case 'concat':  return '拼接字符串'
        case 'format':  return '格式化'
        case 'get':     return '字段提取'
        default: return kind || 'Node'
    }
}

// ── 摘要行推导 ──

/** 将 SlotValue 转为可读字符串 */
function slotToString(slot: unknown): string {
    if (slot === null || slot === undefined) return 'null'
    if (typeof slot === 'string') return slot.length > 12 ? `"${slot.slice(0, 12)}…"` : `"${slot}"`
    if (typeof slot === 'number' || typeof slot === 'boolean') return String(slot)
    if (typeof slot === 'object') return '{…}'
    return '?'
}

function deriveSummaryFromSchema(schema: FlowNode): string | null {
    const kind = (schema as any).kind as string
    const cat = (schema as any).category as string

    if (cat === 'source') {
        const src = schema as any
        if (src.from === 'literal') return slotToString(src.value)
        return src.path ?? '?'
    }

    if (cat === 'compute') {
        const comp = schema as any
        switch (kind) {
            case 'math':    return `${slotToString(comp.a)} ${comp.op} ${slotToString(comp.b)}`
            case 'compare': return `${slotToString(comp.a)} ${comp.op} ${slotToString(comp.b)}`
            case 'logic':   return `${comp.op}(${(comp.operands as any[])?.map(slotToString).join(', ') ?? ''})`
            case 'concat':  return (comp.parts as any[])?.map(slotToString).join(' + ') ?? ''
            case 'format':  return comp.template
            case 'get':     return `${slotToString(comp.object)}.${comp.path}`
        }
    }

    switch (kind) {
        case 'setVariable': return `${(schema as any).target} = ${slotToString((schema as any).value)}`
        case 'navigate':    return `→ ${slotToString((schema as any).target)}`
        case 'cloudFunction': return `📞 ${slotToString((schema as any).slots?.[0]?.input?.functionId) || '?'}`
        case 'httpRequest': return `${slotToString((schema as any).slots?.[0]?.input?.method) || 'GET'} ${slotToString((schema as any).slots?.[0]?.input?.url)}`
        case 'dbQuery':     return `${slotToString((schema as any).slots?.[0]?.input?.collection) || '?'} → rows`
        case 'dbInsert':    return `${slotToString((schema as any).slots?.[0]?.input?.collection) || '?'} ← insert`
        case 'dbUpdate':    return `${slotToString((schema as any).slots?.[0]?.input?.collection) || '?'} ← update`
        case 'dbDelete':    return `${slotToString((schema as any).slots?.[0]?.input?.collection) || '?'} ← delete`
        case 'condition':   return `${(schema as any).cases?.length ?? 0} 分支`
        case 'while':       return 'while (…)'
        case 'forEach':     return `∀ ${(schema as any).itemVar ?? 'item'} in ${slotToString((schema as any).collection)}`
        case 'parallel':    return `${(schema as any).slots?.[0]?.body?.length ?? 0} 分支 (${(schema as any).slots?.[0]?.mode})`
        case 'function': return null // 无摘要
        default:            return null
    }
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
        const cat = (options.schema as any).category ?? 'action'
        const kind = (options.schema as any).kind ?? 'unknown'
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
            this.addView(port)
        }
    }

    interact(localPoint: Point3): IInteractResult | null {
        // PortView 优先
        for (const child of this.children) {
            if (child instanceof PortView) {
                const result = child.interact(localPoint.clone())
                if (result) return result
            }
        }
        // 回退到 BoundingBox
        return super.interact(localPoint)
    }
}
