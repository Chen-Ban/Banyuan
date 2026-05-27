import React, { useRef, useState } from 'react'
import { Button, Input, Select } from 'antd'
import type { IFieldSchema, IFieldSchemaMap } from '@banyuan/banvasgl'

// ── 内联样式 ──

const sectionStyle: React.CSSProperties = {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottom: '1px solid rgba(255,255,255,0.07)',
}

const sectionHeaderStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.35)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
}

const emptyFieldsStyle: React.CSSProperties = {
    fontSize: 11,
    color: 'rgba(255,255,255,0.22)',
    padding: '4px 0 8px',
}

const fieldRowStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 68px 1fr 20px',
    gap: 4,
    alignItems: 'flex-start',
    marginBottom: 2,
}

const fieldKeyCellStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
}

const fieldKeyErrorStyle: React.CSSProperties = {
    fontSize: 10,
    color: '#e74c3c',
    lineHeight: '1.2',
    paddingLeft: 2,
}

const objectPlaceholderStyle: React.CSSProperties = {
    fontSize: 10,
    color: 'rgba(255,255,255,0.25)',
    display: 'flex',
    alignItems: 'center',
    height: 24,
    paddingLeft: 2,
}

const deleteBtnStyle: React.CSSProperties = {
    width: 20,
    height: 24,
    padding: 0,
    border: 'none',
    background: 'transparent',
    color: 'rgba(255,255,255,0.25)',
    fontSize: 14,
    lineHeight: 1,
    cursor: 'pointer',
    borderRadius: 3,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
}

const nestedFieldsStyle: React.CSSProperties = {
    marginTop: 4,
    marginBottom: 4,
    padding: '6px 8px',
    background: 'rgba(255,255,255,0.03)',
    borderLeft: '2px solid rgba(255,255,255,0.1)',
    borderRadius: '0 4px 4px 0',
}

const addFieldBtnStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    padding: '4px 0',
    width: '100%',
    border: '1px dashed rgba(255,255,255,0.12)',
    borderRadius: 4,
    background: 'transparent',
    color: 'rgba(255,255,255,0.3)',
    fontSize: 14,
    lineHeight: 1,
    cursor: 'pointer',
}

// ── 字段类型选项 ──

const FIELD_TYPE_OPTIONS: IFieldSchema['type'][] = ['string', 'number', 'boolean', 'object']

const FIELD_TYPE_SELECT_OPTIONS = FIELD_TYPE_OPTIONS.map((t) => ({ value: t, label: t }))

// ── 默认值输入框（string / number / boolean，object 不显示） ──

interface DefaultValueInputProps {
    schema: IFieldSchema
    onChange: (val: unknown) => void
}

const DefaultValueInput: React.FC<DefaultValueInputProps> = ({ schema, onChange }) => {
    const [text, setText] = useState(
        schema.default === undefined || schema.default === null ? '' : String(schema.default)
    )
    const [focused, setFocused] = useState(false)

    // 外部 schema 变化时同步（未聚焦时）
    const prevSchema = useRef(schema)
    if (!focused && prevSchema.current !== schema) {
        prevSchema.current = schema
        const next =
            schema.default === undefined || schema.default === null ? '' : String(schema.default)
        if (next !== text) setText(next)
    }

    const commit = (raw: string) => {
        if (schema.type === 'number') {
            const n = parseFloat(raw)
            onChange(isNaN(n) ? undefined : n)
        } else if (schema.type === 'boolean') {
            if (raw === 'true') onChange(true)
            else if (raw === 'false') onChange(false)
            else onChange(undefined)
        } else {
            onChange(raw === '' ? undefined : raw)
        }
    }

    if (schema.type === 'boolean') {
        return (
            <Select
                size="small"
                value={
                    schema.default === true
                        ? 'true'
                        : schema.default === false
                          ? 'false'
                          : undefined
                }
                placeholder="默认值"
                allowClear
                options={[
                    { value: 'true', label: 'true' },
                    { value: 'false', label: 'false' },
                ]}
                onChange={(val) => onChange(val === 'true' ? true : val === 'false' ? false : undefined)}
                style={{ width: '100%' }}
            />
        )
    }

    return (
        <Input
            size="small"
            value={text}
            placeholder="默认值"
            onFocus={() => setFocused(true)}
            onBlur={() => {
                setFocused(false)
                commit(text)
            }}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
                if (e.key === 'Enter') {
                    commit(text);
                    (e.target as HTMLInputElement).blur()
                }
            }}
        />
    )
}

