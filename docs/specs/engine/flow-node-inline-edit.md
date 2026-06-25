# 流程节点内联参数编辑 — 实施方案

## 关联决策

- **engine:M19** — NodeView 内联参数编辑机制（Blender 着色器节点模式）
- **engine:M19a** — NodeKindDescriptor 流程节点图形语义外壳层
- **app:M7** — 流程节点属性面板（Phase 1 过渡方案）
- **上游依赖**：M15（FlowSchema 执行）、A4（视图体系）、A4a（布局策略模式）、A3a（逐层激活策略）

---

## 现状分析

Phase 1 已实施：NodeView 渲染展示「色条 + emoji 图标 + 中文标题 + 摘要行」，前端 DOM 属性面板（FlowNodePropertyPanel）支持所有 22 种 kind 的参数编辑。

当前问题：kind 相关知识散落在 5 处——NodeView 内 4 个独立函数（`deriveAppearance`/`derivePortsFromSchema`/`deriveTitleFromSchema`/`deriveSummaryFromSchema`）的 switch/case + 前端 FlowNodePropertyPanel 的 switch/case。新增 kind 需改 5 处，无类型关联约束。

---

## Phase 1：摘要行 + DOM 属性面板（✅ 已完成）

### 1.1 节点摘要行

在 `NodeView._renderRect` 标题下方追加一行灰色小字（fontSize 10, fillStyle '#888'），由 `deriveSummaryFromSchema(schema)` 推导：

| kind        | 摘要示例                           |
| ----------- | ---------------------------------- |
| setVariable | `page.userName = "张三"`           |
| navigate    | `→ 订单详情页`                     |
| callFlow    | `📞 计算运费`                      |
| dbQuery     | `orders WHERE status == "pending"` |
| condition   | `count > 0 ?`                      |
| httpRequest | `POST /api/submit`                 |
| script      | `⚡ 自定义脚本`                    |
| 值节点      | 不加摘要（标题即变量名）           |

节点默认高度从 60 增加到 80，摘要行 y 偏移 = titleY + 18。

### 1.2 前端属性面板

#### 组件结构

```
FlowEditorPanel / FunctionsPage FlowEditor
├── Canvas（流程画布）
├── UnifiedMaterialPanel（物料抽屉）
└── FlowNodePropertyPanel（新增）
    ├── NodeHeader（节点类型图标 + kind 中文名 + 节点 ID）
    └── NodeFormBody（根据 kind 动态渲染）
        ├── SetVariableForm / NavigateForm / CallFlowForm / ...
        └── FlowValueEditor（复用组件）
            ├── SourceSegmented（literal | dataRef | pageDataRef | eventArg | nodeRef）
            └── ValueInput（根据来源动态切换）
```

#### 各 kind 表单字段映射

| kind        | 表单字段                                                         | 控件类型                                    |
| ----------- | ---------------------------------------------------------------- | ------------------------------------------- |
| setVariable | scope + key + value                                              | Select + Input + FlowValueEditor            |
| navigate    | pageId                                                           | Select（页面列表）                          |
| callFlow    | flowId + inputBindings + outputBindings                          | Select（云函数列表）+ 动态 key-value 表     |
| condition   | left + op + right                                                | FlowValueEditor + Select + FlowValueEditor  |
| dbQuery     | collection + filter + projection + sort + limit + outputVariable | Select + 动态 filter 编辑器 + Input         |
| dbInsert    | collection + document                                            | Select + 动态 key-value 表                  |
| dbUpdate    | collection + filter + update                                     | Select + 动态 filter + 动态 update          |
| dbDelete    | collection + filter                                              | Select + 动态 filter                        |
| httpRequest | url + method + headers + body + outputVariable                   | FlowValueEditor + Select + JSON 编辑器      |
| transform   | expression + variables + outputVariable                          | Input + 动态 key-value 表                   |
| script      | code + inputBindings + outputBindings + timeout                  | CodeEditor + 动态绑定表                     |
| setData     | viewId + key + value                                             | Select（视图列表）+ Input + FlowValueEditor |
| setVisible  | viewId + visible                                                 | Select + Switch                             |
| animate     | viewId + animationId                                             | Select + Select                             |
| delay       | ms                                                               | InputNumber                                 |
| forEach     | collection + itemVariable + indexVariable                        | FlowValueEditor + Input + Input             |
| parallel    | branches + joinMode + resultsVariable                            | 只读展示分支数 + Select + Input             |

#### FlowValue 来源候选数据获取

- `dataRef`：遍历当前 Scene 视图树，收集每个 View 的 data 字段键名 `{ viewId, viewName, keys: string[] }`
- `pageDataRef`：从 Scene.variables 获取页面级变量列表
- `eventArg`：从当前 FlowSchema 的触发事件类型推导可用参数
- `nodeRef`：从 FlowSchema.nodes 过滤值节点（variable/pageVar/eventParam），通过 edges 可达性判断仅展示上游值节点
- 云函数列表：从 applicationStore.cloudFunctions 获取
- 页面列表：从 App.scenes 获取
- 集合列表：从 applicationStore.collections 获取

#### 写回机制

表单 onChange → 更新 `NodeView.schema` 对应字段 → `app.notify()` 触发画布重绘（摘要行更新）。编辑通过 `beginPropertyEdit` / `commitPropertyEdit` 包装为事务。

---

## Phase 2：NodeKindDescriptor 驱动内嵌只读视图

### 2.1 类型总览

