import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { FlowNode } from '@banyuan/flow'
import styles from './index.module.scss'

const POPOVER_WIDTH = 240
const ARROW_SIZE = 8
const GAP = 10

export interface NodeSchemaPopoverProps {
    node: FlowNode | null
    nodePos: { x: number; y: number; width: number; height: number } | null
    canvasRect: DOMRect | null
    onClose: () => void
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
        <table className={styles.fieldTable}>
            <tbody>
                {rows.map(row => (
                    <tr key={row.label}>
                        <td className={styles.fieldLabel}>{row.label}</td>
                        <td className={styles.fieldValue}>{row.value}</td>
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

    useEffect(() => {
        if (!nodePos || !canvasRect) return
        const nodeRightInViewport = canvasRect.left + nodePos.x + nodePos.width + GAP
        const wouldOverflow = nodeRightInViewport + POPOVER_WIDTH > window.innerWidth - 16
        setPlacement(wouldOverflow ? 'left' : 'right')
    }, [nodePos, canvasRect])

    const handleOverlayClick = useCallback((e: React.MouseEvent) => {
        if (e.target === e.currentTarget) onClose()
    }, [onClose])

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [onClose])

    if (!node || !nodePos || !canvasRect) return null

    const dpr = window.devicePixelRatio || 1
    const nodeLeft   = nodePos.x / dpr
    const nodeTop    = nodePos.y / dpr
    const nodeWidth  = nodePos.width / dpr
    const nodeHeight = nodePos.height / dpr

    const popoverTop = canvasRect.top + nodeTop + nodeHeight / 2 - 40
    const popoverLeft = placement === 'right'
        ? canvasRect.left + nodeLeft + nodeWidth + GAP
        : canvasRect.left + nodeLeft - POPOVER_WIDTH - GAP

    const arrowTop = 40 - ARROW_SIZE / 2

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
            <div className={styles.backdrop} onClick={handleOverlayClick} />

            <div
                ref={popoverRef}
                className={styles.popover}
                style={{ top: popoverTop, left: popoverLeft }}
            >
                {/* 箭头 */}
                <div
                    className={placement === 'right' ? styles.arrowRight : styles.arrowLeft}
                    style={{
                        top: arrowTop,
                        ...(placement === 'right' ? { left: -ARROW_SIZE } : { right: -ARROW_SIZE }),
                    }}
                />

                {/* 标题栏 */}
                <div className={styles.header}>
                    <span
                        className={node.kind === 'condition' ? styles.badgeDiamond : styles.badgeRound}
                        style={{ background: badgeColor }}
                    />
                    <span className={styles.title}>
                        {kindLabel[node.kind] ?? node.kind}
                    </span>
                    <button className={styles.closeBtn} onClick={onClose} title="关闭">×</button>
                </div>

                {/* 字段内容 */}
                <div className={styles.body}>
                    {renderFields(node)}
                </div>
            </div>
        </>
    )
}

export default NodeSchemaPopover
