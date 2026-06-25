import React, { useState } from 'react'
import { Button, Select } from 'antd'
import type {
  IBanvasActions,
  IViewEvents,
  IViewLifetimes,
  ISceneLifetimes,
  IAppLifetimes,
  EventHandler,
  FlowSchema,
} from '@banyuan/banvasgl'
import type { ExtractedFlowSchema } from '@/components/FlowKit/extractSchema'
import { FLOW_SCHEMA_VERSION } from '@banyuan/banvasgl'
import styles from './index.module.scss'

/** 流程编辑器打开请求参数 */
export interface FlowEditorOpenRequest {
  title: string
  initialSchema: ExtractedFlowSchema
  onSave: (schema: ExtractedFlowSchema) => void
}

/** View 模式 Props */
interface ViewEventsTabProps {
  mode: 'view'
  selectedViewId: string
  actions: IBanvasActions
  /** 请求打开流程编辑面板 */
  onOpenFlowEditor?: (request: FlowEditorOpenRequest) => void
}

/** Page 模式 Props */
interface PageEventsTabProps {
  mode: 'page'
  pageId: string
  actions: IBanvasActions
  /** 请求打开流程编辑面板 */
  onOpenFlowEditor?: (request: FlowEditorOpenRequest) => void
}

/** App 模式 Props */
interface AppEventsTabProps {
  mode: 'app'
  actions: IBanvasActions
  /** 请求打开流程编辑面板 */
  onOpenFlowEditor?: (request: FlowEditorOpenRequest) => void
}

export type EventsTabProps = ViewEventsTabProps | PageEventsTabProps | AppEventsTabProps

const VIEW_LIFETIME_ENTRIES: { key: keyof IViewLifetimes; label: string }[] = [
  { key: 'onCreated', label: 'onCreated' },
  { key: 'onAttach', label: 'onAttach' },
  { key: 'onDestroy', label: 'onDestroy' },
]

const PAGE_LIFETIME_ENTRIES: { key: keyof ISceneLifetimes; label: string }[] = [
  { key: 'onLoad', label: 'onLoad' },
  { key: 'onUnload', label: 'onUnload' },
  { key: 'onShow', label: 'onShow' },
  { key: 'onHide', label: 'onHide' },
]

const APP_LIFETIME_ENTRIES: { key: keyof IAppLifetimes; label: string }[] = [
  { key: 'onLaunch', label: 'onLaunch' },
  { key: 'onUnlaunch', label: 'onUnlaunch' },
]

const ALL_EVENT_KEYS: { key: keyof IViewEvents; label: string }[] = [
  // 点击类
  { key: 'onClick', label: 'onClick' },
  { key: 'onDoubleClick', label: 'onDoubleClick' },
  { key: 'onContextMenu', label: 'onContextMenu' },
  // 鼠标移动类
  { key: 'onMouseEnter', label: 'onMouseEnter' },
  { key: 'onMouseLeave', label: 'onMouseLeave' },
  { key: 'onMouseMove', label: 'onMouseMove' },
  { key: 'onMouseDown', label: 'onMouseDown' },
  { key: 'onMouseUp', label: 'onMouseUp' },
  // 拖拽类
  { key: 'onDragStart', label: 'onDragStart' },
  { key: 'onDrag', label: 'onDrag' },
  { key: 'onDragEnd', label: 'onDragEnd' },
  // 焦点类
  { key: 'onFocus', label: 'onFocus' },
  { key: 'onBlur', label: 'onBlur' },
]

function handlerPreview(handler: EventHandler): string {
  if (handler === null) return ''
  if (typeof handler === 'string') return handler || '(空)'
  if (typeof handler === 'function') return '(函数)'
  const schema = handler as FlowSchema
  const nodeCount = Object.keys(schema.nodes ?? {}).length
  if (nodeCount === 0) return '(空流程)'
  return `${nodeCount} 节点`
}