```
┌─────────────────────────────────────────────────────────────────────┐
│                     NodeKindDescriptor<K>                            │
│  （抽象基类，每个 FlowNode.kind 一个子类实例）                         │
├─────────────────────────────────────────────────────────────────────┤
│  kind: K                                                            │
│  shape: NodeShape                                                   │
│  accentColor: string                                                │
│  icon: string                                                       │
│  category: NodeCategory                                             │
├─────────────────────────────────────────────────────────────────────┤
│  getTitle(schema): string                                           │
│  getSummaryLines(schema): string[]                                  │
│  derivePorts(schema): PortDescriptor[]                              │
│  getFormFields(schema): FormFieldDescriptor[]                       │
│  validate(schema): ValidationResult                                 │
│  getPortConstraints(schema): PortConstraintMap                      │
└─────────────────────────────────────────────────────────────────────┘
         │ 消费者
         ├──▶ NodeView（Canvas 渲染壳）
         ├──▶ FlowNodePropertyPanel（React DOM 面板）
         └──▶ Phase 3 InlineFormRenderer（Canvas inline 控件）
```

### 2.2 核心类型定义

#### 枚举与常量

```typescript
/** 节点外框形状 */
export type NodeShape = 'rect' | 'diamond'
// pill 形状合并入 rect（值节点用小尺寸 rect + 紫色强调色替代）

/** 节点分类（用于物料面板分组、搜索过滤） */
export type NodeCategory =
  | 'control' // 流程控制：condition, delay, return, forEach, parallel
  | 'variable' // 变量操作：setVariable, variable, pageVar, eventParam
  | 'client' // 前端动作：setData, setVisible, navigate, animate
  | 'server' // 后端动作：dbQuery, dbInsert, dbUpdate, dbDelete, httpRequest, transform, script
  | 'subroutine' // 子程序：callFlow, subFlow

/** 端口方向 */
export type PortDirection = 'input' | 'output'

/** 端口语义类型 */
export type PortSemantic =
  | 'controlFlow' // 控制流端口（_in / _out）
  | 'branch' // 分支端口（_true / _false / _error）
  | 'dataIn' // 数据输入端口（参数槽，可被连线赋值）
  | 'dataOut' // 数据输出端口（值节点输出 / outputVariable）

/** 表单字段控件类型 */
export type FieldWidgetType =
  | 'text' // 单行文本输入
  | 'number' // 数字输入
  | 'switch' // 布尔开关
  | 'select' // 下拉选择
  | 'flowValue' // FlowValue 编辑器（5 种来源切换）
  | 'condition' // FlowCondition 编辑器（left + op + right）
  | 'code' // 代码编辑器（多行）
  | 'keyValueTable' // 动态 key-value 表
  | 'filterEditor' // 数据库 filter 编辑器（Record<string, FlowValue>）
  | 'flowSchema' // 内嵌子流程编辑器（forEach.body / subFlow.body / parallel.branches）
  | 'portList' // 动态端口列表编辑器（subFlow.inputs/outputs）

/** 选项来源（动态选项从运行时上下文获取） */
export type OptionsSource =
  | 'pages' // App.scenes 页面列表
  | 'collections' // applicationStore.collections 集合列表
  | 'cloudFunctions' // applicationStore.cloudFunctions 云函数列表
  | 'views' // 当前 Scene 视图树
  | 'variables' // 当前 Scene 页面变量
  | 'animations' // 目标 View 的动画列表
```

#### PortDescriptor（端口描述符）

```typescript
/**
 * 端口描述符 —— 描述一个端口的完整图形语义
 *
 * 端口是参数字段的图形化投影：
 * - 控制流端口（controlFlow/branch）不对应可编辑字段，位置固定
 * - 数据端口（dataIn/dataOut）对应某个表单字段，Phase 2/3 中锚定到该字段行
 */
export interface PortDescriptor {
  /** 端口 ID（全局唯一，遵循命名约定） */
  id: string

  /** 端口方向 */
  direction: PortDirection

  /** 端口语义类型 */
  semantic: PortSemantic

  /** 端口显示标签（Phase 2/3 在端口旁显示） */
  label?: string

  /**
   * 锚定的表单字段 key（仅 dataIn/dataOut 有值）
   * 对应 FormFieldDescriptor.key，Phase 2/3 中端口 y 坐标跟随该字段行
   */
  anchorField?: string

  /**
   * 分支标签（仅 branch 语义端口有值）
   * 对应 FlowEdge.branch 字段的合法值
   */
  branchLabel?: 'true' | 'false' | 'error'

  /** 最大连线数（默认 1，值节点输出为 Infinity） */
  maxConnections: number
}
```

#### FormFieldDescriptor（表单字段描述符）

```typescript
/**
 * 表单字段描述符 —— 描述一个可编辑参数的完整元数据
 *
 * 同时服务于：
 * - Phase 1: React DOM 面板渲染
 * - Phase 2: Canvas 只读文本行渲染
 * - Phase 3: Canvas inline 可编辑控件渲染
 */
export interface FormFieldDescriptor {
  /** 字段路径（对应 schema 中的属性路径，如 'value', 'condition.left', 'filter'） */
  key: string

  /** 中文标签 */
  label: string

  /** 控件类型 */
  widget: FieldWidgetType

  /** 静态选项列表（widget='select' 时使用） */
  options?: { value: string; label: string }[]

  /** 动态选项来源（widget='select' 时，优先于 options） */
  optionsSource?: OptionsSource

  /** 占位文本 */
  placeholder?: string

  /** 是否必填（validate 默认实现会检查） */
  required?: boolean

  /**
   * 关联的数据输入端口 ID
   * 当该端口有连线接入时：
   * - Phase 1: DOM 面板中该字段显示为"已连线"（只读）
   * - Phase 3: Canvas inline 控件隐藏，显示连线来源标签
   */
  boundPort?: string

  /**
   * 字段可见性条件（依赖其他字段的值）
   * 例如：setVariable 的 viewId 字段仅在 scope='view' 时显示
   */
  visibleWhen?: { field: string; equals: any }

  /**
   * 字段分组（用于 Phase 2/3 的视觉分组）
   * 同组字段在节点内渲染为一行或一个区块
   */
  group?: string

  /** 默认值（新建节点时的初始值） */
  defaultValue?: any

  /** 数字输入的范围约束 */
  min?: number
  max?: number
  step?: number
}
```

