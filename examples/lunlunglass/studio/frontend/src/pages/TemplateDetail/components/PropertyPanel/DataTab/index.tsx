import React, { useEffect, useState, useCallback } from 'react'
import { Select, Button, Tooltip, Tag } from 'antd'
import { CloseCircleOutlined } from '@ant-design/icons'
import type { IBanvasActions, IView } from '@banyuan/canvas'
import { fieldsApi } from '@/api'
import type { FieldGroup, FieldDefinition } from '@/api'
import styles from '../index.module.scss'

interface DataTabProps {
  view: IView
  selectedViewId: string
  actions: IBanvasActions
}

/**
 * 字段绑定 Tab（仅 TextView 显示）
 *
 * 将 fieldKey 存入 view.data.fieldKey，复用 BanvasGL 现有 IFieldSchemaMap 机制。
 * BanvasGL 层零改动。
 *
 * 序列化结构：
 * {
 *   "data": {
 *     "fieldKey": { "type": "string", "default": "", "value": "customer_name" }
 *   }
 * }
 */
const DataTab: React.FC<DataTabProps> = ({ view, selectedViewId, actions }) => {
  const [fieldGroups, setFieldGroups] = useState<FieldGroup[]>([])
  const [loading, setLoading] = useState(false)

  // 当前绑定的 fieldKey（从 view.data.fieldKey.value 读取）
  const fieldKeySchema = view.data?.fieldKey
  const currentFieldKey = (fieldKeySchema?.value as string | undefined) ?? null

  useEffect(() => {
    setLoading(true)
    fieldsApi.fetchFields()
      .then(res => {
        setFieldGroups(res.data ?? [])
      })
      .catch(() => {
        // 静默失败，字段列表为空
      })
      .finally(() => setLoading(false))
  }, [])

  // 找到当前绑定字段的定义（用于显示 example 预览）
  const currentFieldDef: FieldDefinition | undefined = fieldGroups
    .flatMap(g => g.fields)
    .find(f => f.key === currentFieldKey)

  const handleFieldChange = useCallback((key: string | null) => {
    if (key === null) {
      // 清除绑定
      actions.view.deleteViewData(selectedViewId, 'fieldKey')
    } else {
      // 设置绑定：IFieldSchema { type: 'string', default: '', value: key }
      actions.view.setViewData(selectedViewId, 'fieldKey', {
        type: 'string',
        default: '',
        value: key,
      })
    }
  }, [actions, selectedViewId])

  // 构建 Select options（按分组）
  const selectOptions = fieldGroups.map(group => ({
    label: group.groupLabel,
    options: group.fields.map(field => ({
      label: (
        <Tooltip title={field.description} placement="right">
          <span>{field.label}</span>
        </Tooltip>
      ),
      value: field.key,
    })),
  }))

  return (
    <div className={styles.tabContent}>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>字段绑定</div>
        <div className={styles.fieldBindRow}>
          <span className={styles.fieldBindLabel}>绑定字段</span>
          <Select
            style={{ flex: 1 }}
            size="small"
            placeholder="选择字段..."
            loading={loading}
            value={currentFieldKey}
            onChange={handleFieldChange}
            options={selectOptions}
            allowClear
            onClear={() => handleFieldChange(null)}
          />
        </div>

        {currentFieldDef && (
          <div className={styles.fieldPreviewBox}>
            <div className={styles.fieldPreviewLabel}>预览占位值</div>
            <div className={styles.fieldPreviewValue}>
              <Tag color="blue">{currentFieldDef.example}</Tag>
            </div>
            <div className={styles.fieldPreviewDesc}>{currentFieldDef.description}</div>
          </div>
        )}

        {currentFieldKey && (
          <Button
            size="small"
            danger
            icon={<CloseCircleOutlined />}
            onClick={() => handleFieldChange(null)}
            style={{ marginTop: 8 }}
          >
            清除绑定
          </Button>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>说明</div>
        <div className={styles.fieldHint}>
          绑定字段后，打印时该文本将替换为订单中对应的实际数据。
          未绑定字段时，打印设计时的文本内容（静态文本）。
        </div>
      </section>
    </div>
  )
}

export default DataTab
