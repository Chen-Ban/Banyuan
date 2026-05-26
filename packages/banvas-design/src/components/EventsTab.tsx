import React, { useState } from 'react'
import { Button, Select } from 'antd'
import type { IBanvasActions, IViewEvents, IViewLifetimes, ISceneLifetimes, IAppLifetimes, EventHandler, FlowSchema } from '@banyuan/banvasgl'

// ── 内联样式 ──

const tabContentStyle: React.CSSProperties = { padding: 12 }

const sectionStyle: React.CSSProperties = {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottom: '1px solid #ecf0f1',
}

const sectionHeaderStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: '#7f8c8d',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
}

const eventRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
    minHeight: 26,
}

const eventNameStyle: React.CSSProperties = {
    fontSize: 11,
    fontFamily: "'SF Mono', 'Menlo', monospace",
    color: '#2c3e50',
    flexShrink: 0,
    minWidth: 90,
}

const eventPreviewStyle: React.CSSProperties = {
    flex: 1,
    fontSize: 10,
    color: '#95a5a6',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
}

const emptyFieldsStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#bdc3c7',
    padding: '4px 0 8px',
}

const addEventRowStyle: React.CSSProperties = {
    display: 'flex',
    gap: 4,
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 6,
    borderTop: '1px dashed #ecf0f1',
}

// ── Props ──

/** View 模式 Props */
interface ViewEventsTabProps {
    mode: 'view'
    selectedViewId: string
    actions: IBanvasActions
    /** FlowEditorModal 组件（由外部注入，避免 banvas-design 依赖 flow-design） */
    FlowEditorModal?: React.ComponentType<FlowEditorModalSlotProps>
    appId?: string
}

/** Page 模式 Props */
interface PageEventsTabProps {
    mode: 'page'
    pageId: string
    actions: IBanvasActions
    /** FlowEditorModal 组件（由外部注入，避免 banvas-design 依赖 flow-design） */
    FlowEditorModal?: React.ComponentType<FlowEditorModalSlotProps>
    appId?: string
}

/** App 模式 Props */
interface AppEventsTabProps {
    mode: 'app'
    actions: IBanvasActions
    /** FlowEditorModal 组件（由外部注入，避免 banvas-design 依赖 flow-design） */
    FlowEditorModal?: React.ComponentType<FlowEditorModalSlotProps>
    appId?: string
}

export type EventsTabProps = ViewEventsTabProps | PageEventsTabProps | AppEventsTabProps

/** FlowEditorModal 插槽 Props */
export interface FlowEditorModalSlotProps {
    open: boolean
    title: string
    initialSchema: FlowSchema
    onSave: (schema: FlowSchema) => void
    onClose: () => void
}

// ── View 生命周期钩子名称与描述 ──

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

