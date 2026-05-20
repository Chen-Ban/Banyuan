import React, { useEffect, useState, useCallback } from 'react'
import { Select, Button, Tooltip, Tag } from 'antd'
import { CloseCircleOutlined } from '@ant-design/icons'
import type { IBanvasActions, IView } from '@banyuan/canvas'
import { fieldsApi } from '@/api'
import type { FieldGroup, FieldDefinition } from '@/api'

interface FieldBindingSectionProps {
  view: IView
  selectedViewId: string
  actions: IBanvasActions
}

/**
 * FieldBindingSection — 字段绑定区域组件
 *
 * 独立的可复用组件，用于将 fieldKey 绑定到 TextView。
 * 将 fieldKey 存入 view.data.fieldKey，复用 BanvasGL 现有 IFieldSchemaMap 机制。
 * BanvasGL 层零改动。
 *
 * 序列化结构：
 * {
 *   "data": {
 *     "fieldKey": { "type": "string", "default": "", "value": "customer_name" }
 *   }
 * }
 *
 * 使用场景：
 * - PropertyPanel 的「字段绑定」Tab 中（仅 TextView 显示）
 * - 可嵌入其他需要字段绑定能力的面板
 */
const FieldBindingSection: React.FC<FieldBindingSectionProps> = ({
  view,
  selectedViewId,
  actions,
}) => {
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
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: '#7f8c8d', flexShrink: 0, width: 52 }}>
          绑定字段
        </span>
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
        <div style={{
          background: '#f0f7ff',
          border: '1px solid #bde0ff',
          borderRadius: 4,
          padding: 8,
          marginTop: 8,
        }}>
          <div style={{ fontSize: 10, color: '#7f8c8d', marginBottom: 4 }}>
            预览占位值
          </div>
          <div style={{ marginBottom: 4 }}>
            <Tag color="blue">{currentFieldDef.example}</Tag>
          </div>
          <div style={{ fontSize: 10, color: '#95a5a6', lineHeight: 1.4 }}>
            {currentFieldDef.description}
          </div>
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

      <div style={{
        marginTop: 12,
        fontSize: 11,
        color: '#95a5a6',
        lineHeight: 1.6,
      }}>
        绑定字段后，打印时该文本将替换为订单中对应的实际数据。
        未绑定字段时，打印设计时的文本内容（静态文本）。
      </div>
    </div>
  )
}

export default FieldBindingSection