#### PortConstraintMap（端口连接约束）

```typescript
/**
 * 端口连接约束 —— 描述哪些端口之间可以合法连线
 *
 * 用于：
 * - 连线时的实时校验（拖拽连线到不合法端口时显示禁止图标）
 * - EdgeView 创建后的合法性检查
 */
export interface PortConstraint {
  /** 允许连接的对端端口语义类型 */
  acceptSemantics: PortSemantic[]

  /** 是否允许自连接（同一节点的端口互连） */
  allowSelfConnect: boolean

  /** 自定义校验（返回 null 表示合法，否则返回错误信息） */
  customValidate?: (sourcePort: PortDescriptor, targetPort: PortDescriptor) => string | null
}

/** portId → 该端口的连接约束 */
export type PortConstraintMap = Record<string, PortConstraint>
```

#### ValidationResult（校验结果）

```typescript
export interface ValidationError {
  /** 出错的字段路径 */
  field: string
  /** 错误信息 */
  message: string
  /** 严重程度 */
  severity: 'error' | 'warning'
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}
```

### 2.3 NodeKindDescriptor 抽象基类

```typescript
import type { FlowNode } from '@/flow/types/schema.js'

/**
 * NodeKindDescriptor —— 流程节点图形语义外壳层
 *
 * 每个 FlowNode.kind 对应一个 Descriptor 子类实例。
 * Descriptor 是无状态的纯描述对象——所有方法接收 schema 返回结果，
 * 不持有任何可变状态。
 *
 * 职责边界：
 * - ✅ 描述节点「长什么样」（外观、端口拓扑、摘要文本）
 * - ✅ 描述节点「怎么编辑」（表单字段、校验规则）
 * - ✅ 描述端口「怎么连」（连接约束）
 * - ❌ 不负责实际渲染（由 NodeView 消费 Descriptor 输出进行渲染）
 * - ❌ 不负责实际执行（由 FlowRunner 的 NodeExecutor 负责）
 * - ❌ 不持有运行时状态（schema 由 NodeView 持有并传入）
 */
export abstract class NodeKindDescriptor<K extends FlowNode['kind'] = FlowNode['kind']> {
  // ═══════════════════════════════════════════════════════════════
  // 静态属性（不依赖 schema 实例，构造时即确定）
  // ═══════════════════════════════════════════════════════════════

  /** 对应的 FlowNode.kind */
  abstract readonly kind: K

  /** 节点外框形状 */
  abstract readonly shape: NodeShape

  /** 强调色（rect 的左侧色条 / diamond 的边框色） */
  abstract readonly accentColor: string

  /** 图标 emoji */
  abstract readonly icon: string

  /** 节点分类 */
  abstract readonly category: NodeCategory

  // ═══════════════════════════════════════════════════════════════
  // 动态方法（依赖 schema 实例，每次 schema 变化时重新调用）
  // ═══════════════════════════════════════════════════════════════

  /**
   * 节点标题
   * 大多数 kind 返回固定字符串（如"设置变量"），
   * 少数 kind 依赖 schema（如 subFlow 返回 schema.name）
   */
  abstract getTitle(schema: Extract<FlowNode, { kind: K }>): string

  /**
   * Canvas 摘要行（标题下方的灰色小字）
   * 返回空数组表示不显示摘要。
   * 每个元素是一行文本，NodeView 逐行渲染。
   */
  abstract getSummaryLines(schema: Extract<FlowNode, { kind: K }>): string[]

  /**
   * 端口拓扑定义
   *
   * 返回该节点的所有端口（含控制流 + 数据流）。
   * 动态端口（subFlow/callFlow）根据 schema 实例生成。
   *
   * 端口 ID 命名约定（向后兼容，EdgeView 依赖）：
   * - 控制流入口：`${nodeId}_in`
   * - 控制流出口：`${nodeId}_out`
   * - 条件分支：`${nodeId}_true` / `${nodeId}_false`
   * - 异常分支：`${nodeId}_error`
   * - 值节点输出：`${nodeId}_out`（maxConnections=Infinity）
   * - subFlow 动态入：`${nodeId}_param_${inputName}`
   * - subFlow 动态出：`${nodeId}_result_${outputName}`
   */
  abstract derivePorts(schema: Extract<FlowNode, { kind: K }>): PortDescriptor[]

  /**
   * 表单字段描述
   *
   * 返回该 kind 所有可编辑参数的元数据。
   * 顺序即为 Phase 2/3 中参数行的渲染顺序。
   * Phase 1 DOM 面板和 Phase 3 Canvas inline 都消费同一份描述。
   */
  abstract getFormFields(schema: Extract<FlowNode, { kind: K }>): FormFieldDescriptor[]

  /**
   * 端口连接约束
   *
   * 默认实现：
   * - controlFlow 端口只接受 controlFlow
   * - dataIn 接受 dataOut
   * - branch 只接受 controlFlow
   * - 不允许自连接
   */
  getPortConstraints(schema: Extract<FlowNode, { kind: K }>): PortConstraintMap {
    const ports = this.derivePorts(schema)
    const map: PortConstraintMap = {}
    for (const port of ports) {
      switch (port.semantic) {
        case 'controlFlow':
          map[port.id] = { acceptSemantics: ['controlFlow', 'branch'], allowSelfConnect: false }
          break
        case 'branch':
          map[port.id] = { acceptSemantics: ['controlFlow'], allowSelfConnect: false }
          break
        case 'dataIn':
          map[port.id] = { acceptSemantics: ['dataOut'], allowSelfConnect: false }
          break
        case 'dataOut':
          map[port.id] = { acceptSemantics: ['dataIn'], allowSelfConnect: false }
          break
      }
    }
    return map
  }

  /**
   * 参数完整性校验
   *
   * 默认实现：检查所有 required 字段是否非空。
   * 子类可 override 添加业务校验（如 httpRequest 的 URL 格式）。
   */
  validate(schema: Extract<FlowNode, { kind: K }>): ValidationResult {
    const fields = this.getFormFields(schema)
    const errors: ValidationError[] = []
    for (const field of fields) {
      if (field.required) {
        const value = getNestedValue(schema, field.key)
        if (value === undefined || value === null || value === '') {
          errors.push({
            field: field.key,
            message: `${field.label}不能为空`,
            severity: 'error',
          })
        }
      }
    }
    return { valid: errors.length === 0, errors }
  }
}

/** 按路径从对象中取值 */
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((o, k) => o?.[k], obj)
}
```

