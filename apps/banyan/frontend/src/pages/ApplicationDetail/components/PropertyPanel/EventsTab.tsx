import React, { useState } from 'react'
import { Button, Select } from 'antd'
import type { IBanvasActions, IViewEvents, IViewLifetimes, ISceneLifetimes, EventHandler, FlowSchema } from 'banvasgl'
import FlowCanvas from './FlowCanvas'
import styles from './index.module.scss'

// ── View 模式 Props ──
interface ViewEventsTabProps {
    mode: 'view'
    selectedViewId: string
    actions: IBanvasActions
}

// ── Page 模式 Props ──
interface PageEventsTabProps {
    mode: 'page'
    pageId: string
    actions: IBanvasActions
}

type EventsTabProps = ViewEventsTabProps | PageEventsTabProps

// View 生命周期钩子名称与描述
const VIEW_LIFETIME_ENTRIES: { key: keyof IViewLifetimes; label: string }[] = [
    { key: 'onCreated', label: 'onCreated' },
    { key: 'onAttach', label: 'onAttach' },
    { key: 'onDestroy', label: 'onDestroy' },
]

// Page (Scene) 生命周期钩子名称与描述
const PAGE_LIFETIME_ENTRIES: { key: keyof ISceneLifetimes; label: string }[] = [
    { key: 'onLoad', label: 'onLoad' },
    { key: 'onUnload', label: 'onUnload' },
    { key: 'onShow', label: 'onShow' },
    { key: 'onHide', label: 'onHide' },
]

// 所有可用的交互事件
const ALL_EVENT_KEYS: { key: keyof IViewEvents; label: string }[] = [
    { key: 'onClick', label: 'onClick' },
    { key: 'onDoubleClick', label: 'onDoubleClick' },
    { key: 'onMouseEnter', label: 'onMouseEnter' },
    { key: 'onMouseLeave', label: 'onMouseLeave' },
    { key: 'onMouseDown', label: 'onMouseDown' },
    { key: 'onMouseUp', label: 'onMouseUp' },
]

function handlerPreview(handler: EventHandler): string {
    if (handler === null) return ''
    if (typeof handler === 'string') return handler || '(空)'
    if (typeof handler === 'function') return '(函数)'
    // FlowSchema
    const schema = handler as FlowSchema
    const nodeCount = schema.nodes?.length ?? 0
    const edgeCount = schema.edges?.length ?? 0
    if (nodeCount === 0) return '(空流程)'
    return `${nodeCount} 节点 · ${edgeCount} 连线`
}

function toFlowSchema(handler: EventHandler): FlowSchema | null {
    if (!handler || typeof handler === 'string' || typeof handler === 'function') return null
    return handler as FlowSchema
}

// ── 单个事件行（含可展开的画布） ──
interface EventRowItemProps {
    label: string
    handler: EventHandler
    onDelete: () => void
    onSchemaChange: (schema: FlowSchema) => void
}

const EventRowItem: React.FC<EventRowItemProps> = ({ label, handler, onDelete, onSchemaChange }) => {
    const [expanded, setExpanded] = useState(false)
    const schema = toFlowSchema(handler)

    return (
        <div className={styles.eventItem}>
            <div className={styles.eventRow}>
                {/* 展开/折叠按钮 */}
                <Button
                    size="small"
                    type="text"
                    className={`${styles.expandBtn} ${expanded ? styles.expandBtnOpen : ''}`}
                    onClick={() => setExpanded((v) => !v)}
                    title={expanded ? '折叠画布' : '展开画布'}
                >▶</Button>
                <span className={styles.eventName}>{label}</span>
                <span className={styles.eventPreview}>{handlerPreview(handler)}</span>
                <Button
                    size="small"
                    type="text"
                    danger
                    onClick={onDelete}
                    title="删除"
                    style={{ padding: '0 4px', minWidth: 20 }}
                >×</Button>
            </div>
            {expanded && (
                <div className={styles.flowCanvasContainer}>
                    <FlowCanvas
                        schema={schema}
                        onChange={onSchemaChange}
                    />
                </div>
            )}
        </div>
    )
}

// ── 单个生命周期行（含可展开的画布） ──
interface LifetimeRowItemProps {
    label: string
    handler: EventHandler
    onDelete?: () => void
    onSchemaChange: (schema: FlowSchema) => void
}

