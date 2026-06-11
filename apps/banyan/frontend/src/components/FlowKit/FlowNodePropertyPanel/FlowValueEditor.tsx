/**
 * FlowValueEditor — FlowValue 通用编辑器
 *
 * 支持 5 种来源（literal / dataRef / pageDataRef / eventArg / nodeRef）切换，
 * 根据当前来源动态渲染对应输入控件。
 */

import { useCallback, useMemo } from 'react'
import { Input, InputNumber, Select, Segmented, Switch } from 'antd'
import type { FlowValue } from '@banyuan/banvasgl'
import styles from './index.module.scss'

// ── 来源选项 ──

const SOURCE_OPTIONS = [
  { label: '字面量', value: 'literal' },
  { label: '数据引用', value: 'dataRef' },
  { label: '页面变量', value: 'pageDataRef' },
  { label: '事件参数', value: 'eventArg' },
  { label: '节点引用', value: 'nodeRef' },
]

export interface FlowValueEditorProps {
  value: FlowValue
  onChange: (value: FlowValue) => void
  /** 可用的 View 列表（dataRef 时使用） */
  viewOptions?: Array<{ id: string; name: string }>
  /** 可用的页面变量列表 */
  pageVarOptions?: string[]
  /** 可用的上游值节点列表 */
  nodeRefOptions?: Array<{ id: string; label: string }>
  /** 标签（字段名称） */
  label?: string
}

export const FlowValueEditor: React.FC<FlowValueEditorProps> = ({
  value,
  onChange,
  viewOptions = [],
  pageVarOptions = [],
  nodeRefOptions = [],
  label,
}) => {
  const handleSourceChange = useCallback((newKind: string) => {
    // 切换来源时重置为默认值
    switch (newKind) {
      case 'literal':
        onChange({ kind: 'literal', value: '' })
        break
      case 'dataRef':
        onChange({ kind: 'dataRef', viewId: 'self', key: '' })
        break
      case 'pageDataRef':
        onChange({ kind: 'pageDataRef', key: '' })
        break
      case 'eventArg':
        onChange({ kind: 'eventArg', index: 0 })
        break
      case 'nodeRef':
        onChange({ kind: 'nodeRef', nodeId: '' })
        break
    }
  }, [onChange])

  const valueEditor = useMemo(() => {
    switch (value.kind) {
      case 'literal': {
        const v = value.value
        if (typeof v === 'boolean') {
          return (
            <Switch
              checked={v}
              onChange={(checked) => onChange({ kind: 'literal', value: checked })}
              size="small"
            />
          )
        }
        if (typeof v === 'number') {
          return (
            <InputNumber
              value={v}
              onChange={(num) => onChange({ kind: 'literal', value: num ?? 0 })}
              size="small"
              className={styles.fullWidth}
            />
          )
        }
        // 字符串/null/object 统一用文本输入
        return (
          <Input
            value={v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)}
            onChange={(e) => onChange({ kind: 'literal', value: e.target.value })}
            size="small"
            placeholder="输入值"
          />
        )
      }

      case 'dataRef':
        return (
          <div className={styles.hStack}>
            <Select
              value={value.viewId}
              onChange={(viewId) => onChange({ ...value, viewId })}
              size="small"
              className={styles.selectHalf}
              options={[
                { label: 'self', value: 'self' },
                ...viewOptions.map(v => ({ label: v.name || v.id.slice(0, 8), value: v.id })),
              ]}
            />
            <Input
              value={value.key}
              onChange={(e) => onChange({ ...value, key: e.target.value })}
              size="small"
              placeholder="key"
              className={styles.inputHalf}
            />
          </div>
        )

      case 'pageDataRef':
        return (
          <Select
            value={value.key}
            onChange={(key) => onChange({ kind: 'pageDataRef', key })}
            size="small"
            className={styles.fullWidth}
            placeholder="选择页面变量"
            options={pageVarOptions.map(k => ({ label: k, value: k }))}
            showSearch
            allowClear
          />
        )

      case 'eventArg':
        return (
          <InputNumber
            value={value.index}
            onChange={(idx) => onChange({ kind: 'eventArg', index: idx ?? 0 })}
            size="small"
            min={0}
            className={styles.fullWidth}
          />
        )

      case 'nodeRef':
        return (
          <Select
            value={value.nodeId || undefined}
            onChange={(nodeId) => onChange({ kind: 'nodeRef', nodeId })}
            size="small"
            className={styles.fullWidth}
            placeholder="选择上游节点"
            options={nodeRefOptions.map(n => ({ label: n.label, value: n.id }))}
            showSearch
            allowClear
          />
        )

      default:
        return null
    }
  }, [value, onChange, viewOptions, pageVarOptions, nodeRefOptions])

  return (
    <div className={styles.flowValueEditor}>
      {label && <div className={styles.fieldLabel}>{label}</div>}
      <Segmented
        value={value.kind}
        onChange={handleSourceChange}
        options={SOURCE_OPTIONS}
        size="small"
        className={styles.sourceSegmented}
      />
      <div className={styles.valueInputArea}>
        {valueEditor}
      </div>
    </div>
  )
}

export default FlowValueEditor