### 2.4 NodeKindRegistry（注册表）

```typescript
import type { FlowNode } from '@/flow/types/schema.js'

class NodeKindRegistry {
  private _map = new Map<string, NodeKindDescriptor>()

  register(descriptor: NodeKindDescriptor): void {
    if (this._map.has(descriptor.kind)) {
      throw new Error(`Duplicate descriptor for kind: ${descriptor.kind}`)
    }
    this._map.set(descriptor.kind, descriptor)
  }

  get<K extends FlowNode['kind']>(kind: K): NodeKindDescriptor<K> {
    const desc = this._map.get(kind)
    if (!desc) throw new Error(`No descriptor for kind: ${kind}`)
    return desc as NodeKindDescriptor<K>
  }

  has(kind: string): boolean {
    return this._map.has(kind)
  }

  /** 按分类获取所有 Descriptor（物料面板分组用） */
  getByCategory(category: NodeCategory): NodeKindDescriptor[] {
    return [...this._map.values()].filter((d) => d.category === category)
  }

  /** 获取所有已注册的 kind 列表 */
  getAllKinds(): string[] {
    return [...this._map.keys()]
  }
}

/** 全局单例 */
export const nodeKindRegistry = new NodeKindRegistry()
```

### 2.5 目录结构

```
packages/banvasgl/src/view/FlowViews/nodeKinds/
├── index.ts                        # NodeKindRegistry + 全量注册 + 公共导出
├── NodeKindDescriptor.ts           # 抽象基类
├── types.ts                        # FormFieldDescriptor / PortDescriptor / ValidationResult 等类型
├── shared/                         # 共享动作节点 Descriptor
│   ├── ConditionDescriptor.ts
│   ├── DelayDescriptor.ts
│   ├── SetVariableDescriptor.ts
│   ├── CallFlowDescriptor.ts
│   ├── SubFlowDescriptor.ts
│   ├── ReturnDescriptor.ts
│   ├── ForEachDescriptor.ts
│   └── ParallelDescriptor.ts
├── client/                         # 前端动作节点 Descriptor
│   ├── SetDataDescriptor.ts
│   ├── NavigateDescriptor.ts
│   ├── AnimateDescriptor.ts
│   └── SetVisibleDescriptor.ts
├── server/                         # 后端动作节点 Descriptor
│   ├── DbQueryDescriptor.ts
│   ├── DbInsertDescriptor.ts
│   ├── DbUpdateDescriptor.ts
│   ├── DbDeleteDescriptor.ts
│   ├── HttpRequestDescriptor.ts
│   ├── TransformDescriptor.ts
│   └── ScriptDescriptor.ts
└── value/                          # 值节点 Descriptor
    ├── VariableDescriptor.ts
    ├── PageVarDescriptor.ts
    └── EventParamDescriptor.ts
```

### 2.6 具体 Descriptor 示例

#### ConditionDescriptor（菱形节点，分支端口）

