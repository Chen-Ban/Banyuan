import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { App, Button, Input, Select, Checkbox, Popconfirm } from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import { schemaApi } from '@/api'
import type { CollectionDef, FieldDef, FieldType } from '@/api'
import styles from '../index.module.scss'

// ── 常量 ──────────────────────────────────────────────────────────────────────

const FIELD_TYPE_OPTIONS: { value: FieldType; label: string }[] = [
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'date', label: 'Date' },
  { value: 'enum', label: 'Enum' },
  { value: 'ref', label: 'Ref' },
  { value: 'array', label: 'Array' },
  { value: 'object', label: 'Object' },
]

const TYPE_COLOR: Record<FieldType, string> = {
  string: '#1677ff',
  number: '#52c41a',
  boolean: '#fa8c16',
  date: '#722ed1',
  enum: '#eb2f96',
  ref: '#13c2c2',
  array: '#faad14',
  object: '#8c8c8c',
}

// ── FieldEditor ───────────────────────────────────────────────────────────────

export interface FieldEditorProps {
  collection: CollectionDef
  appId: string
  onSaved: (updatedCollection: CollectionDef) => void
  dirty: boolean
  onDirtyChange: (dirty: boolean) => void
}

export interface FieldEditorHandle {
  save: () => Promise<void>
}

const FieldEditor = forwardRef<FieldEditorHandle, FieldEditorProps>(
  ({ collection, appId, onSaved, onDirtyChange }, ref) => {
    const { message } = App.useApp()
    // 本地字段列表（编辑态）
    const [localFields, setLocalFields] = useState<FieldDef[]>(collection.fields)

    // 当外部 collection 变化时同步（例如切换表）
    useEffect(() => {
      setLocalFields(collection.fields)
    }, [collection.fields])

    // 检测 dirty 状态
    useEffect(() => {
      const isDirty = JSON.stringify(localFields) !== JSON.stringify(collection.fields)
      onDirtyChange(isDirty)
    }, [localFields, collection.fields, onDirtyChange])

    // ── 本地操作（不调 API）────────────────────────────────────────────────────

    const handleAddField = () => {
      const newField: FieldDef = {
        name: '',
        displayName: '',
        type: 'string',
        required: false,
      }
      setLocalFields((prev) => [...prev, newField])
    }

    const handleFieldChange = (index: number, patch: Partial<FieldDef>) => {
      setLocalFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)))
    }

    const handleDeleteField = (index: number) => {
      setLocalFields((prev) => prev.filter((_, i) => i !== index))
    }

    // ── 保存（整体提交 API）───────────────────────────────────────────────────

    const handleSave = async () => {
      // 校验：所有字段名必须非空且唯一
      const errors: string[] = []
      const nameSet = new Set<string>()
      localFields.forEach((f, i) => {
        const name = f.name.trim()
        if (!name) {
          errors.push(`第 ${i + 1} 行：字段名不能为空`)
        } else if (nameSet.has(name)) {
          errors.push(`第 ${i + 1} 行：字段名 "${name}" 重复`)
        }
        nameSet.add(name)
      })
      if (errors.length > 0) {
        message.error(errors[0])
        return
      }

      // 规范化字段：trim name/displayName
      const normalizedFields = localFields.map((f) => ({
        ...f,
        name: f.name.trim(),
        displayName: f.displayName.trim() || f.name.trim(),
      }))

      try {
        const res = await schemaApi.updateCollection(appId, collection.name, {
          fields: normalizedFields,
        })
        const updated = res.data
        if (updated) {
          onSaved(updated)
          setLocalFields(updated.fields)
          message.success('保存成功')
        }
      } catch (err: unknown) {
        message.error(err instanceof Error ? err.message : '保存失败')
      }
    }

    // ── 暴露 save 给父组件（供 appEvents.onSaveApp 调用） ──────────────────────
    useImperativeHandle(ref, () => ({ save: handleSave }))

    return (
      <div className={styles.fieldEditor}>
        {/* 字段表格 */}
        <div className={styles.fieldTable}>
          {/* 表头行 */}
          <div className={styles.fieldTableHead}>
            <span className={styles.colFieldName}>字段名</span>
            <span className={styles.colDisplayName}>显示名</span>
            <span className={styles.colType}>类型</span>
            <span className={styles.colRequired}>必填</span>
            <span className={styles.colActions} />
          </div>

          {/* 内置 _id 行（只读提示） */}
          <div className={`${styles.fieldRow} ${styles.fieldRowBuiltin}`}>
            <span className={styles.colFieldName}>
              <span className={styles.fieldNameText}>_id</span>
            </span>
            <span className={styles.colDisplayName}>
              <span className={styles.fieldDisplayText}>ID</span>
            </span>
            <span className={styles.colType}>
              <span className={styles.typeTag} style={{ background: '#f0f0f0', color: '#8c8c8c' }}>
                ObjectId
              </span>
            </span>
            <span className={styles.colRequired}>
              <span className={styles.builtinBadge}>内置</span>
            </span>
            <span className={styles.colActions} />
          </div>

          {/* 用户字段（行内可编辑） */}
          {localFields.map((field, index) => (
            <div key={index} className={styles.fieldRow}>
              <span className={styles.colFieldName}>
                <Input
                  size="small"
                  value={field.name}
                  placeholder="字段名（英文）"
                  onChange={(e) => handleFieldChange(index, { name: e.target.value })}
                  className={styles.fieldInput}
                  status={!field.name.trim() ? 'error' : undefined}
                />
              </span>
              <span className={styles.colDisplayName}>
                <Input
                  size="small"
                  value={field.displayName}
                  placeholder="显示名（可选）"
                  onChange={(e) => handleFieldChange(index, { displayName: e.target.value })}
                  className={styles.fieldInput}
                />
              </span>
              <span className={styles.colType}>
                <Select
                  size="small"
                  value={field.type}
                  options={FIELD_TYPE_OPTIONS}
                  onChange={(val) => handleFieldChange(index, { type: val })}
                  className={styles.typeSelect}
                  labelRender={({ value }) => (
                    <span
                      style={{
                        color: TYPE_COLOR[value as FieldType] ?? '#595959',
                        fontWeight: 500,
                        fontSize: 12,
                      }}
                    >
                      {value as string}
                    </span>
                  )}
                />
              </span>
              <span className={styles.colRequired}>
                <Checkbox
                  checked={field.required}
                  onChange={(e) => handleFieldChange(index, { required: e.target.checked })}
                />
              </span>
              <span className={styles.colActions}>
                <Popconfirm
                  title={`删除字段 "${field.name || '(未命名)'}"？`}
                  onConfirm={() => handleDeleteField(index)}
                  okText="删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                >
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    className={styles.deleteFieldBtn}
                  />
                </Popconfirm>
              </span>
            </div>
          ))}

          {/* 添加字段行（单列居中） */}
          <div className={styles.addFieldRow}>
            <Button
              type="text"
              size="small"
              icon={<PlusOutlined />}
              onClick={handleAddField}
              className={styles.addFieldBtn}
            >
              添加字段
            </Button>
          </div>
        </div>
      </div>
    )
  },
)

FieldEditor.displayName = 'FieldEditor'

export default FieldEditor