function toFlowSchema(handler: EventHandler): ExtractedFlowSchema {
  if (!handler || typeof handler === 'string' || typeof handler === 'function') {
    return { version: FLOW_SCHEMA_VERSION, entry: '', nodes: {}, layout: {} }
  }
  const schema = handler as FlowSchema
  return {
    version: schema.version || FLOW_SCHEMA_VERSION,
    entry: schema.entry || '',
    nodes: schema.nodes ?? {},
    layout: {},
  }
}

interface EventRowItemProps {
  label: string
  handler: EventHandler
  onDelete: () => void
  onEdit: () => void
}

const EventRowItem: React.FC<EventRowItemProps> = ({ label, handler, onDelete, onEdit }) => {
  return (
    <div className={styles.eventRow}>
      <span className={styles.eventName}>{label}</span>
      <span className={styles.eventPreview}>{handlerPreview(handler)}</span>
      <Button size="small" type="text" onClick={onEdit} title="编辑流程" className={styles.actionBtn}>
        ✎
      </Button>
      <Button size="small" type="text" danger onClick={onDelete} title="删除" className={styles.deleteBtn}>
        ×
      </Button>
    </div>
  )
}

interface LifetimeRowItemProps {
  label: string
  handler: EventHandler
  onDelete?: () => void
  onEdit: () => void
}

const LifetimeRowItem: React.FC<LifetimeRowItemProps> = ({ label, handler, onDelete, onEdit }) => {
  const hasBound = handler !== null

  return (
    <div className={styles.eventRow}>
      <span className={styles.eventName}>{label}</span>
      <span className={styles.eventPreview}>{handlerPreview(handler)}</span>
      <Button size="small" type="text" onClick={onEdit} title="编辑流程" className={styles.actionBtn}>
        ✎
      </Button>
      {hasBound && onDelete && (
        <Button size="small" type="text" danger onClick={onDelete} title="清除" className={styles.deleteBtn}>
          ×
        </Button>
      )}
    </div>
  )
}