```typescript
export class ConditionDescriptor extends NodeKindDescriptor<'condition'> {
  readonly kind = 'condition'
  readonly shape = 'diamond'
  readonly accentColor = '#f59e0b'
  readonly icon = '⟋'
  readonly category = 'control'

  getTitle(): string {
    return '条件分支'
  }

  getSummaryLines(schema): string[] {
    const { left, op, right } = schema.condition
    return [`${flowValueToString(left)} ${op} ${flowValueToString(right)} ?`]
  }

  derivePorts(schema): PortDescriptor[] {
    const id = schema.id
    return [
      { id: `${id}_in`, direction: 'input', semantic: 'controlFlow', maxConnections: Infinity },
      {
        id: `${id}_true`,
        direction: 'output',
        semantic: 'branch',
        label: 'true',
        branchLabel: 'true',
        maxConnections: 1,
      },
      {
        id: `${id}_false`,
        direction: 'output',
        semantic: 'branch',
        label: 'false',
        branchLabel: 'false',
        maxConnections: 1,
      },
      {
        id: `${id}_error`,
        direction: 'output',
        semantic: 'branch',
        label: 'error',
        branchLabel: 'error',
        maxConnections: 1,
      },
      // 数据端口：condition.left 和 condition.right 可通过连线赋值
      {
        id: `${id}_left`,
        direction: 'input',
        semantic: 'dataIn',
        label: 'left',
        anchorField: 'condition.left',
        maxConnections: 1,
      },
      {
        id: `${id}_right`,
        direction: 'input',
        semantic: 'dataIn',
        label: 'right',
        anchorField: 'condition.right',
        maxConnections: 1,
      },
    ]
  }

  getFormFields(schema): FormFieldDescriptor[] {
    return [
      {
        key: 'condition.left',
        label: '左值',
        widget: 'flowValue',
        required: true,
        boundPort: `${schema.id}_left`,
      },
      {
        key: 'condition.op',
        label: '运算符',
        widget: 'select',
        required: true,
        options: [
          { value: '==', label: '等于 ==' },
          { value: '!=', label: '不等于 !=' },
          { value: '>', label: '大于 >' },
          { value: '>=', label: '大于等于 >=' },
          { value: '<', label: '小于 <' },
          { value: '<=', label: '小于等于 <=' },
        ],
      },
      {
        key: 'condition.right',
        label: '右值',
        widget: 'flowValue',
        required: true,
        boundPort: `${schema.id}_right`,
      },
    ]
  }
}
```

#### SubFlowDescriptor（动态端口）

```typescript
export class SubFlowDescriptor extends NodeKindDescriptor<'subFlow'> {
  readonly kind = 'subFlow'
  readonly shape = 'rect'
  readonly accentColor = '#6366f1'
  readonly icon = '⊞'
  readonly category = 'subroutine'

  getTitle(schema): string {
    return schema.name || '子流程'
  }

  getSummaryLines(schema): string[] {
    return [`${schema.inputs.length} 入 / ${schema.outputs.length} 出`]
  }

  derivePorts(schema): PortDescriptor[] {
    const id = schema.id
    const ports: PortDescriptor[] = [
      { id: `${id}_in`, direction: 'input', semantic: 'controlFlow', maxConnections: Infinity },
      { id: `${id}_out`, direction: 'output', semantic: 'controlFlow', maxConnections: 1 },
    ]
    // 动态数据输入端口
    for (const input of schema.inputs) {
      ports.push({
        id: `${id}_param_${input.name}`,
        direction: 'input',
        semantic: 'dataIn',
        label: input.name,
        anchorField: `inputs.${input.name}`,
        maxConnections: 1,
      })
    }
    // 动态数据输出端口
    for (const output of schema.outputs) {
      ports.push({
        id: `${id}_result_${output.name}`,
        direction: 'output',
        semantic: 'dataOut',
        label: output.name,
        anchorField: `outputs.${output.name}`,
        maxConnections: Infinity,
      })
    }
    return ports
  }

  getFormFields(schema): FormFieldDescriptor[] {
    return [
      { key: 'name', label: '子流程名称', widget: 'text', required: true },
      { key: 'inputs', label: '输入端口', widget: 'portList' },
      { key: 'outputs', label: '输出端口', widget: 'portList' },
      { key: 'body', label: '子流程体', widget: 'flowSchema' },
    ]
  }
}
```

#### HttpRequestDescriptor（多字段 + 数据端口）

```typescript
export class HttpRequestDescriptor extends NodeKindDescriptor<'httpRequest'> {
  readonly kind = 'httpRequest'
  readonly shape = 'rect'
  readonly accentColor = '#f97316'
  readonly icon = '⇄'
  readonly category = 'server'

  getTitle(): string {
    return 'HTTP 请求'
  }

  getSummaryLines(schema): string[] {
    return [`${schema.method} ${flowValueToString(schema.url)}`]
  }

  derivePorts(schema): PortDescriptor[] {
    const id = schema.id
    return [
      // 控制流
      { id: `${id}_in`, direction: 'input', semantic: 'controlFlow', maxConnections: Infinity },
      { id: `${id}_out`, direction: 'output', semantic: 'controlFlow', maxConnections: 1 },
      {
        id: `${id}_error`,
        direction: 'output',
        semantic: 'branch',
        branchLabel: 'error',
        label: 'error',
        maxConnections: 1,
      },
      // 数据输入端口
      {
        id: `${id}_url`,
        direction: 'input',
        semantic: 'dataIn',
        label: 'url',
        anchorField: 'url',
        maxConnections: 1,
      },
      {
        id: `${id}_body`,
        direction: 'input',
        semantic: 'dataIn',
        label: 'body',
        anchorField: 'body',
        maxConnections: 1,
      },
      // 数据输出端口
      {
        id: `${id}_result`,
        direction: 'output',
        semantic: 'dataOut',
        label: 'response',
        anchorField: 'outputVariable',
        maxConnections: Infinity,
      },
    ]
  }

  getFormFields(schema): FormFieldDescriptor[] {
    return [
      {
        key: 'method',
        label: '请求方法',
        widget: 'select',
        required: true,
        options: [
          { value: 'GET', label: 'GET' },
          { value: 'POST', label: 'POST' },
          { value: 'PUT', label: 'PUT' },
          { value: 'DELETE', label: 'DELETE' },
          { value: 'PATCH', label: 'PATCH' },
        ],
      },
      { key: 'url', label: '请求地址', widget: 'flowValue', required: true, boundPort: `${schema.id}_url` },
      { key: 'headers', label: '请求头', widget: 'keyValueTable' },
      { key: 'body', label: '请求体', widget: 'flowValue', boundPort: `${schema.id}_body` },
      {
        key: 'outputVariable',
        label: '结果变量名',
        widget: 'text',
        required: true,
        placeholder: '如 response',
      },
    ]
  }
}
```

