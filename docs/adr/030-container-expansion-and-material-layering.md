# ADR-030：基础容器扩展与物料分层体系

**状态**：已废弃（被 ADR-031 取代）  
**决策日期**：2025-07-14  
**废弃日期**：2025-07-15  
**决策者**：陈班

> **实现说明**：ADR-031 的最终实现是 **CombinedView + `style.layoutMode` 属性**（`'free' | 'flex' | 'list' | 'grid'`），不存在独立的 FlexView 类。本 ADR 中所有对 FlexView 的引用均已被 CombinedView 的 `layoutMode='flex'` 模式取代，相关布局参数存放在 `style.flexLayout`（`IFlexLayout`）中。

---

## 背景

BanvasGL 当前有两个布局容器：CombinedView（自由定位/绝对层叠）和 FlexView（单轴弹性布局，对标 Flutter Row/Column）。对于一个低代码应用构建平台而言，这两个容器不足以覆盖常见的 UI 模式——缺少滚动、虚拟化列表、二维网格等能力。

与此同时，表单类控件（单选/多选/下拉/日期选择等）和高级交互模式（Tab 切换、折叠面板、步骤向导等）也是用户高频需求。需要建立一个清晰的分层标准：什么写进引擎核心（ContainerView 子类），什么作为官方物料提供。

### 判定原则

跨 Flutter、SwiftUI、Figma、Retool 四大体系研究后，确立三条纳入引擎核心的必要条件（满足任一即为引擎原语）：

1. **布局算法不可组合性**：该容器定义了不可用现有容器嵌套模拟的空间分配算法
2. **性能不可替代性**：需要与渲染管线深度集成（视口裁剪、按需实例化/回收、滚动惯性物理）
3. **约束传递特殊语义**：对子元素的约束协商方式与现有容器本质不同，无法通过参数配置覆盖

不满足以上任何一条的，归入官方物料层——通过组合已有引擎容器 + FlowSchema 事件系统实现。

---

## 决策

### 决策一：FlexView 扩展 wrap 属性（流式布局）

WrapView 的核心能力（自动换行）可以通过在 FlexView 上新增 `wrap` 属性实现，不需要独立的 ContainerView 子类。原因：

- Wrap 布局的算法本质是「沿主轴排列，超出容器宽度时折行」，这是 Flex 布局的自然延伸
- CSS flexbox 正是通过 `flex-wrap: wrap` 在同一容器内实现换行
- Flutter 虽然分离了 Wrap widget，但其布局协议与 Flex 高度同构
- 保持 ViewType 数量精简（不增加新 type），降低序列化/AI 感知复杂度

**IFlexStyle 扩展**：

```typescript
interface IFlexStyle {
    direction: 'row' | 'column'
    gap: number
    mainAxisAlignment: 'start' | 'center' | 'end' | 'spaceBetween' | 'spaceAround'
    crossAxisAlignment: 'start' | 'center' | 'end' | 'stretch'
    padding: number | [number, number, number, number]
    // 新增
    wrap: boolean           // 默认 false，开启后子元素超出时自动换行
    lineGap?: number        // 换行后行间距（wrap=true 时生效），默认与 gap 一致
}
```

布局算法变更：`FlexView.layout()` 中，当 `wrap=true` 时切换为流式布局逻辑——累计子元素主轴尺寸，超出容器约束时开始新行/列。

### 决策二：新增 ScrollView 引擎容器

**ViewType**：`SCROLLVIEW`

**必须为引擎原语的原因**：

- 需要 overflow 裁剪（超出边界的子视图不渲染/不响应事件），这是渲染管线级能力
- 滚动物理（惯性、弹性边界、减速曲线）需要集成到引擎的 AnimationLoop
- 滚动条渲染需要引擎层 overlay 支持
- 触摸/滚轮事件消费与冒泡需要特殊处理（嵌套 ScrollView 的事件抢夺）

**核心接口**：

```typescript
interface IScrollStyle {
    direction: 'vertical' | 'horizontal' | 'both'
    showScrollbar: boolean
    bounces: boolean          // 弹性边界效果
    scrollbarAutoHide: boolean
}
```

**子元素管理**：ScrollView 继承 ContainerView，内部有唯一的「内容容器」概念——所有子元素放在一个虚拟的内容区中，内容区尺寸由子元素总尺寸决定，ScrollView 本身是视口窗口。

**设计态行为**：设计态下展示全部内容（不裁剪），但用半透明遮罩标示视口边界，方便用户编辑超出视口的内容。运行态启用真实滚动裁剪。

### 决策三：新增 ListView 引擎容器

**ViewType**：`LISTVIEW`

**必须为引擎原语的原因**：

- 虚拟化渲染（只实例化视口内 + 缓冲区的子项）是 Canvas 2D 引擎的性能硬需求
- 子项回收/复用机制需要与 Scene 的 View 生命周期管理深度集成
- 数据驱动的子项生成（通过 `dataSource` + `itemTemplate` 模式）需要引擎层协调

