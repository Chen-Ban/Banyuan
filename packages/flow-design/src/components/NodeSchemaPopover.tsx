/**
 * NodeSchemaPopover —— 点击流程节点后弹出的属性面板浮层
 *
 * 以绝对定位覆盖在画布上方，展示当前选中节点的 schema 摘要，
 * 并提供简单的属性编辑入口（后续可扩展为完整表单）。
 *
 * 定位策略：
 *   - 接收 canvasRect（canvas getBoundingClientRect）
 *   - 接收 nodeScreenPos（节点在画布物理像素坐标 → 转为 CSS 像素）
 *   - 浮层出现在节点右侧，若超出视口右边缘则翻转到左侧
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { FlowNode } from '@banyuan/flow'

// ── 样式常量 ──

const POPOVER_WIDTH = 240
const POPOVER_PADDING = 12
const ARROW_SIZE = 8
const GAP = 10  // 浮层与节点的间距

// ── 类型 ──

export interface NodeSchemaPopoverProps {
    /** 目标节点 schema */
    node: FlowNode | null
    /** 节点在 canvas CSS 坐标系中的位置（left-top 角） */
    nodePos: { x: number; y: number; width: number; height: number } | null
    /** canvas 元素的 BoundingClientRect（用于将坐标转为视口坐标） */
    canvasRect: DOMRect | null
    /** 关闭回调 */
    onClose: () => void
    /** schema 字段变更回调（key-value 形式，业务方决定如何更新场景） */
    onFieldChange?: (nodeId: string, field: string, value: unknown) => void
}

// ── 节点字段摘要渲染 ──

