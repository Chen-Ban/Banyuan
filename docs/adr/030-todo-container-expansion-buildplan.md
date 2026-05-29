# ADR-030 Build Plan：基础容器扩展与物料分层体系（已废弃）

> 对应决策：[ADR-030](./030-container-expansion-and-material-layering.md)（已废弃，被 ADR-031 取代）  
> 创建日期：2025-07-14  
> 废弃日期：2025-07-15

---

## 建设步骤

### Step 1：FlexView wrap 扩展（P0，最小改动最大收益）

**目标**：为 FlexView 新增流式换行能力，不引入新 ViewType

**内容**：

- IFlexStyle 扩展 `wrap: boolean`（默认 false）和 `lineGap?: number`
- FlexView.layout() 重构：当 wrap=true 时切换为流式布局算法
  - 沿主轴累计子元素尺寸
  - 超出容器约束时开始新行/列
  - lineGap 控制行/列间距
  - mainAxisAlignment 在每行内独立生效
  - crossAxisAlignment 在整体交叉轴方向生效
- FlexView.toJSON() / fromJSON() 包含 wrap + lineGap 字段
- Serializer typeRegistry 无需修改（FlexView 类型未变）
- 设计面板属性区新增 wrap 开关和 lineGap 输入
- AI 感知：AISchema 的 flex type 新增 wrap 属性支持

**产物**：FlexView 支持流式布局，如 Tag 列表、图片瀑布流等场景

---

### Step 2：ScrollView 容器实现（P0，其他容器的前置依赖）

**目标**：实现带 overflow 裁剪和滚动物理的容器

**内容**：

- 新增 ViewType.SCROLLVIEW 枚举值
- 新增 `packages/banvasgl/src/view/ScrollView/` 目录：
  - `ScrollView.ts`：继承 ContainerView
  - `ScrollPhysics.ts`：滚动物理引擎（惯性、弹性边界、减速曲线）
  - `ScrollBar.ts`：滚动条渲染（Overlay Graph，不是子 View）
- 核心能力实现：
  - `clipRegion`：Canvas 2D `clip()` 裁剪子视图渲染区域
  - `scrollOffset: Point3`：当前滚动偏移量
  - `contentSize: { width, height }`：内容总尺寸（子视图边界盒计算）
  - 触摸/滚轮事件拦截：消费滚动方向上的事件，阻止冒泡
  - 嵌套滚动协商：内部滚动到头时允许事件冒泡到父 ScrollView
- IScrollStyle 实现：direction / showScrollbar / bounces / scrollbarAutoHide
- 设计态行为：不裁剪，但显示视口边界虚线框
- Serializer 注册 ScrollView 类型
- 设计物料面板新增「滚动容器」

**产物**：可滚动的容器，支持垂直/水平/双向滚动

**依赖**：无

---

### Step 3：ListView 容器实现（P0，数据驱动场景核心）

**目标**：实现虚拟化渲染的数据驱动列表

**内容**：

- 新增 ViewType.LISTVIEW 枚举值
- 新增 `packages/banvasgl/src/view/ListView/` 目录：
  - `ListView.ts`：继承 ContainerView，内置 ScrollView 能力
  - `VirtualPool.ts`：View 实例池（回收 + 复用）
  - `ListLayoutManager.ts`：计算可见项范围 + 布局位置
- 核心能力实现：
  - `dataSource`：数据源绑定（引用 Scene.data 中的数组字段）
  - `itemTemplate`：子项模板（View JSON 子树，实例化时绑定数据）
  - 虚拟化算法：根据 scrollOffset + itemHeight + viewportSize 计算可见范围 [start, end]
  - 实例池：维护 `overscanCount * 2` 个 View 实例，滚动时复用
  - 变高列表支持：itemHeight 可以是固定值或函数
- IListStyle 实现：direction / itemGap / padding / overscanCount
- 设计态行为：展示 `designTimeCount`（默认 3）条样例，可编辑 itemTemplate
- 生命周期：itemTemplate 内的 View 使用 `onCreated` / `onAttach` / `onDestroy` 生命周期管理数据绑定
- Serializer 注册 ListView 类型

**产物**：百/千级数据列表高性能渲染，数据驱动更新

**依赖**：Step 2（复用 ScrollPhysics / clipRegion 实现）

---

### Step 4：GridView 容器实现（P1，二维布局补全）

**目标**：实现 CSS Grid 语义的二维网格布局容器

**内容**：

- 新增 ViewType.GRIDVIEW 枚举值
- 新增 `packages/banvasgl/src/view/GridView/` 目录：
  - `GridView.ts`：继承 ContainerView
  - `GridTrackResolver.ts`：轨道尺寸计算引擎（fixed/fr/auto/minmax）
  - `GridPlacement.ts`：子项放置算法（auto-flow + 显式 column/row 指定）