**核心接口**：

```typescript
interface IListStyle {
    direction: 'vertical' | 'horizontal'
    itemGap: number
    padding: number | [number, number, number, number]
    // 虚拟化参数
    overscanCount: number     // 视口外预渲染条数（默认 5）
}

// ListView 特有的数据绑定
interface IListViewData {
    dataSource: string        // 绑定的数据集合名称（引用 Scene 的 data 层）
    itemTemplate: string      // 子项物料 ID 或内联 View JSON
}
```

**与 ScrollView 的关系**：ListView 内置滚动能力（不需要外包 ScrollView）。它是「ScrollView + 虚拟化 + 数据驱动子项」的一体化容器。

**设计态行为**：展示前 N 条样例数据（可配置 `designTimeCount`），用户编辑 itemTemplate 时操作的是模板视图，运行态按数据源实例化。

### 决策四：新增 GridView 引擎容器

**ViewType**：`GRIDVIEW`

**必须为引擎原语的原因**：

- 二维网格布局算法（行列轨道定义 + 单元格跨越 + 轨道自适应尺寸）无法用 FlexView 嵌套模拟
- FlexView 嵌套方案（Row 里放 Column）无法实现「某个子项跨 2 列」的语义
- 网格对齐辅助线渲染需要引擎层支持（设计态）

**核心接口**：

```typescript
interface IGridStyle {
    columns: GridTrackDefinition[]   // 列轨道定义
    rows: GridTrackDefinition[]      // 行轨道定义（可选，默认按需生成）
    columnGap: number
    rowGap: number
    padding: number | [number, number, number, number]
    autoFlow: 'row' | 'column'      // 自动放置方向
}

// 轨道定义
type GridTrackDefinition = 
    | { type: 'fixed', value: number }          // 固定像素
    | { type: 'fraction', value: number }       // fr 单位（弹性）
    | { type: 'auto' }                          // 内容自适应
    | { type: 'minmax', min: number, max: number }

// 子项布局参数（挂在 View.layoutParams）
interface IGridLayoutParams {
    column?: number           // 起始列（0-based）
    row?: number              // 起始行（0-based）
    columnSpan?: number       // 跨列数（默认 1）
    rowSpan?: number          // 跨行数（默认 1）
}
```

**设计态交互**：拖拽子视图到网格中时，自动吸附到最近的单元格。网格线可视化显示，支持拖拽调整轨道宽度。

### 决策五：表单体系为官方物料

表单不作为引擎原语，原因：

- 表单的核心价值在于**逻辑语义**（验证规则、提交行为、字段联动），不在于布局算法
- 表单的布局可以完全由 FlexView(column) 或 GridView 实现
- 同一套表单字段可能有完全不同的布局方式（单列、双列、行内），不适合硬编码布局逻辑

**表单容器（FormContainer）**——官方物料：

```
FormContainer 物料
├── 布局：FlexView(column) 或 GridView（用户可选）
├── 逻辑：onSubmit / onReset / onValidate（FlowSchema 事件）
├── 数据：formData 对象（管理所有字段值）
└── 验证：validationRules（声明式规则集）
```

**表单控件**——同样为官方物料，作为 FormContainer 的标准子项：

| 物料 ID | 名称 | 基于的引擎原语 | 核心扩展 |
|---------|------|---------------|---------|
| `official.input` | 单行输入框 | Input (已有 ViewType) | 验证规则 + placeholder + 类型(text/number/password/email) |
| `official.textarea` | 多行文本域 | Input (扩展 multiline 属性) | 自动增高 + 最大行数 |
| `official.select` | 下拉选择 | FlexView + 自定义弹出层 | options 数据源 + 搜索 |
| `official.radio` | 单选组 | FlexView(row/column) + GraphView(圆形) | 互斥选择逻辑 |
| `official.checkbox` | 多选组 | FlexView(row/column) + GraphView(圆角矩形) | 多值选择 |
| `official.switch` | 开关 | GraphView(圆角矩形+圆形) + 动画 | 二值切换 |
| `official.datepicker` | 日期选择 | Input + 日历弹出面板物料 | 日期格式化 + 范围限制 |
| `official.slider` | 滑块 | GraphView(线+圆) + 拖拽事件 | 范围 + 步长 + 值绑定 |
| `official.upload` | 文件上传 | FlexView + ImageView + 事件 | 文件选择 + 预览 + 上传流程 |
| `official.rating` | 评分 | FlexView(row) + GraphView(星形) | 半星 + 只读模式 |

**物料格式**（遵循 ADR-027 的 IMaterial 规范）：

