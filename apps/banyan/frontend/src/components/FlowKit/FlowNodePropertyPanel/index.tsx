/**
 * FlowNodePropertyPanel — 流程节点属性面板
 *
 * 当流程画布中选中一个 NodeView 时，右侧浮出此面板。
 * 根据 FlowNode.kind 动态渲染对应的参数编辑表单。
 *
 * 写回机制：表单 onChange → 更新 NodeView.schema 对应字段 → app.notify() 重绘画布。
 */

import { useCallback, useMemo } from 'react'
import {
  Input,
  InputNumber,
  Select,
  Switch,
  Divider,
} from 'antd'
import { CloseOutlined } from '@ant-design/icons'
import type { FlowNode, FlowValue } from '@banyuan/banvasgl'
import FlowValueEditor from './FlowValueEditor'
import styles from './index.module.scss'

// ── 类型 ──

export interface FlowNodePropertyPanelProps {
  /** 当前选中的 FlowNode schema（null 时面板不渲染） */
  node: FlowNode | null
  /** 修改节点 schema 某个字段后回调 */
  onChange: (updatedNode: FlowNode) => void
  /** 关闭面板 */
  onClose: () => void
  /** 可用的页面列表（navigate 节点使用） */
  pageOptions?: Array<{ id: string; name: string }>
  /** 可用的云函数列表（callFlow 节点使用） */
  flowOptions?: Array<{ id: string; name: string }>
  /** 可用的集合列表（db* 节点使用） */
  collectionOptions?: string[]
  /** 可用的 View 列表（FlowValueEditor dataRef 使用） */
  viewOptions?: Array<{ id: string; name: string }>
  /** 可用的页面变量列表 */
  pageVarOptions?: string[]
  /** 可用的上游值节点列表 */
  nodeRefOptions?: Array<{ id: string; label: string }>
}

// ── Kind 中文名映射 ──

const KIND_LABELS: Record<string, string> = {
  setVariable: '设置变量',
  setData: '设置数据',
  navigate: '跳转页面',
  callFlow: '调用流程',
  condition: '条件分支',
  dbQuery: '数据库查询',
  dbInsert: '数据库插入',
  dbUpdate: '数据库更新',
  dbDelete: '数据库删除',
  httpRequest: 'HTTP 请求',
  transform: '数据转换',
  script: '自定义脚本',
  delay: '延迟等待',
  setVisible: '显隐控制',
  animate: '播放动画',
  forEach: '遍历列表',
  parallel: '并行执行',
  subFlow: '子流程',
  return: '返回/终止',
}

// ── 条件操作符选项 ──

const CONDITION_OPS = [
  { label: '==', value: '==' },
  { label: '!=', value: '!=' },
  { label: '>', value: '>' },
  { label: '>=', value: '>=' },
  { label: '<', value: '<' },
  { label: '<=', value: '<=' },
]

const HTTP_METHODS = [
  { label: 'GET', value: 'GET' },
  { label: 'POST', value: 'POST' },
  { label: 'PUT', value: 'PUT' },
  { label: 'DELETE', value: 'DELETE' },
  { label: 'PATCH', value: 'PATCH' },
]

// ── 主组件 ──