- 核心能力实现：
  - 轨道定义解析：`columns` / `rows` 数组 → 实际像素宽高
  - fr 单位分配：剩余空间按比例分配（类似 FlexView 的 flex 权重）
  - auto 轨道：取该轨道内最大子项尺寸
  - 子项跨越：通过 IGridLayoutParams 的 columnSpan / rowSpan
  - autoFlow：未显式指定位置的子项自动按行/列顺序填充
- IGridStyle 实现：columns / rows / columnGap / rowGap / padding / autoFlow
- IGridLayoutParams：挂在 View.layoutParams 上
- 设计态交互：网格线可视化 + 拖拽吸附 + 轨道宽度拖拽调整
- Serializer 注册 GridView 类型

**产物**：支持二维网格布局，适用于表单双列排布、仪表盘面板排列等

**依赖**：无（独立于 ScrollView/ListView）

---

### Step 5：AI 感知与 XiangDi 集成（P1，容器可 AI 生成）

**目标**：AI 能够生成和操作新增的容器类型

**内容**：

- AISchema 扩展：新增 `scroll` / `list` / `grid` 三种 type
  - scroll：scrollStyle 属性
  - list：listStyle + dataSource + itemTemplate 属性
  - grid：gridStyle + 子项支持 gridPlacement 属性
- converters.ts 新增对应的双向转换分支
- BanvasToolProtocol.ts：`banvas_add_node` 的 type enum 新增三种
- 知识服务更新：新增容器类型的知识种子（使用场景、属性说明、示例）
- FlexView 的 wrap 属性已在 Step 1 中被 AI 覆盖

**产物**：AI 可通过自然语言生成带滚动/列表/网格的界面

**依赖**：Step 1-4（容器实现完成）

---

### Step 6：官方表单物料套件（P1，高频业务需求）

**目标**：基于引擎容器组合出完整的表单体系物料

**内容**：

- FormContainer 物料：
  - 布局层：FlexView(column) 或 GridView（双列模式），用户可切换
  - 逻辑层：onSubmit / onReset / onValidate 三个 FlowSchema 事件
  - 数据层：formData 对象（KV 结构，管理所有字段值）
  - 验证层：validationRules 声明式规则（required/min/max/pattern/custom）
- 表单控件物料（10 种）：
  - official.input：单行输入框（类型：text/number/password/email/tel）
  - official.textarea：多行文本域（autoResize + maxRows）
  - official.select：下拉选择（单选/多选 + 搜索 + options 数据源）
  - official.radio：单选按钮组（方向：horizontal/vertical）
  - official.checkbox：复选框组（同上）
  - official.switch：开关（label + 二值绑定）
  - official.datepicker：日期选择器（日历弹出面板）
  - official.slider：滑块（范围 + 步长 + 值显示）
  - official.upload：文件上传（拖拽区 + 预览 + 进度）
  - official.rating：评分（星数 + 半星支持）
- 物料格式：遵循 ADR-027 的 IMaterial 规范（View JSON 快照 + 参数孔洞）
- 设计面板分类：「表单」Tab 下展示所有表单控件

**产物**：用户可拖拽生成完整表单，AI 可通过物料引用生成表单页面

**依赖**：Step 4（GridView 用于双列表单布局）、ADR-027 Step 4-5（IMaterial 基础设施）

---

### Step 7：官方高频 UI 物料（P2，生态丰富度）

**目标**：提供开箱即用的高频 UI 模式

**内容**：

- 交互容器物料：
  - official.tabs：标签页（顶部/底部/侧边 + 内容切换）
  - official.accordion：手风琴（多组折叠，支持单开/多开模式）
  - official.modal：弹窗（遮罩 + 内容 + 关闭 + 动画）
  - official.stepper：步骤向导（步骤指示器 + 多内容面板 + 上/下一步）
  - official.carousel：轮播（自动播放 + 手动切换 + 指示器）
- 布局类物料：
  - official.card：卡片容器（圆角 + 阴影 + header/body/footer 分区）
  - official.navbar：导航栏（固定顶部 + logo + 菜单项 + 操作区）
  - official.sidebar：侧边栏（可收起 + 菜单组 + 图标模式）
  - official.divider：分割线（水平/垂直 + 带文字）
- 数据展示物料：
  - official.table：数据表格（GridView 表头 + ListView 行 + 排序/筛选）
  - official.statistic：统计数字（数值 + 标签 + 趋势箭头）
  - official.progress：进度条（线性/环形 + 百分比）
  - official.badge：徽标（数字/圆点 + 位置控制）

