/**
 * FlowNodePropertyPanel — 流程节点属性面板（v2.0.0 slots 架构适配）
 *
 * 当流程画布中选中一个 NodeView 时，右侧浮出此面板。
 * 根据 FlowNode.kind 动态渲染对应的参数编辑表单。
 *
 * 写回机制：表单 onChange → 更新 NodeView.schema → app.notify() 重绘画布。
 * 数据访问统一走 node.slots[0].input.*。
 */

import { useMemo } from 'react'
import { Input, Select, Switch, Divider } from 'antd'
import { CloseOutlined } from '@ant-design/icons'
import type { FlowNode } from '@banyuan/banvasgl'
import styles from './index.module.scss'

// ── 类型 ──

export interface FlowNodePropertyPanelProps {
  /** 当前选中的 FlowNode schema（null 时面板不渲染） */
  node: FlowNode | null
  /** 修改节点 schema 某个字段后回调 */
  onChange: (updatedNode: FlowNode) => void
  /** 关闭面板 */
  onClose: () => void
  /** 可用的云函数列表 */
  flowOptions?: Array<{ id: string; name: string }>
  /** 可用的集合列表（db* 节点使用） */
  collectionOptions?: string[]
}

// ── slot 访问辅助 ──

/** 获取 node.slots[0] 的 input 对象（安全访问） */
function getSlotInput(node: FlowNode): Record<string, unknown> {
  return ((node.slots?.[0] as unknown as Record<string, unknown>)?.input as Record<string, unknown>) ?? {}
}

/** 获取 slot 的某个非 input 字段 */
function getSlotField(node: FlowNode, field: string): unknown {
  return (node.slots?.[0] as unknown as Record<string, unknown>)?.[field]
}

/** 更新 slot[0].input 的部分字段，返回新的 FlowNode */
function updateSlotInput(node: FlowNode, inputUpdates: Record<string, unknown>): FlowNode {
  const slots = [...node.slots]
  const oldSlot = (slots[0] as unknown as Record<string, unknown>) ?? {}
  slots[0] = {
    ...oldSlot,
    input: { ...((oldSlot.input as Record<string, unknown>) ?? {}), ...inputUpdates },
  } as unknown as (typeof slots)[0]
  return { ...node, slots } as FlowNode
}

/** 更新 slot[0] 的非 input 字段，返回新的 FlowNode */
function updateSlotField(node: FlowNode, field: string, value: unknown): FlowNode {
  const slots = [...node.slots]
  const oldSlot = (slots[0] as unknown as Record<string, unknown>) ?? {}
  slots[0] = { ...oldSlot, [field]: value } as unknown as (typeof slots)[0]
  return { ...node, slots } as FlowNode
}

// ── Kind 中文名映射 ──

const KIND_LABELS: Record<string, string> = {
  // control
  condition: '条件分支',
  loop: '循环',
  parallel: '并行执行',
  return: '返回',
  // function
  function: '本地函数',
  // action
  setVariable: '设置变量',
  setViewData: '设置 View 数据',
  setViewVisible: '显隐控制',
  playAnimation: '播放动画',
  navigate: '跳转页面',
  cloudFunction: '云函数',
  httpRequest: 'HTTP 请求',
  dbQuery: '数据库查询',
  dbInsert: '数据库插入',
  dbUpdate: '数据库更新',
  dbDelete: '数据库删除',
  // source
  literal: '字面量',
  context: '上下文',
  // compute
  math: '算术运算',
  compare: '比较运算',
  logic: '逻辑运算',
  concat: '拼接字符串',
  format: '格式化',
  get: '字段提取',
}

// ── 比较运算符选项 ──

const COMPARE_OPS = [
  { label: '等于 (eq)', value: 'eq' },
  { label: '不等于 (neq)', value: 'neq' },
  { label: '大于 (gt)', value: 'gt' },
  { label: '大于等于 (gte)', value: 'gte' },
  { label: '小于 (lt)', value: 'lt' },
  { label: '小于等于 (lte)', value: 'lte' },
  { label: '包含 (contains)', value: 'contains' },
]

const MATH_OPS = [
  { label: '加 (add)', value: 'add' },
  { label: '减 (sub)', value: 'sub' },
  { label: '乘 (mul)', value: 'mul' },
  { label: '除 (div)', value: 'div' },
  { label: '取模 (mod)', value: 'mod' },
  { label: '幂 (pow)', value: 'pow' },
  { label: '最小 (min)', value: 'min' },
  { label: '最大 (max)', value: 'max' },
]

const LOGIC_OPS = [
  { label: '与 (and)', value: 'and' },
  { label: '或 (or)', value: 'or' },
  { label: '非 (not)', value: 'not' },
]

