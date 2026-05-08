import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Tabs, Tooltip } from 'antd'
import type { IBanvasActions, IPageNode, IFieldSchema, IFieldSchemaMap } from 'banvasgl'
import { GRAPHTYPE } from 'banvasgl'
import styles from './index.module.scss'

interface PropertyPanelProps {
    selectedViewId: string
    actions: IBanvasActions
    pages: IPageNode[]
    currentPageId: string | null
}

// ── 工具函数 ──

const radiansToDegrees = (rad: number) => rad * (180 / Math.PI)
const degreesToRadians = (deg: number) => deg * (Math.PI / 180)

function formatNumber(value: number, precision: number = 2): string {
    return parseFloat(value.toFixed(precision)).toString()
}

// ── 数值输入组件 ──

interface NumberInputProps {
    label: string
    value: number
    onChange: (value: number) => void
    onFocus: () => void
    onBlur: () => void
    precision?: number
    step?: number
    min?: number
    max?: number
    suffix?: string
    disabled?: boolean
}

const NumberInput: React.FC<NumberInputProps> = ({
    label,
    value,
    onChange,
    onFocus,
    onBlur,
    precision = 2,
    step = 1,
    min,
    max,
    suffix,
    disabled = false,
}) => {
    const [localValue, setLocalValue] = useState(formatNumber(value, precision))
    const [isFocused, setIsFocused] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (!isFocused) {
            setLocalValue(formatNumber(value, precision))
        }
    }, [value, precision, isFocused])

    const commitValue = useCallback(() => {
        const parsed = parseFloat(localValue)
        if (isNaN(parsed)) {
            setLocalValue(formatNumber(value, precision))
            return
        }
        let clamped = parsed
        if (min !== undefined) clamped = Math.max(min, clamped)
        if (max !== undefined) clamped = Math.min(max, clamped)
        if (clamped !== value) {
            onChange(clamped)
        }
        setLocalValue(formatNumber(clamped, precision))
    }, [localValue, value, onChange, precision, min, max])

    const handleFocus = () => {
        setIsFocused(true)
        onFocus()
        setTimeout(() => inputRef.current?.select(), 0)
    }

    const handleBlur = () => {
        setIsFocused(false)
        commitValue()
        onBlur()
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            commitValue()
            inputRef.current?.blur()
        } else if (e.key === 'Escape') {
            setLocalValue(formatNumber(value, precision))
            inputRef.current?.blur()
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            const newVal = value + step
            onChange(max !== undefined ? Math.min(max, newVal) : newVal)
        } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            const newVal = value - step
            onChange(min !== undefined ? Math.max(min, newVal) : newVal)
        }
    }

    return (
        <div className={styles.numberInput}>
            <label className={styles.inputLabel}>{label}</label>
            <div className={styles.inputWrapper}>
                <input
                    ref={inputRef}
                    type="text"
                    value={localValue}
                    onChange={(e) => setLocalValue(e.target.value)}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    disabled={disabled}
                    className={styles.input}
                />
                {suffix && <span className={styles.inputSuffix}>{suffix}</span>}
            </div>
        </div>
    )
}

// ── 字段类型选项 ──

const FIELD_TYPE_OPTIONS: IFieldSchema['type'][] = ['string', 'number', 'boolean', 'object']

// ── 单行字段展示组件 ──

interface FieldRowProps {
    fieldKey: string
    schema: IFieldSchema
    onUpdate: (key: string, schema: IFieldSchema) => void
    onDelete: (key: string) => void
}