#### VariableDescriptor（值节点，仅输出端口）

```typescript
export class VariableDescriptor extends NodeKindDescriptor<'variable'> {
  readonly kind = 'variable'
  readonly shape = 'rect' // 小尺寸 rect + 紫色强调色
  readonly accentColor = '#8b5cf6'
  readonly icon = '◈'
  readonly category = 'variable'

  getTitle(): string {
    return 'View 变量'
  }

  getSummaryLines(schema): string[] {
    return [`${schema.viewId}.${schema.key}`]
  }

  derivePorts(schema): PortDescriptor[] {
    return [
      {
        id: `${schema.id}_out`,
        direction: 'output',
        semantic: 'dataOut',
        label: 'value',
        maxConnections: Infinity,
      },
    ]
  }

  getFormFields(schema): FormFieldDescriptor[] {
    return [
      { key: 'viewId', label: '视图', widget: 'select', optionsSource: 'views', required: true },
      { key: 'key', label: '变量名', widget: 'text', required: true },
    ]
  }
}
```

### 2.7 消费方式

#### NodeView 消费（Canvas 渲染）

```typescript
// NodeView 构造时
const descriptor = nodeKindRegistry.get(schema.kind)

// 外观
this.appearance = { shape: descriptor.shape, accentColor: descriptor.accentColor, icon: descriptor.icon }
this.nodeTitle = descriptor.getTitle(schema)

// 端口
const portDescs = descriptor.derivePorts(schema)
this._buildPorts(portDescs, nodeW, nodeH)

// 渲染时
renderContent(ctx) {
    // 按 shape 画外框（通用逻辑，不 switch kind）
    if (this.appearance.shape === 'diamond') this._renderDiamond(ctx)
    else this._renderRect(ctx)

    // 摘要行
    const lines = descriptor.getSummaryLines(this.schema)
    this._renderSummaryLines(ctx, lines)
}
```

#### FlowNodePropertyPanel 消费（React DOM）

```typescript
// React 组件
const descriptor = nodeKindRegistry.get(node.kind)
const fields = descriptor.getFormFields(node)

return fields.map(field => {
    // 检查可见性条件
    if (field.visibleWhen && getNestedValue(node, field.visibleWhen.field) !== field.visibleWhen.equals) {
        return null
    }
    // 检查是否被连线覆盖
    if (field.boundPort && isPortConnected(field.boundPort, edges)) {
        return <ConnectedIndicator label={getSourceNodeLabel(field.boundPort, edges)} />
    }
    // 按 widget 类型渲染对应控件
    switch (field.widget) {
        case 'flowValue': return <FlowValueEditor ... />
        case 'select':    return <Select options={resolveOptions(field)} ... />
        case 'text':      return <Input ... />
        // ...
    }
})
```

#### 连线校验消费

```typescript
// 用户拖拽连线时
function canConnect(sourcePortId: string, targetPortId: string): string | null {
  const sourceNode = findNodeByPortId(sourcePortId)
  const targetNode = findNodeByPortId(targetPortId)

  const sourceDesc = nodeKindRegistry.get(sourceNode.kind)
  const targetDesc = nodeKindRegistry.get(targetNode.kind)

  const sourceConstraints = sourceDesc.getPortConstraints(sourceNode)
  const targetConstraints = targetDesc.getPortConstraints(targetNode)

  const sourcePort = sourceDesc.derivePorts(sourceNode).find((p) => p.id === sourcePortId)!
  const targetPort = targetDesc.derivePorts(targetNode).find((p) => p.id === targetPortId)!

  // 检查目标端口是否接受源端口的语义类型
  const targetConstraint = targetConstraints[targetPortId]
  if (!targetConstraint.acceptSemantics.includes(sourcePort.semantic)) {
    return `端口类型不兼容：${sourcePort.semantic} → ${targetPort.semantic}`
  }

  // 检查自连接
  if (sourceNode.id === targetNode.id && !targetConstraint.allowSelfConnect) {
    return '不允许自连接'
  }

  // 检查最大连线数
  const currentConnections = countConnections(targetPortId, edges)
  if (currentConnections >= targetPort.maxConnections) {
    return '该端口已达最大连线数'
  }

  return null // 合法
}
```

### 2.8 与 EdgeView / PortView 的协作关系

#### PortView 的变化

当前 PortView 只持有 `id`、`direction`、`maxConnections`。引入 Descriptor 后增加：

```typescript
class PortView {
  // 新增字段（从 PortDescriptor 传入）
  semantic: PortSemantic
  label?: string
  anchorField?: string
  branchLabel?: 'true' | 'false' | 'error'
}
```

PortView 的渲染可根据 `semantic` 区分样式：

- `controlFlow`：灰色圆点
- `branch`：带标签的彩色圆点（true=绿, false=红, error=橙）
- `dataIn`/`dataOut`：蓝色菱形或三角形（区分数据流和控制流）

#### EdgeView 不变