每个表单控件物料本质上是一段 View.toJSON() 子树快照 + 参数孔洞（label 文本、placeholder、验证规则等作为可配参数暴露）。用户拖入表单控件时，实例化为具体的 View 树。

### 决策六：其他高频 UI 模式为官方物料

| 物料 ID | 名称 | 组合方式 | 核心逻辑 |
|---------|------|---------|---------|
| `official.tabs` | 标签页容器 | FlexView(column): header(FlexView.row) + 内容区(CombinedView) | onClick tab → setVisible 切换内容 |
| `official.accordion` | 手风琴/折叠面板 | FlexView(column): 多组 header + content | onClick header → animate(height) + setVisible |
| `official.modal` | 弹窗/模态框 | CombinedView: 遮罩层 + 内容层 | onTrigger → setVisible + 动画 |
| `official.card` | 卡片容器 | FlexView(column) + BoxDecoration(圆角+阴影) | 纯样式容器 |
| `official.stepper` | 步骤向导 | FlexView(column): 步骤指示器 + 内容区 | 线性导航 + setVisible |
| `official.carousel` | 轮播 | ScrollView(horizontal) + 自动播放事件 | 定时 animate(scrollLeft) |
| `official.navbar` | 导航栏 | FlexView(row) + 固定定位 | 路由事件绑定 |
| `official.sidebar` | 侧边栏 | FlexView(column) + 折叠动画 | 展开/收起 + 菜单项 |
| `official.table` | 数据表格 | GridView + ListView(虚拟化行) | 排序/筛选/分页逻辑 |
| `official.divider` | 分割线 | GraphView(Line) + 样式预设 | 水平/垂直 + 标签 |

---

## 影响范围

| 模块 | 变更 |
|------|------|
| `packages/banvasgl/src/foundation/constants.ts` | ViewType 新增 SCROLLVIEW / LISTVIEW / GRIDVIEW |
| `packages/banvasgl/src/view/FlexView/` | IFlexStyle 新增 wrap + lineGap，layout() 增加换行逻辑 |
| 新增 `packages/banvasgl/src/view/ScrollView/` | ScrollView 容器实现 |
| 新增 `packages/banvasgl/src/view/ListView/` | ListView 容器实现 |
| 新增 `packages/banvasgl/src/view/GridView/` | GridView 容器实现 |
| `packages/banvasgl/src/engine/Serializer.ts` | 注册新增 ViewType 的序列化/反序列化 |
| `packages/banvasgl/src/types/view/view.ts` | 新增 IScrollStyle / IListStyle / IGridStyle / IGridLayoutParams 类型 |
| `packages/banvasgl/src/types/guards.ts` | 新增 isScrollView / isListView / isGridView 守卫 |
| `packages/banvasgl/src/data/designMaterials.ts` | 新增 3 个内置容器物料 |
| `packages/banvasgl/src/actions/viewCreateStrategies.ts` | 新增 3 个创建策略 |
| `packages/xiangdi-agent/src/schema/` | AISchema 新增 scroll / list / grid type；converters 新增对应分支 |
| 新增官方物料包（位置待定） | 表单控件 + 高频 UI 模式物料定义 |

---

## 被否决的方案

### 方案A：WrapView 作为独立 ContainerView

否决理由：Wrap 的布局算法是 Flex 的自然延伸（「超出时折行」vs「超出时溢出」的区别），CSS flexbox 用一个 `flex-wrap` 属性就解决了。新增独立 ViewType 会增加序列化复杂度、AI 需要多一个 type 感知、设计面板多一个品类，收益不匹配。

### 方案B：表单作为引擎原语 FormView

否决理由：表单的核心价值在逻辑层面（验证、提交、联动），不在布局算法。FormView 如果作为 ContainerView 子类，其 `layout()` 方法本质上就是 FlexView(column) 或 GridView，等于重复实现。将逻辑交给 FlowSchema 事件系统（onSubmit/onValidate）更符合引擎的「渲染 + 流程」分层架构。

### 方案C：所有表单控件也作为引擎 ViewType

否决理由：如果每个表单控件（Radio、Checkbox、Select、DatePicker...）都新增 ViewType，ViewType 枚举将快速膨胀到 30+，序列化复杂度指数增长。表单控件的差异在于交互逻辑（由 FlowSchema 事件编排）和视觉样式（由 Graph 基元组合），而非布局算法——不满足引擎原语的纳入条件。

---

## 后续演进

- ListView 实现后，官方 Table 物料可基于 GridView(表头) + ListView(行数据) 组合实现虚拟化大数据表格
- ScrollView 支持 `nestedScrolling` 协议后，可实现类似移动端的嵌套滚动体验（如列表内嵌横向滚动）
- GridView 后续可扩展 `subgrid` 能力（子网格继承父网格轨道），用于复杂表单双列布局
- 当物料市场上线后，社区可基于引擎容器组合出更丰富的物料（日历视图、看板、甘特图等）