export const FlowNodePropertyPanel: React.FC<FlowNodePropertyPanelProps> = ({
  node,
  onChange,
  onClose,
  pageOptions = [],
  flowOptions = [],
  collectionOptions = [],
  viewOptions = [],
  pageVarOptions = [],
  nodeRefOptions = [],
}) => {
  if (!node) return null

  const kindLabel = KIND_LABELS[node.kind] || node.kind

  // FlowValue 字段更新辅助
  const updateFlowValue = useCallback((field: string, value: FlowValue) => {
    onChange({ ...node, [field]: value } as unknown as FlowNode)
  }, [node, onChange])

  // ── 各 kind 的表单体 ──
  const formBody = useMemo(() => {
    switch (node.kind) {
      case 'setVariable':
        return (
          <>
            <FormField label="Scope">
              <Input
                value={node.scope}
                onChange={(e) => onChange({ ...node, scope: e.target.value })}
                size="small"
                placeholder="page / self / viewId"
              />
            </FormField>
            <FormField label="Key">
              <Input
                value={node.key}
                onChange={(e) => onChange({ ...node, key: e.target.value })}
                size="small"
                placeholder="变量名"
              />
            </FormField>
            <FlowValueEditor
              label="Value"
              value={node.value}
              onChange={(v) => updateFlowValue('value', v)}
              viewOptions={viewOptions}
              pageVarOptions={pageVarOptions}
              nodeRefOptions={nodeRefOptions}
            />
          </>
        )

      case 'setData':
        return (
          <>
            <FormField label="View ID">
              <Select
                value={node.viewId}
                onChange={(v) => onChange({ ...node, viewId: v })}
                size="small"
                className={styles.fullWidth}
                options={[
                  { label: 'self', value: 'self' },
                  ...viewOptions.map(v => ({ label: v.name || v.id.slice(0, 8), value: v.id })),
                ]}
                showSearch
              />
            </FormField>
            <FormField label="Key">
              <Input
                value={node.key}
                onChange={(e) => onChange({ ...node, key: e.target.value })}
                size="small"
                placeholder="data 字段名"
              />
            </FormField>
            <FlowValueEditor
              label="Value"
              value={node.value}
              onChange={(v) => updateFlowValue('value', v)}
              viewOptions={viewOptions}
              pageVarOptions={pageVarOptions}
              nodeRefOptions={nodeRefOptions}
            />
          </>
        )

      case 'navigate':
        return (
          <FormField label="目标页面">
            <Select
              value={node.pageId || undefined}
              onChange={(v) => onChange({ ...node, pageId: v })}
              size="small"
              className={styles.fullWidth}
              placeholder="选择页面"
              options={pageOptions.map(p => ({ label: p.name, value: p.id }))}
              showSearch
              allowClear
            />
          </FormField>
        )

      case 'callFlow':
        return (
          <>
            <FormField label="目标流程">
              <Select
                value={node.flowId || undefined}
                onChange={(v) => onChange({ ...node, flowId: v })}
                size="small"
                className={styles.fullWidth}
                placeholder="选择云函数"
                options={flowOptions.map(f => ({ label: f.name, value: f.id }))}
                showSearch
                allowClear
              />
            </FormField>
          </>
        )

      case 'condition':
        return (
          <>
            <FlowValueEditor
              label="左值"
              value={node.condition.left}
              onChange={(v) => onChange({ ...node, condition: { ...node.condition, left: v } })}
              viewOptions={viewOptions}
              pageVarOptions={pageVarOptions}
              nodeRefOptions={nodeRefOptions}
            />
            <FormField label="操作符">
              <Select
                value={node.condition.op}
                onChange={(op) => onChange({ ...node, condition: { ...node.condition, op } })}
                size="small"
                className={styles.fullWidth}
                options={CONDITION_OPS}
              />
            </FormField>
            <FlowValueEditor
              label="右值"
              value={node.condition.right}
              onChange={(v) => onChange({ ...node, condition: { ...node.condition, right: v } })}
              viewOptions={viewOptions}
              pageVarOptions={pageVarOptions}
              nodeRefOptions={nodeRefOptions}
            />
          </>
        )

      case 'dbQuery':
        return (
          <>
            <FormField label="集合">
              <Select
                value={node.collection || undefined}
                onChange={(v) => onChange({ ...node, collection: v })}
                size="small"
                className={styles.fullWidth}
                placeholder="选择集合"
                options={collectionOptions.map(c => ({ label: c, value: c }))}
                showSearch
                allowClear
              />
            </FormField>
            <FormField label="输出变量">
              <Input
                value={node.outputVariable}
                onChange={(e) => onChange({ ...node, outputVariable: e.target.value })}
                size="small"
                placeholder="结果写入变量名"
              />
            </FormField>
            <FormField label="Limit">
              <InputNumber
                value={node.limit}
                onChange={(v) => onChange({ ...node, limit: v ?? undefined })}
                size="small"
                min={1}
                className={styles.fullWidth}
                placeholder="不限"
              />
            </FormField>
          </>
        )

      case 'dbInsert':
        return (
          <>
            <FormField label="集合">
              <Select
                value={node.collection || undefined}
                onChange={(v) => onChange({ ...node, collection: v })}
                size="small"
                className={styles.fullWidth}
                placeholder="选择集合"
                options={collectionOptions.map(c => ({ label: c, value: c }))}
                showSearch
              />
            </FormField>
            <FormField label="输出变量">
              <Input
                value={node.outputVariable}
                onChange={(e) => onChange({ ...node, outputVariable: e.target.value })}
                size="small"
                placeholder="insertedId 写入变量名"
              />
            </FormField>
          </>
        )

      case 'dbUpdate':
        return (
          <>
            <FormField label="集合">
              <Select
                value={node.collection || undefined}
                onChange={(v) => onChange({ ...node, collection: v })}
                size="small"
                className={styles.fullWidth}
                placeholder="选择集合"
                options={collectionOptions.map(c => ({ label: c, value: c }))}
                showSearch
              />
            </FormField>
            <FormField label="输出变量">
              <Input
                value={node.outputVariable}
                onChange={(e) => onChange({ ...node, outputVariable: e.target.value })}
                size="small"
                placeholder="modifiedCount 写入变量名"
              />
            </FormField>
          </>
        )

      case 'dbDelete':
        return (
          <>
            <FormField label="集合">
              <Select
                value={node.collection || undefined}
                onChange={(v) => onChange({ ...node, collection: v })}
                size="small"
                className={styles.fullWidth}
                placeholder="选择集合"
                options={collectionOptions.map(c => ({ label: c, value: c }))}
                showSearch
              />
            </FormField>
            <FormField label="输出变量">
              <Input
                value={node.outputVariable}
                onChange={(e) => onChange({ ...node, outputVariable: e.target.value })}
                size="small"
                placeholder="deletedCount 写入变量名"
              />
            </FormField>
          </>
        )

      case 'httpRequest':
        return (
          <>
            <FormField label="Method">
              <Select
                value={node.method}
                onChange={(v) => onChange({ ...node, method: v })}
                size="small"
                className={styles.fullWidth}
                options={HTTP_METHODS}
              />
            </FormField>
            <FlowValueEditor
              label="URL"
              value={node.url}
              onChange={(v) => updateFlowValue('url', v)}
              viewOptions={viewOptions}
              pageVarOptions={pageVarOptions}
              nodeRefOptions={nodeRefOptions}
            />
            <FormField label="输出变量">
              <Input
                value={node.outputVariable}
                onChange={(e) => onChange({ ...node, outputVariable: e.target.value })}
                size="small"
                placeholder="response 写入变量名"
              />
            </FormField>
          </>
        )

      case 'transform':
        return (
          <>
            <FormField label="表达式">
              <Input.TextArea
                value={node.expression}
                onChange={(e) => onChange({ ...node, expression: e.target.value })}
                size="small"
                rows={3}
                placeholder="安全表达式（expr-eval 语法）"
              />
            </FormField>
            <FormField label="输出变量">
              <Input
                value={node.outputVariable}
                onChange={(e) => onChange({ ...node, outputVariable: e.target.value })}
                size="small"
              />
            </FormField>
          </>
        )

      case 'script':
        return (
          <>
            <FormField label="代码">
              <Input.TextArea
                value={node.code}
                onChange={(e) => onChange({ ...node, code: e.target.value })}
                size="small"
                rows={6}
                placeholder="自定义脚本（vm 沙箱执行）"
                style={{ fontFamily: 'monospace', fontSize: 11 }}
              />
            </FormField>
            <FormField label="超时 (ms)">
              <InputNumber
                value={node.timeout ?? 5000}
                onChange={(v) => onChange({ ...node, timeout: v ?? 5000 })}
                size="small"
                min={100}
                max={30000}
                className={styles.fullWidth}
              />
            </FormField>
          </>
        )

      case 'delay':
        return (
          <FormField label="延迟 (ms)">
            <InputNumber
              value={node.ms}
              onChange={(v) => onChange({ ...node, ms: v ?? 0 })}
              size="small"
              min={0}
              className={styles.fullWidth}
            />
          </FormField>
        )

      case 'setVisible':
        return (
          <>
            <FormField label="View ID">
              <Select
                value={node.viewId}
                onChange={(v) => onChange({ ...node, viewId: v })}
                size="small"
                className={styles.fullWidth}
                options={[
                  { label: 'self', value: 'self' },
                  ...viewOptions.map(v => ({ label: v.name || v.id.slice(0, 8), value: v.id })),
                ]}
                showSearch
              />
            </FormField>
            <FormField label="可见">
              <Switch
                checked={node.visible}
                onChange={(v) => onChange({ ...node, visible: v })}
                size="small"
              />
            </FormField>
          </>
        )

      case 'animate':
        return (
          <>
            <FormField label="View ID">
              <Select
                value={node.viewId}
                onChange={(v) => onChange({ ...node, viewId: v })}
                size="small"
                className={styles.fullWidth}
                options={[
                  { label: 'self', value: 'self' },
                  ...viewOptions.map(v => ({ label: v.name || v.id.slice(0, 8), value: v.id })),
                ]}
                showSearch
              />
            </FormField>
            <FormField label="动画 ID">
              <Input
                value={node.animationId}
                onChange={(e) => onChange({ ...node, animationId: e.target.value })}
                size="small"
                placeholder="动画标识"
              />
            </FormField>
          </>
        )

      case 'forEach':
        return (
          <>
            <FlowValueEditor
              label="集合"
              value={node.collection}
              onChange={(v) => updateFlowValue('collection', v)}
              viewOptions={viewOptions}
              pageVarOptions={pageVarOptions}
              nodeRefOptions={nodeRefOptions}
            />
            <FormField label="元素变量名">
              <Input
                value={node.itemVariable}
                onChange={(e) => onChange({ ...node, itemVariable: e.target.value })}
                size="small"
                placeholder="item"
              />
            </FormField>
            <FormField label="索引变量名">
              <Input
                value={node.indexVariable ?? ''}
                onChange={(e) => onChange({ ...node, indexVariable: e.target.value || undefined })}
                size="small"
                placeholder="index（可选）"
              />
            </FormField>
          </>
        )

      case 'parallel':
        return (
          <>
            <FormField label="汇聚模式">
              <Select
                value={node.joinMode}
                onChange={(v) => onChange({ ...node, joinMode: v })}
                size="small"
                className={styles.fullWidth}
                options={[
                  { label: '全部完成 (all)', value: 'all' },
                  { label: '任一完成 (any)', value: 'any' },
                ]}
              />
            </FormField>
            <FormField label="结果变量名">
              <Input
                value={node.resultsVariable}
                onChange={(e) => onChange({ ...node, resultsVariable: e.target.value })}
                size="small"
                placeholder="results"
              />
            </FormField>
            <div className={styles.infoText}>
              当前 {node.branches.length} 条并行分支
            </div>
          </>
        )

      case 'subFlow':
        return (
          <>
            <FormField label="名称">
              <Input
                value={node.name}
                onChange={(e) => onChange({ ...node, name: e.target.value })}
                size="small"
              />
            </FormField>
            <div className={styles.infoText}>
              {node.inputs.length} 输入端口 / {node.outputs.length} 输出端口
            </div>
          </>
        )

      case 'return':
        return node.outputValue ? (
          <FlowValueEditor
            label="返回值"
            value={node.outputValue}
            onChange={(v) => onChange({ ...node, outputValue: v })}
            viewOptions={viewOptions}
            pageVarOptions={pageVarOptions}
            nodeRefOptions={nodeRefOptions}
          />
        ) : (
          <div className={styles.infoText}>无返回值（终止流程）</div>
        )

      default:
        return <div className={styles.infoText}>暂不支持编辑此节点类型</div>
    }
  }, [node, onChange, updateFlowValue, pageOptions, flowOptions, collectionOptions, viewOptions, pageVarOptions, nodeRefOptions])

  return (
    <div className={styles.propertyPanel}>
      {/* 标题栏 */}
      <div className={styles.panelHeader}>
        <div className={styles.headerLeft}>
          <span className={styles.kindBadge}>{kindLabel}</span>
          <span className={styles.nodeId} title={node.id}>{node.id.slice(0, 8)}</span>
        </div>
        <button className={styles.closeBtn} onClick={onClose} aria-label="关闭属性面板">
          <CloseOutlined />
        </button>
      </div>

      <Divider className={styles.headerDivider} />

      {/* 表单体 */}
      <div className={styles.panelBody}>
        {formBody}
      </div>
    </div>
  )
}

// ── 内部辅助组件 ──

const FormField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className={styles.formField}>
    <div className={styles.fieldLabel}>{label}</div>
    <div className={styles.fieldControl}>{children}</div>
  </div>
)

export default FlowNodePropertyPanel