EdgeView 的渲染逻辑保持通用——它只关心两端 PortView 的世界坐标，画贝塞尔曲线。边的语义已由 FlowEdge 数据结构承载，不需要 Descriptor 参与。

> ⚠️ 对齐 C15（FlowSchema 图结构契约）：边已从旧的单一 `FlowEdge { branch?; toParam? }` 升级为**显式分型**判别联合 `ControlEdge | ErrorEdge | DataEdge`（详见 `flow-graph-structure.md`）。EdgeView 据 `edgeKind` 区分渲染样式（控制边=灰/分支彩色、数据边=蓝色双色 pin），不再靠 `branch`/`toParam` 可选字段推断。

#### 端口布局（Phase 2/3）

NodeView 布局端口时，根据 `PortDescriptor.anchorField` 查找对应的参数行 y 坐标：

```typescript
// Phase 2/3 端口布局
for (const portDesc of descriptor.derivePorts(schema)) {
  const portView = this.findChild(portDesc.id)
  if (portDesc.anchorField) {
    // 数据端口：锚定到对应参数行
    const fieldRow = this._contentContainer.getRowByFieldKey(portDesc.anchorField)
    portView.setY(fieldRow.centerY)
  } else {
    // 控制流端口：固定位置（顶部/底部）
    // ...保持当前均匀分布逻辑
  }
}
```

### 2.9 22 个 kind 的 Descriptor 概览

| kind        | shape   | category   | 静态端口                       | 动态端口                                       | 数据端口                                |
| ----------- | ------- | ---------- | ------------------------------ | ---------------------------------------------- | --------------------------------------- |
| condition   | diamond | control    | \_in, \_true, \_false, \_error | —                                              | \_left(in), \_right(in)                 |
| delay       | rect    | control    | \_in, \_out, \_error           | —                                              | —                                       |
| return      | rect    | control    | \_in                           | —                                              | \_outputValue(in) 可选                  |
| forEach     | rect    | control    | \_in, \_out, \_error           | —                                              | \_collection(in)                        |
| parallel    | rect    | control    | \_in, \_out, \_error           | —                                              | —                                       |
| setVariable | rect    | variable   | \_in, \_out, \_error           | —                                              | \_value(in)                             |
| variable    | rect    | variable   | \_out(∞)                       | —                                              | —                                       |
| pageVar     | rect    | variable   | \_out(∞)                       | —                                              | —                                       |
| eventParam  | rect    | variable   | \_out(∞)                       | —                                              | —                                       |
| setData     | rect    | client     | \_in, \_out, \_error           | —                                              | \_value(in)                             |
| setVisible  | rect    | client     | \_in, \_out, \_error           | —                                              | —                                       |
| navigate    | rect    | client     | \_in, \_out, \_error           | —                                              | —                                       |
| animate     | rect    | client     | \_in, \_out, \_error           | —                                              | —                                       |
| dbQuery     | rect    | server     | \_in, \_out, \_error           | —                                              | filter values(in), \_result(out)        |
| dbInsert    | rect    | server     | \_in, \_out, \_error           | —                                              | document values(in), \_result(out)      |
| dbUpdate    | rect    | server     | \_in, \_out, \_error           | —                                              | filter+update values(in), \_result(out) |
| dbDelete    | rect    | server     | \_in, \_out, \_error           | —                                              | filter values(in), \_result(out)        |
| httpRequest | rect    | server     | \_in, \_out, \_error           | —                                              | \_url(in), \_body(in), \_result(out)    |
| transform   | rect    | server     | \_in, \_out, \_error           | —                                              | variables values(in), \_result(out)     |
| script      | rect    | server     | \_in, \_out, \_error           | —                                              | inputBindings(in), outputBindings(out)  |
| callFlow    | rect    | subroutine | \_in, \_out, \_error           | inputBindings(in) × N, outputBindings(out) × N | —                                       |
| subFlow     | rect    | subroutine | \_in, \_out                    | _param__(in) × N, *result*_(out) × N           | —                                       |

### 2.10 NodeView 重构为通用渲染壳

Phase 2 中 NodeView 的 `renderContent` 不再调用散落的 derive 函数，而是统一通过 Descriptor。原有的 `deriveAppearance`/`derivePortsFromSchema`/`deriveTitleFromSchema`/`deriveSummaryFromSchema` 四个函数删除，逻辑迁移到各 Descriptor 子类中。

### 2.11 内嵌只读视图

NodeView 内部新增一个 CombinedView（layoutMode='flex', direction='column'）作为内容容器，持有标题行 + 参数行。每行由 TextView（editable=false）+ 标签视图组成。

关键变更：

- PortView 不放入内容容器，仍由 NodeView 直接管理（绝对定位）
- PortView 的 y 坐标锚定到对应参数行的垂直中心（通过 `PortDescriptor.anchorField` 映射）
- 节点高度由内容容器 computedHeight 驱动自适应
- 点击参数行仍跳转侧面板编辑（Phase 2 不支持就地编辑）

### 2.12 实施步骤

1. 创建 `nodeKinds/` 目录，实现 `NodeKindDescriptor` 基类和 `types.ts`
2. 将 `flowValueToString`/`conditionToString` 提取为 `nodeKindUtils.ts` 共享工具
3. 逐个实现 22 个 Descriptor 子类（可按 shared → client → server → value 顺序）
4. 实现 `NodeKindRegistry`（index.ts）
5. 重构 NodeView：删除 4 个 derive 函数，改为通过 Descriptor 获取所有信息
6. 重构前端 FlowNodePropertyPanel：删除 switch kind，改为消费 `getFormFields()`
7. 实现 NodeView 内嵌 CombinedView 只读内容容器
8. 实现端口锚定（PortView y 坐标跟随参数行）
9. 验证 EdgeView 贝塞尔曲线在端口位置变化后正确重算