// ── 单行字段组件（支持行内编辑字段名、类型、默认值，object 展开嵌套） ──

interface FieldRowProps {
    fieldKey: string
    schema: IFieldSchema
    siblingKeys: string[]
    depth: number
    onUpdate: (key: string, schema: IFieldSchema) => void
    onRename: (oldKey: string, newKey: string) => void
    onDelete: (key: string) => void
}

const FieldRow: React.FC<FieldRowProps> = ({
    fieldKey,
    schema,
    siblingKeys,
    depth,
    onUpdate,
    onRename,
    onDelete,
}) => {
    const [editingKey, setEditingKey] = useState(fieldKey)
    const [keyError, setKeyError] = useState<string | null>(null)
    const [keyFocused, setKeyFocused] = useState(false)

    // 外部 fieldKey 变化时同步（未聚焦时）
    if (!keyFocused && editingKey !== fieldKey) {
        setEditingKey(fieldKey)
        setKeyError(null)
    }

    const commitKey = () => {
        const trimmed = editingKey.trim()
        if (trimmed === fieldKey) {
            setKeyError(null)
            return
        }
        if (!trimmed) {
            setEditingKey(fieldKey)
            setKeyError(null)
            return
        }
        if (siblingKeys.includes(trimmed)) {
            setKeyError(`"${trimmed}" 已存在`)
            return
        }
        setKeyError(null)
        onRename(fieldKey, trimmed)
    }

    const handleTypeChange = (newType: IFieldSchema['type']) => {
        const defaultMap: Record<IFieldSchema['type'], IFieldSchema['default']> = {
            string: '' as string,
            number: 0 as number,
            boolean: false as boolean,
            object: {},
        }
        onUpdate(fieldKey, { type: newType, default: defaultMap[newType] })
    }

    const isObject = schema.type === 'object'
    const objectDefault = (schema.default ?? {}) as IFieldSchemaMap

    // object 子字段的增删改
    const handleChildUpdate = (childKey: string, childSchema: IFieldSchema) => {
        const next = { ...objectDefault, [childKey]: childSchema }
        onUpdate(fieldKey, { ...schema, default: next })
    }
    const handleChildRename = (oldKey: string, newKey: string) => {
        const entries = Object.entries(objectDefault)
        const next: IFieldSchemaMap = {}
        for (const [k, v] of entries) {
            next[k === oldKey ? newKey : k] = v
        }
        onUpdate(fieldKey, { ...schema, default: next })
    }
    const handleChildDelete = (childKey: string) => {
        const next = { ...objectDefault }
        delete next[childKey]
        onUpdate(fieldKey, { ...schema, default: next })
    }
    const handleChildAdd = () => {
        const existingKeys = Object.keys(objectDefault)
        let n = existingKeys.length + 1
        let newKey = `field_${n}`
        while (existingKeys.includes(newKey)) newKey = `field_${++n}`
        const next = { ...objectDefault, [newKey]: { type: 'string' as const, default: '' } }
        onUpdate(fieldKey, { ...schema, default: next })
    }

    const wrapperStyle: React.CSSProperties = {
        marginBottom: 2,
        paddingLeft: depth * 10,
    }

    return (
        <div style={wrapperStyle}>
            <div style={fieldRowStyle}>
                {/* 字段名 */}
                <div style={fieldKeyCellStyle}>
                    <Input
                        size="small"
                        value={editingKey}
                        placeholder="字段名"
                        status={keyError ? 'error' : undefined}
                        title={keyError ?? undefined}
                        onFocus={() => setKeyFocused(true)}
                        onBlur={() => {
                            setKeyFocused(false)
                            commitKey()
                        }}
                        onChange={(e) => {
                            setEditingKey(e.target.value)
                            setKeyError(null)
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                commitKey();
                                (e.target as HTMLInputElement).blur()
                            }
                            if (e.key === 'Escape') {
                                setEditingKey(fieldKey)
                                setKeyError(null);
                                (e.target as HTMLInputElement).blur()
                            }
                        }}
                    />
                    {keyError && (
                        <div style={fieldKeyErrorStyle}>{keyError}</div>
                    )}
                </div>

                {/* 类型 */}
                <Select
                    size="small"
                    value={schema.type}
                    placeholder="类型"
                    options={FIELD_TYPE_SELECT_OPTIONS}
                    onChange={handleTypeChange}
                    style={{ width: '100%' }}
                />

                {/* 默认值（object 不显示） */}
                {!isObject ? (
                    <DefaultValueInput
                        schema={schema}
                        onChange={(val) => onUpdate(fieldKey, { ...schema, default: val as IFieldSchema['default'] })}
                    />
                ) : (
                    <div style={objectPlaceholderStyle}>嵌套对象</div>
                )}

                {/* 删除 */}
                <button
                    style={deleteBtnStyle}
                    onClick={() => onDelete(fieldKey)}
                    title="删除字段"
                >
                    ×
                </button>
            </div>

            {/* object 展开：嵌套子字段列表 */}
            {isObject && (
                <div style={nestedFieldsStyle}>
                    <FieldSchemaMapEditor
                        schemaMap={objectDefault}
                        depth={depth + 1}
                        onUpdate={handleChildUpdate}
                        onRename={handleChildRename}
                        onDelete={handleChildDelete}
                        onAdd={handleChildAdd}
                    />
                </div>
            )}
        </div>
    )
}