const PARALLEL_MODES = [
  { label: '全部完成', value: 'all' },
  { label: '全部结束', value: 'allSettled' },
  { label: '首个完成', value: 'race' },
  { label: '首个成功', value: 'any' },
]

// ── 主组件 ──

export const FlowNodePropertyPanel: React.FC<FlowNodePropertyPanelProps> = ({
  node,
  onChange,
  onClose,
  flowOptions = [],
  collectionOptions = [],
}) => {
  const kindLabel = (KIND_LABELS[node?.kind ?? ''] || node?.kind) ?? ''

  // ── 各 kind 的表单体 ──
  const formBody = useMemo(() => {
    if (!node) return null
    const inp = getSlotInput(node)

    switch (node.kind) {
      // ── control ──
      case 'condition': {
        const slots = node.slots as unknown as Array<Record<string, unknown>>
        return (
          <div className={styles.infoText}>{slots.length} 条条件分支。在画布上通过连线配置分支目标。</div>
        )
      }

      case 'loop':
        return (
          <div className={styles.infoText}>
            循环节点：while (filter) 执行 body 子图。 filter 和 body 通过 SlotValue 编辑器配置。
          </div>
        )

      case 'parallel':
        return (
          <>
            <FormField label="收敛模式">
              <Select
                value={(getSlotField(node, 'mode') as string) ?? 'all'}
                onChange={(v) => onChange(updateSlotField(node, 'mode', v))}
                size="small"
                className={styles.fullWidth}
                options={PARALLEL_MODES}
              />
            </FormField>
            <div className={styles.infoText}>
              {(getSlotField(node, 'body') as unknown[])?.length ?? 0} 条并行分支。
            </div>
          </>
        )

      case 'return':
        return <div className={styles.infoText}>返回节点：终止子图执行。可收集 inputs 作为返回值。</div>

      // ── function ──
      case 'function':
        return <div className={styles.infoText}>内联函数节点：创建新作用域执行 body 子图。</div>

      // ── action ──
      case 'setVariable':
        return (
          <>
            <FormField label="变量名">
              <Input
                value={(inp.target as string) ?? ''}
                onChange={(e) => onChange(updateSlotInput(node, { target: e.target.value }))}
                size="small"
                placeholder="目标变量名"
              />
            </FormField>
            <FormField label="值">
              <Input
                value={String(inp.value ?? '')}
                onChange={(e) => onChange(updateSlotInput(node, { value: e.target.value }))}
                size="small"
                placeholder="值（支持 DataRef：↗nodeId.field）"
              />
            </FormField>
          </>
        )

      case 'setViewData':
        return (
          <>
            <FormField label="View ID">
              <Input
                value={(inp.viewId as string) ?? ''}
                onChange={(e) => onChange(updateSlotInput(node, { viewId: e.target.value }))}
                size="small"
                placeholder="self 或 viewId"
              />
            </FormField>
            <FormField label="Key">
              <Input
                value={(inp.key as string) ?? ''}
                onChange={(e) => onChange(updateSlotInput(node, { key: e.target.value }))}
                size="small"
                placeholder="data 字段名"
              />
            </FormField>
            <FormField label="Value">
              <Input
                value={String(inp.value ?? '')}
                onChange={(e) => onChange(updateSlotInput(node, { value: e.target.value }))}
                size="small"
                placeholder="值"
              />
            </FormField>
          </>
        )

      case 'setViewVisible':
        return (
          <>
            <FormField label="View ID">
              <Input
                value={(inp.viewId as string) ?? ''}
                onChange={(e) => onChange(updateSlotInput(node, { viewId: e.target.value }))}
                size="small"
                placeholder="self 或 viewId"
              />
            </FormField>
            <FormField label="可见">
              <Switch
                checked={!!inp.visible}
                onChange={(v) => onChange(updateSlotInput(node, { visible: v }))}
                size="small"
              />
            </FormField>
          </>
        )

      case 'playAnimation':
        return (
          <>
            <FormField label="View ID">
              <Input
                value={(inp.viewId as string) ?? ''}
                onChange={(e) => onChange(updateSlotInput(node, { viewId: e.target.value }))}
                size="small"
                placeholder="self 或 viewId"
              />
            </FormField>
            <FormField label="动画 ID">
              <Input
                value={(inp.animationId as string) ?? ''}
                onChange={(e) => onChange(updateSlotInput(node, { animationId: e.target.value }))}
                size="small"
                placeholder="动画标识"
              />
            </FormField>
          </>
        )

      case 'navigate':
        return (
          <FormField label="目标">
            <Input
              value={String(inp.target ?? '')}
              onChange={(e) => onChange(updateSlotInput(node, { target: e.target.value }))}
              size="small"
              placeholder="页面 ID 或 URL"
            />
          </FormField>
        )

      case 'cloudFunction':
        return (
          <>
            <FormField label="云函数">
              <Select
                value={(inp.functionId as string) || undefined}
                onChange={(v) => onChange(updateSlotInput(node, { functionId: v }))}
                size="small"
                className={styles.fullWidth}
                placeholder="选择云函数"
                options={flowOptions.map((f) => ({ label: f.name, value: f.id }))}
                showSearch
                allowClear
              />
            </FormField>
            <FormField label="参数 (JSON)">
              <Input
                value={String(inp.args ?? '')}
                onChange={(e) => onChange(updateSlotInput(node, { args: e.target.value }))}
                size="small"
                placeholder='{"key": "value"}'
              />
            </FormField>
          </>
        )

      case 'httpRequest':
        return (
          <>
            <FormField label="URL">
              <Input
                value={String(inp.url ?? '')}
                onChange={(e) => onChange(updateSlotInput(node, { url: e.target.value }))}
                size="small"
                placeholder="https://..."
              />
            </FormField>
            <FormField label="Method">
              <Select
                value={(inp.method as string) || 'GET'}
                onChange={(v) => onChange(updateSlotInput(node, { method: v }))}
                size="small"
                className={styles.fullWidth}
                options={[
                  { label: 'GET', value: 'GET' },
                  { label: 'POST', value: 'POST' },
                  { label: 'PUT', value: 'PUT' },
                  { label: 'DELETE', value: 'DELETE' },
                  { label: 'PATCH', value: 'PATCH' },
                ]}
              />
            </FormField>
          </>
        )

      case 'dbQuery':
        return (
          <>
            <FormField label="集合">
              <Select
                value={(inp.collection as string) || undefined}
                onChange={(v) => onChange(updateSlotInput(node, { collection: v }))}
                size="small"
                className={styles.fullWidth}
                placeholder="选择集合"
                options={collectionOptions.map((c) => ({ label: c, value: c }))}
                showSearch
                allowClear
              />
            </FormField>
          </>
        )

      case 'dbInsert':
        return (
          <FormField label="集合">
            <Select
              value={(inp.collection as string) || undefined}
              onChange={(v) => onChange(updateSlotInput(node, { collection: v }))}
              size="small"
              className={styles.fullWidth}
              placeholder="选择集合"
              options={collectionOptions.map((c) => ({ label: c, value: c }))}
              showSearch
            />
          </FormField>
        )

      case 'dbUpdate':
        return (
          <FormField label="集合">
            <Select
              value={(inp.collection as string) || undefined}
              onChange={(v) => onChange(updateSlotInput(node, { collection: v }))}
              size="small"
              className={styles.fullWidth}
              placeholder="选择集合"
              options={collectionOptions.map((c) => ({ label: c, value: c }))}
              showSearch
            />
          </FormField>
        )

      case 'dbDelete':
        return (
          <FormField label="集合">
            <Select
              value={(inp.collection as string) || undefined}
              onChange={(v) => onChange(updateSlotInput(node, { collection: v }))}
              size="small"
              className={styles.fullWidth}
              placeholder="选择集合"
              options={collectionOptions.map((c) => ({ label: c, value: c }))}
              showSearch
              allowClear
            />
          </FormField>
        )

      // ── source ──
      case 'literal':
        return (
          <FormField label="值">
            <Input
              value={String(getSlotField(node, 'value') ?? '')}
              onChange={(e) => onChange(updateSlotField(node, 'value', e.target.value))}
              size="small"
              placeholder="字面量值"
            />
          </FormField>
        )

      case 'context':
        return (
          <FormField label="路径">
            <Input
              value={(getSlotField(node, 'path') as string) ?? ''}
              onChange={(e) => onChange(updateSlotField(node, 'path', e.target.value))}
              size="small"
              placeholder="上下文路径（如 vars.myVar）"
            />
          </FormField>
        )

      // ── compute ──
      case 'math':
        return (
          <>
            <FormField label="运算符">
              <Select
                value={(inp.op as string) ?? 'add'}
                onChange={(v) => onChange(updateSlotInput(node, { op: v }))}
                size="small"
                className={styles.fullWidth}
                options={MATH_OPS}
              />
            </FormField>
            <FormField label="左值 (a)">
              <Input
                value={String(inp.a ?? '')}
                onChange={(e) => onChange(updateSlotInput(node, { a: e.target.value }))}
                size="small"
                placeholder="值或 DataRef"
              />
            </FormField>
            <FormField label="右值 (b)">
              <Input
                value={String(inp.b ?? '')}
                onChange={(e) => onChange(updateSlotInput(node, { b: e.target.value }))}
                size="small"
                placeholder="值或 DataRef"
              />
            </FormField>
          </>
        )

      case 'compare':
        return (
          <>
            <FormField label="运算符">
              <Select
                value={(inp.op as string) ?? 'eq'}
                onChange={(v) => onChange(updateSlotInput(node, { op: v }))}
                size="small"
                className={styles.fullWidth}
                options={COMPARE_OPS}
              />
            </FormField>
            <FormField label="左值 (a)">
              <Input
                value={String(inp.a ?? '')}
                onChange={(e) => onChange(updateSlotInput(node, { a: e.target.value }))}
                size="small"
                placeholder="值或 DataRef"
              />
            </FormField>
            <FormField label="右值 (b)">
              <Input
                value={String(inp.b ?? '')}
                onChange={(e) => onChange(updateSlotInput(node, { b: e.target.value }))}
                size="small"
                placeholder="值或 DataRef"
              />
            </FormField>
          </>
        )

      case 'logic':
        return (
          <>
            <FormField label="运算符">
              <Select
                value={(inp.op as string) ?? 'and'}
                onChange={(v) => onChange(updateSlotInput(node, { op: v }))}
                size="small"
                className={styles.fullWidth}
                options={LOGIC_OPS}
              />
            </FormField>
            <FormField label="左值 (a)">
              <Input
                value={String(inp.a ?? '')}
                onChange={(e) => onChange(updateSlotInput(node, { a: e.target.value }))}
                size="small"
                placeholder="值或 DataRef"
              />
            </FormField>
            <FormField label="右值 (b)">
              <Input
                value={String(inp.b ?? '')}
                onChange={(e) => onChange(updateSlotInput(node, { b: e.target.value }))}
                size="small"
                placeholder="值或 DataRef"
              />
            </FormField>
          </>
        )

      case 'concat':
        return (
          <>
            <FormField label="左值 (a)">
              <Input
                value={String(inp.a ?? '')}
                onChange={(e) => onChange(updateSlotInput(node, { a: e.target.value }))}
                size="small"
                placeholder="值或 DataRef"
              />
            </FormField>
            <FormField label="右值 (b)">
              <Input
                value={String(inp.b ?? '')}
                onChange={(e) => onChange(updateSlotInput(node, { b: e.target.value }))}
                size="small"
                placeholder="值或 DataRef"
              />
            </FormField>
            <FormField label="分隔符">
              <Input
                value={(inp.separator as string) ?? ''}
                onChange={(e) => onChange(updateSlotInput(node, { separator: e.target.value }))}
                size="small"
                placeholder="可选分隔符"
              />
            </FormField>
          </>
        )

      case 'format':
        return (
          <>
            <FormField label="模板">
              <Input
                value={String(inp.template ?? '')}
                onChange={(e) => onChange(updateSlotInput(node, { template: e.target.value }))}
                size="small"
                placeholder="Hello, {name}!"
              />
            </FormField>
            <FormField label="值">
              <Input
                value={String(inp.values ?? '')}
                onChange={(e) => onChange(updateSlotInput(node, { values: e.target.value }))}
                size="small"
                placeholder='{"name": "World"}'
              />
            </FormField>
          </>
        )

      case 'get':
        return (
          <>
            <FormField label="路径">
              <Input
                value={(inp.path as string) ?? ''}
                onChange={(e) => onChange(updateSlotInput(node, { path: e.target.value }))}
                size="small"
                placeholder="嵌套字段路径"
              />
            </FormField>
            <FormField label="对象">
              <Input
                value={String(inp.object ?? '')}
                onChange={(e) => onChange(updateSlotInput(node, { object: e.target.value }))}
                size="small"
                placeholder="值或 DataRef"
              />
            </FormField>
          </>
        )

      default:
        return <div className={styles.infoText}>暂不支持编辑此节点类型</div>
    }
  }, [node, onChange, flowOptions, collectionOptions])

  if (!node) return null

  return (
    <div className={styles.propertyPanel}>
      {/* 标题栏 */}
      <div className={styles.panelHeader}>
        <div className={styles.headerLeft}>
          <span className={styles.kindBadge}>{kindLabel}</span>
          <span className={styles.nodeId} title={node.id}>
            {node.id.slice(0, 8)}
          </span>
        </div>
        <button className={styles.closeBtn} onClick={onClose} aria-label="关闭属性面板">
          <CloseOutlined />
        </button>
      </div>

      <Divider className={styles.headerDivider} />

      {/* 表单体 */}
      <div className={styles.panelBody}>{formBody}</div>
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
