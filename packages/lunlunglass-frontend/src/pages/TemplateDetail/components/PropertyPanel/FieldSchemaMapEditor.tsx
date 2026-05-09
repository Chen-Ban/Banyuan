import React, { useEffect, useState } from 'react'
import type { IFieldSchema, IFieldSchemaMap } from 'banvasgl'
import styles from './index.module.scss'

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

export interface FieldSchemaMapEditorProps {
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

export default FieldSchemaMapEditor