// ── 字段列表编辑器（递归） ──

export interface FieldSchemaMapEditorProps {
    title?: string
    schemaMap: IFieldSchemaMap
    depth?: number
    onUpdate: (key: string, schema: IFieldSchema) => void
    onRename: (oldKey: string, newKey: string) => void
    onDelete: (key: string) => void
    onAdd: () => void
}

export const FieldSchemaMapEditor: React.FC<FieldSchemaMapEditorProps> = ({
    title,
    schemaMap,
    depth = 0,
    onUpdate,
    onRename,
    onDelete,
    onAdd,
}) => {
    const entries = Object.entries(schemaMap)
    const allKeys = entries.map(([k]) => k)

    // 嵌套 section 不要底部分隔线
    const currentSectionStyle = depth > 0
        ? { ...sectionStyle, marginBottom: 0, paddingBottom: 0, borderBottom: 'none' }
        : sectionStyle

    return (
        <section style={currentSectionStyle}>
            {title && <div style={sectionHeaderStyle}>{title}</div>}

            {entries.length === 0 && depth === 0 && (
                <div style={emptyFieldsStyle}>暂无字段</div>
            )}

            {entries.map(([key, schema]) => (
                <FieldRow
                    key={key}
                    fieldKey={key}
                    schema={schema}
                    siblingKeys={allKeys.filter((k) => k !== key)}
                    depth={depth}
                    onUpdate={onUpdate}
                    onRename={onRename}
                    onDelete={onDelete}
                />
            ))}

            <button style={addFieldBtnStyle} onClick={onAdd} title={depth > 0 ? '添加子字段' : '添加字段'}>
                <span>+</span>
            </button>
        </section>
    )
}

export default FieldSchemaMapEditor