// App 生命周期钩子名称与描述
const APP_LIFETIME_ENTRIES: { key: keyof IAppLifetimes; label: string }[] = [
    { key: 'onLaunch', label: 'onLaunch' },
    { key: 'onUnlaunch', label: 'onUnlaunch' },
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

function toFlowSchema(handler: EventHandler): FlowSchema {
    if (!handler || typeof handler === 'string' || typeof handler === 'function') {
        return { nodes: [], edges: [] }
    }
    return handler as FlowSchema
}

// ── 弹窗状态 ──

interface ModalState {
    open: boolean
    title: string
    initialSchema: FlowSchema
    onSave: (schema: FlowSchema) => void
}

const CLOSED_MODAL: ModalState = {
    open: false,
    title: '',
    initialSchema: { nodes: [], edges: [] },
    onSave: () => {},
}

// ── 单个事件行 ──

interface EventRowItemProps {
    label: string
    handler: EventHandler
    onDelete: () => void
    onEdit: () => void
}

const EventRowItem: React.FC<EventRowItemProps> = ({ label, handler, onDelete, onEdit }) => {
    return (
        <div style={eventRowStyle}>
            <span style={eventNameStyle}>{label}</span>
            <span style={eventPreviewStyle}>{handlerPreview(handler)}</span>
            <Button
                size="small"
                type="text"
                onClick={onEdit}
                title="编辑流程"
                style={{ padding: '0 4px', minWidth: 20, fontSize: 12 }}
            >✎</Button>
            <Button
                size="small"
                type="text"
                danger
                onClick={onDelete}
                title="删除"
                style={{ padding: '0 4px', minWidth: 20 }}
            >×</Button>
        </div>
    )
}

// ── 单个生命周期行 ──

interface LifetimeRowItemProps {
    label: string
    handler: EventHandler
    onDelete?: () => void
    onEdit: () => void
}

const LifetimeRowItem: React.FC<LifetimeRowItemProps> = ({ label, handler, onDelete, onEdit }) => {
    const hasBound = handler !== null

    return (
        <div style={eventRowStyle}>
            <span style={eventNameStyle}>{label}</span>
            <span style={eventPreviewStyle}>{handlerPreview(handler)}</span>
            <Button
                size="small"
                type="text"
                onClick={onEdit}
                title="编辑流程"
                style={{ padding: '0 4px', minWidth: 20, fontSize: 12 }}
            >✎</Button>
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
    )
}

// ── 主组件 ──

export const EventsTab: React.FC<EventsTabProps> = (props) => {
    const { actions, FlowEditorModal: FlowEditorModalSlot } = props
    const [modal, setModal] = useState<ModalState>(CLOSED_MODAL)
    const [addingEvent, setAddingEvent] = useState<keyof IViewEvents | ''>('')

    const openModal = (title: string, initialSchema: FlowSchema, onSave: (s: FlowSchema) => void) => {
        setModal({ open: true, title, initialSchema, onSave })
    }

    const closeModal = () => setModal(CLOSED_MODAL)

    const handleSave = (schema: FlowSchema) => {
        modal.onSave(schema)
    }

    // ── App 模式：只展示 App 生命周期 ──
    if (props.mode === 'app') {
        const lifetimes = actions.app.getAppLifetimes()

        return (
            <div style={tabContentStyle}>
                <section style={sectionStyle}>
                    <div style={sectionHeaderStyle}>生命周期</div>
                    {APP_LIFETIME_ENTRIES.map(({ key, label }) => (
                        <LifetimeRowItem
                            key={key}
                            label={label}
                            handler={lifetimes[key] ?? null}
                            onDelete={() => actions.app.deleteAppLifetime(key)}
                            onEdit={() =>
                                openModal(
                                    label,
                                    toFlowSchema(lifetimes[key] ?? null),
                                    (schema) => actions.app.setAppLifetime(key, schema),
                                )
                            }
                        />
                    ))}
                </section>

                {FlowEditorModalSlot && (
                    <FlowEditorModalSlot
                        open={modal.open}
                        title={modal.title}
                        initialSchema={modal.initialSchema}
                        onSave={handleSave}
                        onClose={closeModal}
                    />
                )}
            </div>
        )
    }

    // ── Page 模式：只展示 Scene 生命周期 ──
    if (props.mode === 'page') {
        const lifetimes = actions.page.getPageLifetimes(props.pageId)

        return (
            <div style={tabContentStyle}>
                <section style={sectionStyle}>
                    <div style={sectionHeaderStyle}>生命周期</div>
                    {PAGE_LIFETIME_ENTRIES.map(({ key, label }) => (
                        <LifetimeRowItem
                            key={key}
                            label={label}
                            handler={lifetimes[key]}
                            onDelete={() => actions.page.deletePageLifetime(props.pageId, key)}
                            onEdit={() =>
                                openModal(
                                    label,
                                    toFlowSchema(lifetimes[key]),
                                    (schema) => actions.page.setPageLifetime(props.pageId, key, schema),
                                )
                            }
                        />
                    ))}
                </section>

                {FlowEditorModalSlot && (
                    <FlowEditorModalSlot
                        open={modal.open}
                        title={modal.title}
                        initialSchema={modal.initialSchema}
                        onSave={handleSave}
                        onClose={closeModal}
                    />
                )}
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

    const handleAddEvent = () => {
        if (!addingEvent) return
        actions.view.setViewEvent(selectedViewId, addingEvent, { nodes: [], edges: [] })
        setAddingEvent('')
    }

    return (
        <div style={tabContentStyle}>
            {/* 生命周期区域 */}
            <section style={sectionStyle}>
                <div style={sectionHeaderStyle}>生命周期</div>
                {VIEW_LIFETIME_ENTRIES.map(({ key, label }) => (
                    <LifetimeRowItem
                        key={key}
                        label={label}
                        handler={lifetimes[key]}
                        onDelete={() => actions.view.deleteViewLifetime(selectedViewId, key)}
                        onEdit={() =>
                            openModal(
                                label,
                                toFlowSchema(lifetimes[key]),
                                (schema) => actions.view.setViewLifetime(selectedViewId, key, schema),
                            )
                        }
                    />
                ))}
            </section>

            {/* 交互事件区域 */}
            <section style={sectionStyle}>
                <div style={sectionHeaderStyle}>交互事件</div>
                {boundEventKeys.map(({ key, label }) => (
                    <EventRowItem
                        key={key}
                        label={label}
                        handler={events[key]}
                        onDelete={() => actions.view.deleteViewEvent(selectedViewId, key)}
                        onEdit={() =>
                            openModal(
                                label,
                                toFlowSchema(events[key]),
                                (schema) => actions.view.setViewEvent(selectedViewId, key, schema),
                            )
                        }
                    />
                ))}
                {boundEventKeys.length === 0 && (
                    <div style={emptyFieldsStyle}>暂无事件</div>
                )}
                {/* 添加事件 */}
                {unboundEventKeys.length > 0 && (
                    <div style={addEventRowStyle}>
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

            {FlowEditorModalSlot && (
                <FlowEditorModalSlot
                    open={modal.open}
                    title={modal.title}
                    initialSchema={modal.initialSchema}
                    onSave={handleSave}
                    onClose={closeModal}
                />
            )}
        </div>
    )
}

export default EventsTab