### 2.13 验收标准

- `pnpm build:all` 零错误
- 新增 kind 只需新增一个 Descriptor 文件 + 注册一行，不修改 NodeView/Panel
- NodeView 渲染结果与 Phase 1 视觉一致（回归验证）
- 前端 Panel 功能与 Phase 1 一致（回归验证）
- 端口位置正确锚定到参数行

### 2.14 设计决策摘要

| 决策点                        | 选择                                        | 理由                                         |
| ----------------------------- | ------------------------------------------- | -------------------------------------------- |
| pill 形状                     | 合并入 rect                                 | 减少形状种类，值节点用小尺寸 + 紫色区分      |
| Descriptor 放置位置           | view/FlowViews/nodeKinds/                   | 图形语义归 view 层，flow 层不反向依赖        |
| 端口语义分类                  | 4 种（controlFlow/branch/dataIn/dataOut）   | 覆盖所有连线场景，连线校验可基于语义自动推导 |
| FormFieldDescriptor.boundPort | 字段级关联端口                              | 实现"连线覆盖默认值"的 Blender 语义          |
| 动态端口                      | derivePorts 接收 schema 实例                | subFlow/callFlow 端口数量由用户定义          |
| 校验                          | 基类提供默认 required 检查，子类可 override | 渐进增强，不阻塞初期实现                     |
| EdgeView 不需要 Descriptor    | 边渲染通用                                  | 贝塞尔曲线不因 kind 而异                     |

---

## Phase 3：内嵌可编辑控件（终极目标）

### Canvas-native 表单视图体系

基于 TextView 已有能力扩展：

| 控件            | 基础               | 核心能力                                             |
| --------------- | ------------------ | ---------------------------------------------------- |
| InputView       | 继承/组合 TextView | 单行输入、聚焦光标、placeholder、验证状态            |
| SelectView      | 新视图             | 点击展开选项列表（CombinedView list 布局），选中高亮 |
| SliderView      | 新视图             | 拖拽调值，数值映射                                   |
| FlowValuePicker | 组合视图           | Segmented 来源切换 + 对应值编辑器动态替换            |

### Descriptor 驱动 inline 渲染

NodeView 内嵌的 CombinedView 从只读升级为可编辑。每个参数行根据 `FormFieldDescriptor.widget` 实例化对应的 Canvas-native 控件：

```typescript
for (const field of descriptor.getFormFields(schema)) {
  const row = createFieldRow(field) // 根据 field.widget 创建 InputView/SelectView/FlowValuePicker
  contentContainer.addChild(row)
}
```

### 连线状态驱动控件可见性

输入端口有连线接入时，对应参数行的编辑控件隐藏（或置灰显示连线来源节点名称），无连线时显示可编辑控件。通过 `FormFieldDescriptor.boundPort` 关联端口 ID，NodeView 监听 EdgeView 连接变化事件。

### 端口-参数行锚定

端口不再均匀分布，而是锚定到对应参数行垂直中心。参数行增减时端口位置跟随重算，EdgeView 重新计算贝塞尔曲线。

### 焦点管理扩展

当前 `text-selecting` 交互状态只识别 `ViewType.TEXTVIEW`。NodeView 内嵌 InputView 后，InteractionStateMachine 的逐层激活策略（A3a）需能穿透 NodeView 到达内部可编辑子视图。流程画布需启用 `textInput` 能力。

### 各 kind 节点的参数行 & 端口锚定映射

| kind        | 参数行                                                   | 输入端口锚定                 | 输出端口锚定                  |
| ----------- | -------------------------------------------------------- | ---------------------------- | ----------------------------- |
| setVariable | scope 下拉 + key 输入 + value FlowValuePicker            | value → 左侧输入端口         | —                             |
| navigate    | pageId 页面选择器                                        | —                            | —                             |
| callFlow    | flowId 云函数选择器 + inputBindings 动态行               | 每个 inputBinding → 左侧端口 | 每个 outputBinding → 右侧端口 |
| condition   | left FlowValuePicker + op 下拉 + right FlowValuePicker   | left/right → 左侧端口        | true/false → 右侧端口         |
| dbQuery     | collection 选择器 + filter 动态行 + outputVariable       | filter values → 左侧端口     | result → 右侧端口             |
| httpRequest | url FlowValuePicker + method 下拉 + body FlowValuePicker | url/body → 左侧端口          | result → 右侧端口             |
| script      | code 多行编辑器（折叠态显示摘要）                        | inputBindings → 左侧端口     | outputBindings → 右侧端口     |

### 侧面板降级

Phase 3 完成后，DOM 属性面板降级为「高级设置」入口，仅处理 script code 编辑、复杂嵌套 filter 等重型场景。

---

## 影响范围

| 阶段    | 涉及文件/模块                                                                                                                                                  |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 2 | `packages/banvasgl/src/view/FlowViews/nodeKinds/`（新增）、`NodeView.ts`（重构）、`apps/banyan/frontend/src/components/FlowKit/FlowNodePropertyPanel/`（重构） |
| Phase 3 | `packages/banvasgl/src/view/` 新增 InputView/SelectView/FlowValuePicker、NodeView 内嵌可编辑容器、InteractionStateMachine 焦点穿透                             |