export const EventsTab: React.FC<EventsTabProps> = (props) => {
  const { actions, onOpenFlowEditor } = props
  const [isAddingEvent, setIsAddingEvent] = useState(false)
  const [newEventKey, setNewEventKey] = useState<keyof IViewEvents | ''>('')

  const openEditor = (
    title: string,
    initialSchema: ExtractedFlowSchema,
    onSave: (s: ExtractedFlowSchema) => void,
  ) => {
    onOpenFlowEditor?.({ title, initialSchema, onSave })
  }

  // ── App 模式 ──
  if (props.mode === 'app') {
    const lifetimes = actions.app.getAppLifetimes()

    return (
      <div className={styles.content}>
        <section className={styles.section}>
          <div className={styles.sectionHeader}>生命周期</div>
          {APP_LIFETIME_ENTRIES.map(({ key, label }) => (
            <LifetimeRowItem
              key={key}
              label={label}
              handler={lifetimes[key] ?? null}
              onDelete={() => actions.app.deleteAppLifetime(key)}
              onEdit={() =>
                openEditor(label, toFlowSchema(lifetimes[key] ?? null), (schema) =>
                  actions.app.setAppLifetime(key, schema),
                )
              }
            />
          ))}
        </section>
      </div>
    )
  }

  // ── Page 模式 ──
  if (props.mode === 'page') {
    const lifetimes = actions.page.getPageLifetimes(props.pageId)

    return (
      <div className={styles.content}>
        <section className={styles.section}>
          <div className={styles.sectionHeader}>生命周期</div>
          {PAGE_LIFETIME_ENTRIES.map(({ key, label }) => (
            <LifetimeRowItem
              key={key}
              label={label}
              handler={lifetimes[key]}
              onDelete={() => actions.page.deletePageLifetime(props.pageId, key)}
              onEdit={() =>
                openEditor(label, toFlowSchema(lifetimes[key]), (schema) =>
                  actions.page.setPageLifetime(props.pageId, key, schema),
                )
              }
            />
          ))}
        </section>
      </div>
    )
  }

  // ── View 模式 ──
  const { selectedViewId } = props
  const lifetimes = actions.view.getViewLifetimes(selectedViewId)
  const events = actions.view.getViewEvents(selectedViewId)

  const boundEventKeys = ALL_EVENT_KEYS.filter(({ key }) => events[key] !== null)
  const unboundEventKeys = ALL_EVENT_KEYS.filter(({ key }) => events[key] === null)

  // 将已绑定事件按类别分组
  const eventCategories: { label: string; keys: { key: keyof IViewEvents; label: string }[] }[] = [
    {
      label: '点击',
      keys: boundEventKeys.filter((e) => ['onClick', 'onDoubleClick', 'onContextMenu'].includes(e.key)),
    },
    {
      label: '鼠标',
      keys: boundEventKeys.filter((e) =>
        ['onMouseEnter', 'onMouseLeave', 'onMouseMove', 'onMouseDown', 'onMouseUp'].includes(e.key),
      ),
    },
    {
      label: '拖拽',
      keys: boundEventKeys.filter((e) => ['onDragStart', 'onDrag', 'onDragEnd'].includes(e.key)),
    },
    { label: '焦点', keys: boundEventKeys.filter((e) => ['onFocus', 'onBlur'].includes(e.key)) },
  ].filter((cat) => cat.keys.length > 0)

  const handleConfirmAddEvent = () => {
    if (!newEventKey) return
    actions.view.setViewEvent(selectedViewId, newEventKey, {
      version: FLOW_SCHEMA_VERSION,
      entry: '',
      nodes: {},
    })
    setNewEventKey('')
    setIsAddingEvent(false)
  }

  const handleCancelAddEvent = () => {
    setNewEventKey('')
    setIsAddingEvent(false)
  }

  return (
    <div className={styles.content}>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>生命周期</div>
        {VIEW_LIFETIME_ENTRIES.map(({ key, label }) => (
          <LifetimeRowItem
            key={key}
            label={label}
            handler={lifetimes[key]}
            onDelete={() => actions.view.deleteViewLifetime(selectedViewId, key)}
            onEdit={() =>
              openEditor(label, toFlowSchema(lifetimes[key]), (schema) =>
                actions.view.setViewLifetime(selectedViewId, key, schema),
              )
            }
          />
        ))}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>交互事件</div>
        {boundEventKeys.length === 0 ? (
          <div className={styles.emptyFields}>暂无事件</div>
        ) : (
          eventCategories.map((cat) => (
            <div key={cat.label} className={styles.eventCategory}>
              <div className={styles.categoryLabel}>{cat.label}</div>
              {cat.keys.map(({ key, label }) => (
                <EventRowItem
                  key={key}
                  label={label}
                  handler={events[key]}
                  onDelete={() => actions.view.deleteViewEvent(selectedViewId, key)}
                  onEdit={() =>
                    openEditor(label, toFlowSchema(events[key]), (schema) =>
                      actions.view.setViewEvent(selectedViewId, key, schema),
                    )
                  }
                />
              ))}
            </div>
          ))
        )}
        {unboundEventKeys.length > 0 && !isAddingEvent && (
          <button className={styles.addEventBtn} onClick={() => setIsAddingEvent(true)}>
            <span>+</span> 添加事件
          </button>
        )}
        {isAddingEvent && (
          <div className={styles.addEventRow}>
            <Select
              size="small"
              value={newEventKey || undefined}
              placeholder="选择事件类型..."
              options={unboundEventKeys.map(({ key, label }) => ({ value: key, label }))}
              onChange={(val) => setNewEventKey(val as keyof IViewEvents)}
              style={{ flex: 1 }}
              autoFocus
            />
            <Button
              size="small"
              type="primary"
              onClick={handleConfirmAddEvent}
              disabled={!newEventKey}
              style={{ padding: '0 8px' }}
            >
              确定
            </Button>
            <Button size="small" onClick={handleCancelAddEvent} style={{ padding: '0 8px' }}>
              取消
            </Button>
          </div>
        )}
      </section>
    </div>
  )
}

export default EventsTab