const FieldRow: React.FC<FieldRowProps> = ({ fieldKey, schema, onUpdate, onDelete }) => {
    const [editingDefault, setEditingDefault] = useState(
        schema.type === 'object'
            ? JSON.stringify(schema.default ?? null)
            : String(schema.default ?? '')
    )
    const [isFocused, setIsFocused] = useState(false)

    // 外部 schema 变化时同步（未聚焦时）
    useEffect(() => {
        if (!isFocused) {
            setEditingDefault(
                schema.type === 'object'
                    ? JSON.stringify(schema.default ?? null)
                    : String(schema.default ?? '')
            )
        }
    }, [schema, isFocused])

    const handleTypeChange = (newType: IFieldSchema['type']) => {
        // 切换类型时重置 default 为对应类型的零值
        const defaultMap: Record<IFieldSchema['type'], any> = {
            string: '',
            number: 0,
            boolean: false,
            object: null,
        }
        onUpdate(fieldKey, { type: newType, default: defaultMap[newType] })
    }

    const commitDefault = () => {
        let parsed: any = editingDefault
        if (schema.type === 'number') {
            const n = parseFloat(editingDefault)
            parsed = isNaN(n) ? 0 : n
        } else if (schema.type === 'boolean') {
            parsed = editingDefault === 'true'
        } else if (schema.type === 'object') {
            try { parsed = JSON.parse(editingDefault) } catch { parsed = null }
        }
        onUpdate(fieldKey, { ...schema, default: parsed })
    }

    return (
        <div className={styles.fieldRow}>
            <span className={styles.fieldKey} title={fieldKey}>{fieldKey}</span>
            <select
                className={styles.fieldTypeSelect}
                value={schema.type}
                onChange={(e) => handleTypeChange(e.target.value as IFieldSchema['type'])}
            >
                {FIELD_TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                ))}
            </select>
            <input
                className={styles.fieldDefaultInput}
                value={editingDefault}
                placeholder="默认值"
                onFocus={() => setIsFocused(true)}
                onBlur={() => { setIsFocused(false); commitDefault() }}
                onChange={(e) => setEditingDefault(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') { commitDefault(); (e.target as HTMLInputElement).blur() }
                }}
            />
            <button
                className={styles.fieldDeleteBtn}
                onClick={() => onDelete(fieldKey)}
                title="删除字段"
            >×</button>
        </div>
    )
}

// ── 新增字段行 ──

interface AddFieldRowProps {
    onAdd: (key: string, schema: IFieldSchema) => void
}

const AddFieldRow: React.FC<AddFieldRowProps> = ({ onAdd }) => {
    const [key, setKey] = useState('')
    const [type, setType] = useState<IFieldSchema['type']>('string')

    const handleAdd = () => {
        const trimmed = key.trim()
        if (!trimmed) return
        const defaultMap: Record<IFieldSchema['type'], any> = {
            string: '',
            number: 0,
            boolean: false,
            object: null,
        }
        onAdd(trimmed, { type, default: defaultMap[type] })
        setKey('')
        setType('string')
    }

    return (
        <div className={styles.addFieldRow}>
            <input
                className={styles.addFieldKeyInput}
                value={key}
                placeholder="字段名"
                onChange={(e) => setKey(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
            />
            <select
                className={styles.fieldTypeSelect}
                value={type}
                onChange={(e) => setType(e.target.value as IFieldSchema['type'])}
            >
                {FIELD_TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                ))}
            </select>
            <button
                className={styles.addFieldBtn}
                onClick={handleAdd}
                disabled={!key.trim()}
            >+</button>
        </div>
    )
}

// ── 字段定义表展示组件（data 或 properties 通用） ──

interface FieldSchemaMapEditorProps {
    title: string
    schemaMap: IFieldSchemaMap
    onUpdate: (key: string, schema: IFieldSchema) => void
    onDelete: (key: string) => void
    onAdd: (key: string, schema: IFieldSchema) => void
}

const FieldSchemaMapEditor: React.FC<FieldSchemaMapEditorProps> = ({
    title,
    schemaMap,
    onUpdate,
    onDelete,
    onAdd,
}) => {
    const entries = Object.entries(schemaMap)

    return (
        <section className={styles.section}>
            <div className={styles.sectionHeader}>{title}</div>
            {entries.length === 0 && (
                <div className={styles.emptyFields}>暂无字段</div>
            )}
            {entries.map(([key, schema]) => (
                <FieldRow
                    key={key}
                    fieldKey={key}
                    schema={schema}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                />
            ))}
            <AddFieldRow onAdd={onAdd} />
        </section>
    )
}

// ── 主面板组件 ──