**产物**：丰富的开箱即用 UI 组件，覆盖管理后台/电商/展示类应用的主要场景

**依赖**：Step 2-4（引擎容器）、ADR-027 Step 4-5（IMaterial 基础设施）

---

## 依赖关系图

```
Step 1 (FlexView wrap) ─────────────────────────────┐
                                                     │
Step 2 (ScrollView) ──▶ Step 3 (ListView)            │
                                                     ├──▶ Step 5 (AI 集成)
Step 4 (GridView) ──────────────────────────────────┘
                      │
                      └──▶ Step 6 (表单物料)
                                │
                                └──▶ Step 7 (高频 UI 物料)
```

---

## 里程碑

| 里程碑 | 包含步骤 | 交付标志 | 预估工期 |
|--------|---------|---------|---------|
| **M1：布局容器补全** | Step 1-4 | FlexView wrap + ScrollView + ListView + GridView 可用 | 6 周 |
| **M2：AI 可生成新容器** | Step 5 | AI 对话中能生成带滚动/列表/网格的界面 | 2 周 |
| **M3：表单体系上线** | Step 6 | 10 种表单控件可拖拽使用 | 4 周 |
| **M4：物料生态丰富** | Step 7 | 官方物料库 20+ 组件 | 4 周 |

---

## 技术要点

### ScrollView 的 Canvas 2D clip 实现

```typescript
// 渲染时裁剪子视图
render(ctx: CanvasRenderingContext2D) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(viewport.x, viewport.y, viewport.width, viewport.height)
    ctx.clip()
    
    ctx.translate(-scrollOffset.x, -scrollOffset.y)
    this.children.forEach(child => child.render(ctx))
    
    ctx.restore()
    
    // 滚动条在 clip 外渲染
    if (this.scrollStyle.showScrollbar) {
        this.renderScrollbar(ctx)
    }
}
```

### ListView 虚拟化核心算法

```typescript
// 计算可见范围
getVisibleRange(): [number, number] {
    const scrollTop = this.scrollOffset.y
    const viewportHeight = this.viewport.height
    const itemHeight = this.estimatedItemHeight
    
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - this.overscanCount)
    const end = Math.min(
        this.dataSource.length - 1,
        Math.ceil((scrollTop + viewportHeight) / itemHeight) + this.overscanCount
    )
    return [start, end]
}

// 仅实例化可见范围内的 View
updateVisibleItems() {
    const [start, end] = this.getVisibleRange()
    // 回收不可见项
    this.recycleOutOfRange(start, end)
    // 实例化新可见项
    for (let i = start; i <= end; i++) {
        if (!this.renderedItems.has(i)) {
            const view = this.pool.acquire(this.itemTemplate)
            view.bindData(this.dataSource[i])
            this.renderedItems.set(i, view)
        }
    }
}
```

### GridView 轨道尺寸解析

```typescript
// fr 单位分配算法
resolveTrackSizes(tracks: GridTrackDefinition[], availableSize: number): number[] {
    let remaining = availableSize
    let totalFr = 0
    const sizes = new Array(tracks.length)
    
    // Pass 1: 固定和 auto 轨道
    for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i]
        if (track.type === 'fixed') {
            sizes[i] = track.value
            remaining -= track.value
        } else if (track.type === 'auto') {
            sizes[i] = this.getTrackContentSize(i)
            remaining -= sizes[i]
        } else if (track.type === 'fraction') {
            totalFr += track.value
        }
    }
    
    // Pass 2: fr 轨道按比例分配剩余空间
    remaining -= (tracks.length - 1) * this.gridStyle.columnGap
    for (let i = 0; i < tracks.length; i++) {
        if (tracks[i].type === 'fraction') {
            sizes[i] = (remaining * tracks[i].value) / totalFr
        }
    }
    
    return sizes
}
```

---

## 与 ADR-027 物料体系的关系

本 ADR 中的「官方物料」（Step 6-7）依赖 ADR-027 Step 4-5 的 IMaterial 基础设施。在 IMaterial 实现之前：

- Step 1-4（引擎容器）可以独立开发，不依赖物料系统
- Step 5（AI 集成）可在当前 AISchema 体系下完成（新增 type 即可）
- Step 6-7（官方物料）需要等待 IMaterial 格式就绪；过渡期可先用 IComponentTemplate 格式提供 MVP

时间线安排建议：

```
ADR-030 Step 1-4 (容器) ──── 可立即启动
ADR-027 Step 1-5 (物料基础设施) ──── 并行建设
                    ↓ 交汇
ADR-030 Step 5 (AI 集成) + Step 6-7 (官方物料) ──── 物料就绪后启动
```