function renderFields(node: FlowNode): React.ReactNode {
    const rows: Array<{ label: string; value: string }> = []

    const kindLabel: Record<string, string> = {
        setData: '设置数据', setVisible: '显隐控制', navigate: '跳转页面', animate: '播放动画',
        dbQuery: '数据库查询', dbInsert: '数据库插入', dbUpdate: '数据库更新', dbDelete: '数据库删除',
        httpRequest: 'HTTP 请求', transform: '数据转换', script: '自定义脚本',
        condition: '条件分支', delay: '延迟等待', variable: 'View 变量', pageVar: '页面变量',
        eventParam: '事件参数', callFlow: '调用流程', setVariable: '设置变量', subFlow: '子流程',
    }
    rows.push({ label: '类型', value: kindLabel[node.kind] ?? node.kind })
    rows.push({ label: 'ID', value: node.id })

    switch (node.kind) {
        case 'setData':
            rows.push({ label: 'View', value: node.viewId })
            rows.push({ label: '字段', value: node.key || '(未设置)' })
            break
        case 'setVisible':
            rows.push({ label: 'View', value: node.viewId })
            rows.push({ label: '可见', value: String(node.visible) })
            break
        case 'navigate':
            rows.push({ label: '目标页面', value: node.pageId || '(未设置)' })
            break
        case 'animate':
            rows.push({ label: 'View', value: node.viewId })
            rows.push({ label: '动画 ID', value: node.animationId || '(未设置)' })
            break
        case 'condition':
            rows.push({ label: '运算符', value: node.condition.op })
            break
        case 'delay':
            rows.push({ label: '等待时长', value: `${node.ms} ms` })
            break
        case 'dbQuery':
        case 'dbInsert':
        case 'dbUpdate':
        case 'dbDelete':
            rows.push({ label: '集合', value: (node as { collection: string }).collection || '(未设置)' })
            break
        case 'httpRequest':
            rows.push({ label: 'URL', value: String((node.url as { value?: string }).value ?? '(未设置)') })
            rows.push({ label: '方法', value: node.method })
            break
        case 'script':
            rows.push({ label: '代码', value: node.code.length > 40 ? node.code.slice(0, 40) + '…' : (node.code || '(空)') })
            break
        case 'callFlow':
            rows.push({ label: 'Flow ID', value: node.flowId || '(未设置)' })
            break
        case 'subFlow':
            rows.push({ label: '名称', value: node.name })
            rows.push({ label: '子节点数', value: String(node.body.nodes.length) })
            break
        case 'variable':
            rows.push({ label: 'View', value: node.viewId })
            rows.push({ label: '字段', value: node.key || '(未设置)' })
            break
        case 'pageVar':
            rows.push({ label: '变量名', value: node.key || '(未设置)' })
            break
        case 'eventParam':
            rows.push({ label: '参数索引', value: String(node.index) })
            break
        case 'setVariable':
            rows.push({ label: 'Scope', value: node.scope })
            rows.push({ label: '变量名', value: node.key || '(未设置)' })
            break
    }

    return (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <tbody>
                {rows.map(row => (
                    <tr key={row.label}>
                        <td style={{
                            padding: '3px 8px 3px 0',
                            color: '#6b7280',
                            whiteSpace: 'nowrap',
                            verticalAlign: 'top',
                        }}>
                            {row.label}
                        </td>
                        <td style={{
                            padding: '3px 0',
                            color: '#111827',
                            wordBreak: 'break-all',
                        }}>
                            {row.value}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    )
}

// ── 主组件 ──

export const NodeSchemaPopover: React.FC<NodeSchemaPopoverProps> = ({
    node,
    nodePos,
    canvasRect,
    onClose,
    onFieldChange: _onFieldChange,
}) => {
    const popoverRef = useRef<HTMLDivElement>(null)
    const [placement, setPlacement] = useState<'right' | 'left'>('right')

    // 计算弹出位置（节点右侧优先，不够则左侧）
    useEffect(() => {
        if (!nodePos || !canvasRect) return
        const nodeRightInViewport = canvasRect.left + nodePos.x + nodePos.width + GAP
        const wouldOverflow = nodeRightInViewport + POPOVER_WIDTH > window.innerWidth - 16
        setPlacement(wouldOverflow ? 'left' : 'right')
    }, [nodePos, canvasRect])

    // 点击外部关闭
    const handleOverlayClick = useCallback((e: React.MouseEvent) => {
        if (e.target === e.currentTarget) onClose()
    }, [onClose])

    // ESC 关闭
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [onClose])

    if (!node || !nodePos || !canvasRect) return null

    // ── 计算浮层位置 ──
    // nodePos 是物理像素坐标，需要除以 DPR 转为 CSS 像素（相对于 canvas 左上角）
    const dpr = window.devicePixelRatio || 1
    const nodeLeft   = nodePos.x / dpr
    const nodeTop    = nodePos.y / dpr
    const nodeWidth  = nodePos.width / dpr
    const nodeHeight = nodePos.height / dpr

    // 浮层在视口中的位置
    const popoverTop = canvasRect.top + nodeTop + nodeHeight / 2 - 40  // 垂直居中于节点
    const popoverLeft = placement === 'right'
        ? canvasRect.left + nodeLeft + nodeWidth + GAP
        : canvasRect.left + nodeLeft - POPOVER_WIDTH - GAP

    // 箭头位置
    const arrowTop = 40 - ARROW_SIZE / 2  // 与 popoverTop 的偏移量对应

    const popoverStyle: React.CSSProperties = {
        position: 'fixed',
        top: popoverTop,
        left: popoverLeft,
        width: POPOVER_WIDTH,
        background: '#ffffff',
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)',
        border: '1px solid #e5e7eb',
        zIndex: 2000,
        overflow: 'hidden',
        animation: 'nodePopoverIn 0.12s ease-out',
    }

    const arrowStyle: React.CSSProperties = {
        position: 'absolute',
        top: arrowTop,
        ...(placement === 'right'
            ? { left: -ARROW_SIZE, borderRight: `${ARROW_SIZE}px solid #e5e7eb`, borderTop: `${ARROW_SIZE}px solid transparent`, borderBottom: `${ARROW_SIZE}px solid transparent` }
            : { right: -ARROW_SIZE, borderLeft: `${ARROW_SIZE}px solid #e5e7eb`, borderTop: `${ARROW_SIZE}px solid transparent`, borderBottom: `${ARROW_SIZE}px solid transparent` }
        ),
        width: 0,
        height: 0,
        zIndex: 2001,
    }

    const kindBadgeColor: Record<string, string> = {
        condition: '#f59e0b',
        variable: '#8b5cf6', pageVar: '#8b5cf6', eventParam: '#8b5cf6',
        setData: '#3b82f6', setVisible: '#3b82f6', navigate: '#3b82f6', animate: '#3b82f6',
        dbQuery: '#10b981', dbInsert: '#10b981', dbUpdate: '#10b981', dbDelete: '#10b981',
        httpRequest: '#f97316', transform: '#f97316', script: '#f97316',
        delay: '#6b7280', setVariable: '#6b7280',
        callFlow: '#6366f1', subFlow: '#6366f1',
    }
    const badgeColor = kindBadgeColor[node.kind] ?? '#9ca3af'

    const kindLabel: Record<string, string> = {
        setData: '设置数据', setVisible: '显隐控制', navigate: '跳转页面', animate: '播放动画',
        dbQuery: '数据库查询', dbInsert: '数据库插入', dbUpdate: '数据库更新', dbDelete: '数据库删除',
        httpRequest: 'HTTP 请求', transform: '数据转换', script: '自定义脚本',
        condition: '条件分支', delay: '延迟等待', variable: 'View 变量', pageVar: '页面变量',
        eventParam: '事件参数', callFlow: '调用流程', setVariable: '设置变量', subFlow: '子流程',
    }

    return (
        <>
            {/* 动画 keyframes（注入一次） */}
            <style>{`
                @keyframes nodePopoverIn {
                    from { opacity: 0; transform: scale(0.95) translateY(-4px); }
                    to   { opacity: 1; transform: scale(1) translateY(0); }
                }
            `}</style>

            {/* 透明遮罩层，点击关闭 */}
            <div
                style={{ position: 'fixed', inset: 0, zIndex: 1999 }}
                onClick={handleOverlayClick}
            />

            {/* 浮层主体 */}
            <div ref={popoverRef} style={popoverStyle}>
                {/* 箭头 */}
                <div style={arrowStyle} />

                {/* 标题栏 */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: `${POPOVER_PADDING}px ${POPOVER_PADDING}px 8px`,
                    borderBottom: '1px solid #f3f4f6',
                }}>
                    <span style={{
                        display: 'inline-block',
                        width: 10,
                        height: 10,
                        borderRadius: node.kind === 'condition' ? 2 : 50,
                        background: badgeColor,
                        flexShrink: 0,
                        transform: node.kind === 'condition' ? 'rotate(45deg)' : undefined,
                    }} />
                    <span style={{
                        fontWeight: 600,
                        fontSize: 13,
                        color: '#111827',
                        flex: 1,
                    }}>
                        {kindLabel[node.kind] ?? node.kind}
                    </span>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#9ca3af',
                            fontSize: 16,
                            lineHeight: 1,
                            padding: '2px 4px',
                            borderRadius: 4,
                        }}
                        title="关闭"
                    >
                        ×
                    </button>
                </div>

                {/* 字段内容 */}
                <div style={{ padding: POPOVER_PADDING }}>
                    {renderFields(node)}
                </div>
            </div>
        </>
    )
}

export default NodeSchemaPopover