const PropertyPanel: React.FC<PropertyPanelProps> = ({
    selectedViewId,
    actions,
    pages,
    currentPageId,
}) => {
    const view = selectedViewId ? actions.view.getViewInstance(selectedViewId) : null

    const isEditingRef = useRef(false)

    const handleFocus = useCallback(() => {
        if (!isEditingRef.current) {
            actions.view.beginPropertyEdit()
            isEditingRef.current = true
        }
    }, [actions])

    const handleBlur = useCallback(() => {
        if (isEditingRef.current) {
            actions.view.commitPropertyEdit()
            isEditingRef.current = false
        }
    }, [actions])

    // ── 无选中时：展示当前页面数据面板 ──
    if (!view) {
        const currentPage = pages.find((p) => p.id === currentPageId) ?? null
        const pageData = currentPage ? currentPage.data : {}

        const pageDataTab = (
            <div className={styles.tabContent}>
                <FieldSchemaMapEditor
                    title="页面数据 (data)"
                    schemaMap={pageData}
                    onUpdate={(key, schema) => {
                        if (currentPageId) actions.page.setPageData(currentPageId, key, schema)
                    }}
                    onDelete={(key) => {
                        if (currentPageId) actions.page.deletePageData(currentPageId, key)
                    }}
                    onAdd={(key, schema) => {
                        if (currentPageId) actions.page.setPageData(currentPageId, key, schema)
                    }}
                />
            </div>
        )

        return (
            <div className={styles.panel}>
                <Tabs
                    items={[{ key: 'data', label: '数据', children: pageDataTab }]}
                    size="small"
                    className={styles.tabs}
                    defaultActiveKey="data"
                />
            </div>
        )
    }

    // ── 有选中时：读取属性 ──
    const x = actions.view.getProperty(selectedViewId, 'x') ?? 0
    const y = actions.view.getProperty(selectedViewId, 'y') ?? 0
    const rotation = actions.view.getProperty(selectedViewId, 'rotation') ?? 0
    const rotationDeg = radiansToDegrees(rotation)
    const width = view.viewport.width
    const height = view.viewport.height

    const content = view.content as any
    const isRoundedRect = content && content.type === GRAPHTYPE.ROUNDED_RECT
    const radii: [number, number, number, number] = isRoundedRect ? content.radii : [0, 0, 0, 0]

    // 读取 data / properties（从 actions 获取，保证响应式）
    const viewData = actions.view.getViewData(selectedViewId)
    const viewProperties = actions.view.getViewProperties(selectedViewId)

    // Tab 1: 属性（基础信息 + 变换 + 状态）
    const propertiesTab = (
        <div className={styles.tabContent}>
            {/* 基础信息 */}
            <section className={styles.section}>
                <div className={styles.sectionHeader}>基础信息</div>
                <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>类型</span>
                    <span className={styles.infoValue}>{view.type}</span>
                </div>
                <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>ID</span>
                    <Tooltip title={view.id}>
                        <span
                            className={styles.infoValueId}
                            onClick={() => navigator.clipboard?.writeText(view.id)}
                        >
                            {view.id}
                        </span>
                    </Tooltip>
                </div>
                <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>名称</span>
                    <input
                        className={styles.nameInput}
                        value={view.name}
                        onChange={(e) => actions.view.rename(selectedViewId, e.target.value)}
                    />
                </div>
            </section>

            {/* 变换 */}
            <section className={styles.section}>
                <div className={styles.sectionHeader}>变换</div>
                <div className={styles.transformGrid}>
                    <NumberInput
                        label="X"
                        value={x}
                        onChange={(v) => actions.view.setProperty('x', v)}
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                        suffix="px"
                    />
                    <NumberInput
                        label="Y"
                        value={y}
                        onChange={(v) => actions.view.setProperty('y', v)}
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                        suffix="px"
                    />
                    <NumberInput
                        label="W"
                        value={width}
                        onChange={(v) => actions.view.setProperty('width', v)}
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                        min={1}
                        suffix="px"
                    />
                    <NumberInput
                        label="H"
                        value={height}
                        onChange={(v) => actions.view.setProperty('height', v)}
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                        min={1}
                        suffix="px"
                    />
                    <NumberInput
                        label="旋转"
                        value={rotationDeg}
                        onChange={(v) => actions.view.setProperty('rotation', degreesToRadians(v))}
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                        step={1}
                        suffix="°"
                    />
                    <NumberInput
                        label="弧度"
                        value={rotation}
                        onChange={(v) => actions.view.setProperty('rotation', v)}
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                        step={0.01}
                        precision={4}
                        suffix="rad"
                    />
                </div>
            </section>

            {/* 状态 */}
            <section className={styles.section}>
                <div className={styles.sectionHeader}>状态</div>
                <div className={styles.stateRow}>
                    <label className={styles.stateLabel}>
                        <input
                            type="checkbox"
                            checked={view.visible}
                            onChange={(e) => actions.view.setVisible(selectedViewId, e.target.checked)}
                        />
                        可见
                    </label>
                    <label className={styles.stateLabel}>
                        <input
                            type="checkbox"
                            checked={view.freezed}
                            onChange={(e) => actions.view.setLocked(selectedViewId, e.target.checked)}
                        />
                        锁定
                    </label>
                </div>
            </section>

            {/* 圆角半径（仅圆角矩形显示） */}
            {isRoundedRect && (
                <section className={styles.section}>
                    <div className={styles.sectionHeader}>圆角</div>
                    <div className={styles.radiiControls}>
                        <div className={styles.radiiUniform}>
                            <NumberInput
                                label="统一圆角"
                                value={radii[0]}
                                onChange={(v) => {
                                    actions.view.setContentMethod('setAllRadii', [v])
                                }}
                                onFocus={handleFocus}
                                onBlur={handleBlur}
                                min={0}
                                step={1}
                                precision={1}
                                suffix="px"
                            />
                        </div>
                        <div className={styles.transformGrid}>
                            <NumberInput
                                label="左上"
                                value={radii[0]}
                                onChange={(v) => {
                                    actions.view.setContentMethod('setRadius', [0, v])
                                }}
                                onFocus={handleFocus}
                                onBlur={handleBlur}
                                min={0}
                                step={1}
                                precision={1}
                                suffix="px"
                            />
                            <NumberInput
                                label="右上"
                                value={radii[1]}
                                onChange={(v) => {
                                    actions.view.setContentMethod('setRadius', [1, v])
                                }}
                                onFocus={handleFocus}
                                onBlur={handleBlur}
                                min={0}
                                step={1}
                                precision={1}
                                suffix="px"
                            />
                            <NumberInput
                                label="右下"
                                value={radii[2]}
                                onChange={(v) => {
                                    actions.view.setContentMethod('setRadius', [2, v])
                                }}
                                onFocus={handleFocus}
                                onBlur={handleBlur}
                                min={0}
                                step={1}
                                precision={1}
                                suffix="px"
                            />
                            <NumberInput
                                label="左下"
                                value={radii[3]}
                                onChange={(v) => {
                                    actions.view.setContentMethod('setRadius', [3, v])
                                }}
                                onFocus={handleFocus}
                                onBlur={handleBlur}
                                min={0}
                                step={1}
                                precision={1}
                                suffix="px"
                            />
                        </div>
                    </div>
                </section>
            )}
        </div>
    )

    // Tab 2: 样式
    const styleTab = (
        <div className={styles.tabContent}>
            <section className={styles.section}>
                <div className={styles.sectionHeader}>样式</div>
                <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>overflow</span>
                    <select
                        className={styles.selectInput}
                        value={view.style?.overflow ?? 'visible'}
                        onChange={(e) => {
                            if (view.style) {
                                view.style.overflow = e.target.value as 'visible' | 'hidden' | 'scroll'
                            }
                        }}
                    >
                        <option value="visible">visible</option>
                        <option value="hidden">hidden</option>
                        <option value="scroll">scroll</option>
                    </select>
                </div>
            </section>
        </div>
    )

    // Tab 3: 数据（data + properties 字段定义）
    const dataTab = (
        <div className={styles.tabContent}>
            <FieldSchemaMapEditor
                title="数据 (data)"
                schemaMap={viewData}
                onUpdate={(key, schema) => actions.view.setViewData(selectedViewId, key, schema)}
                onDelete={(key) => actions.view.deleteViewData(selectedViewId, key)}
                onAdd={(key, schema) => actions.view.setViewData(selectedViewId, key, schema)}
            />
            <FieldSchemaMapEditor
                title="属性 (properties)"
                schemaMap={viewProperties}
                onUpdate={(key, schema) => actions.view.setViewProperty(selectedViewId, key, schema)}
                onDelete={(key) => actions.view.deleteViewProperty(selectedViewId, key)}
                onAdd={(key, schema) => actions.view.setViewProperty(selectedViewId, key, schema)}
            />
        </div>
    )

    const tabItems = [
        { key: 'properties', label: '属性', children: propertiesTab },
        { key: 'style', label: '样式', children: styleTab },
        { key: 'data', label: '数据', children: dataTab },
    ]

    return (
        <div className={styles.panel}>
            <Tabs
                items={tabItems}
                size="small"
                className={styles.tabs}
                defaultActiveKey="properties"
            />
        </div>
    )
}

export default PropertyPanel
