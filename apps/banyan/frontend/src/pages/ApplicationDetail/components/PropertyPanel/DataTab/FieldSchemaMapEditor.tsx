import React, { useRef, useState } from 'react'
import { Button, Input, Select } from 'antd'
import type { IFieldSchema, IFieldSchemaMap } from '@banyuan/banyan-sdk'
import styles from '../index.module.scss'

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
    siblingKeys: string[]          // 用于重名校验
    depth: number
    onUpdate: (key: string, schema: IFieldSchema) => void
    onRename: (oldKey: string, newKey: string) => void  // 字段名变更
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
        const defaultMap: Record<IFieldSchema['type'], unknown> = {
            string: undefined,
            number: undefined,
            boolean: undefined,
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
        const next = { ...objectDefault, [newKey]: { type: 'string' as const, default: undefined } }
        onUpdate(fieldKey, { ...schema, default: next })
    }

    return (
        <div className={styles.fieldRowWrapper} style={{ '--depth': depth } as React.CSSProperties}>
            <div className={styles.fieldRow}>
                {/* 字段名 */}
                <div className={styles.fieldKeyCell}>
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
                        <div className={styles.fieldKeyError}>{keyError}</div>
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
                        onChange={(val) => onUpdate(fieldKey, { ...schema, default: val })}
                    />
                ) : (
                    <div className={styles.objectPlaceholder}>嵌套对象</div>
                )}

                {/* 删除 */}
                <button
                    className={styles.deleteBtn}
                    onClick={() => onDelete(fieldKey)}
                    title="删除字段"
                >
                    ×
                </button>
            </div>

            {/* object 展开：嵌套子字段列表 */}
            {isObject && (
                <div className={styles.nestedFields}>
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

const FieldSchemaMapEditor: React.FC<FieldSchemaMapEditorProps> = ({
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

    return (
        <section className={styles.section}>
            {title && <div className={styles.sectionHeader}>{title}</div>}

            {entries.length === 0 && depth === 0 && (
                <div className={styles.emptyFields}>暂无字段</div>
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

            <button className={styles.addFieldBtn} onClick={onAdd} title={depth > 0 ? '添加子字段' : '添加字段'}>
                <span className={styles.addFieldBtnIcon}>+</span>
            </button>
        </section>
    )
}

export default FieldSchemaMapEditor