const LifetimeRowItem: React.FC<LifetimeRowItemProps> = ({ label, handler, onDelete, onSchemaChange }) => {
    const [expanded, setExpanded] = useState(false)
    const schema = toFlowSchema(handler)
    const hasBound = handler !== null

    return (
        <div className={styles.eventItem}>
            <div className={styles.eventRow}>
                <Button
                    size="small"
                    type="text"
                    className={`${styles.expandBtn} ${expanded ? styles.expandBtnOpen : ''}`}
                    onClick={() => setExpanded((v) => !v)}
                    title={expanded ? '折叠画布' : '展开画布'}
                >▶</Button>
                <span className={styles.eventName}>{label}</span>
                <span className={styles.eventPreview}>{handlerPreview(handler)}</span>
                {hasBound && onDelete && (
                    <Button
                        size="small"
                        type="text"
                        danger
                        onClick={onDelete}
                        title="清除"
                        style={{ padding: '0 4px', minWidth: 20 }}
                    >×</Button>
                )}
            </div>
            {expanded && (
                <div className={styles.flowCanvasContainer}>
                    <FlowCanvas
                        schema={schema}
                        onChange={onSchemaChange}
                    />
                </div>
            )}
        </div>
    )
}

const EventsTab: React.FC<EventsTabProps> = (props) => {
    const { actions } = props

    // ── Page 模式：只展示 Scene 生命周期 ──
    if (props.mode === 'page') {
        const lifetimes = actions.page.getPageLifetimes(props.pageId)

        return (
            <div className={styles.tabContent}>
                <section className={styles.section}>
                    <div className={styles.sectionHeader}>生命周期</div>
                    {PAGE_LIFETIME_ENTRIES.map(({ key, label }) => (
                        <LifetimeRowItem
                            key={key}
                            label={label}
                            handler={lifetimes[key]}
                            onDelete={() => actions.page.deletePageLifetime(props.pageId, key)}
                            onSchemaChange={(schema) =>
                                actions.page.setPageLifetime(props.pageId, key, schema)
                            }
                        />
                    ))}
                </section>
            </div>
        )
    }

    // ── View 模式：展示 View 生命周期 + 交互事件 ──
    const { selectedViewId } = props
    const lifetimes = actions.view.getViewLifetimes(selectedViewId)
    const events = actions.view.getViewEvents(selectedViewId)

    // 已绑定的事件 keys
    const boundEventKeys = ALL_EVENT_KEYS.filter(({ key }) => events[key] !== null)
    // 未绑定的事件 keys（供下拉选择）
    const unboundEventKeys = ALL_EVENT_KEYS.filter(({ key }) => events[key] === null)

    const [addingEvent, setAddingEvent] = useState<keyof IViewEvents | ''>('')

    const handleAddEvent = () => {
        if (!addingEvent) return
        actions.view.setViewEvent(selectedViewId, addingEvent, { nodes: [], edges: [] })
        setAddingEvent('')
    }

    return (
        <div className={styles.tabContent}>
            {/* 生命周期区域 */}
            <section className={styles.section}>
                <div className={styles.sectionHeader}>生命周期</div>
                {VIEW_LIFETIME_ENTRIES.map(({ key, label }) => (
                    <LifetimeRowItem
                        key={key}
                        label={label}
                        handler={lifetimes[key]}
                        onDelete={() => actions.view.deleteViewLifetime(selectedViewId, key)}
                        onSchemaChange={(schema) =>
                            actions.view.setViewLifetime(selectedViewId, key, schema)
                        }
                    />
                ))}
            </section>

            {/* 交互事件区域 */}
            <section className={styles.section}>
                <div className={styles.sectionHeader}>交互事件</div>
                {boundEventKeys.map(({ key, label }) => (
                    <EventRowItem
                        key={key}
                        label={label}
                        handler={events[key]}
                        onDelete={() => actions.view.deleteViewEvent(selectedViewId, key)}
                        onSchemaChange={(schema) =>
                            actions.view.setViewEvent(selectedViewId, key, schema)
                        }
                    />
                ))}
                {boundEventKeys.length === 0 && (
                    <div className={styles.emptyFields}>暂无事件</div>
                )}
                {/* 添加事件 */}
                {unboundEventKeys.length > 0 && (
                    <div className={styles.addEventRow}>
                        <Select
                            size="small"
                            value={addingEvent || undefined}
                            placeholder="选择事件..."
                            options={unboundEventKeys.map(({ key, label }) => ({ value: key, label }))}
                            onChange={(val) => setAddingEvent(val as keyof IViewEvents)}
                            style={{ flex: 1 }}
                        />
                        <Button
                            size="small"
                            type="primary"
                            onClick={handleAddEvent}
                            disabled={!addingEvent}
                            style={{ padding: '0 8px' }}
                        >+</Button>
                    </div>
                )}
            </section>
        </div>
    )
}

export default EventsTab
