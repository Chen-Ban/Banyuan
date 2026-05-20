# ADR-017: 布局子容器（通过子类实现不同布局策略）

> 状态：已接受
> 日期：2025-07-19
> 决策者：chenxin176

## 背景

当前 CombinedView 是唯一的页面构建容器，其子元素采用自由定位（绝对坐标）。用户在构建页面时经常需要"子元素自动排列"的能力——比如水平排列的导航项、垂直排列的表单字段、网格排列的卡片列表。目前这些排列完全依赖手动坐标计算（或 AI 计算坐标），没有自动布局语义。

ADR-015 确定了视觉装饰（BoxDecorationAddon）与布局策略正交的原则。本决策解决布局维度的问题：如何让容器支持自动布局。

## 决策

通过 CombinedView 的子类实现不同的布局策略，每种子类 override `layout()` 方法。对标 Flutter 的 Stack/Row/Column/Wrap 模型，而非 CSS 盒模型。

继承结构：

```
View
└── ContainerView（子节点管理：addChild / removeChild / clear）
    ├── CombinedView（自由定位，对标 Flutter Stack —— 当前已有）
    ├── FlexView（flex 布局，对标 Flutter Row/Column）
    ├── WrapView（流式换行布局，对标 Flutter Wrap —— 远期）
    └── GridView（网格布局 —— 远期）
```

核心原则：

- 布局策略是子类职责，通过 override `layout()` 实现
- 所有布局容器都可以挂载 BoxDecorationAddon（装饰与布局正交）
- CombinedView（自由定位）保持不变，是最基础的容器
- 布局容器引入的概念仅限于排列逻辑（direction、gap、alignment），不引入完整盒模型（不做 margin/padding/border-box 的流式语义）

## 设计要点

### 1. FlexView 布局模型

FlexView 是第一个要实现的布局子类，对标 Flutter 的 Row（水平）/ Column（垂直）：

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| direction | 'row' \| 'column' | 'column' | 主轴方向 |
| gap | number | 0 | 子元素间距 |
| mainAxisAlignment | 'start' \| 'center' \| 'end' \| 'spaceBetween' \| 'spaceAround' | 'start' | 主轴对齐 |
| crossAxisAlignment | 'start' \| 'center' \| 'end' \| 'stretch' | 'start' | 交叉轴对齐 |
| padding | number \| [number, number, number, number] | 0 | 内边距（布局区域缩进） |

layout() 逻辑：遍历 children，按 direction 方向依次排列，根据 alignment 计算每个 child 的 x/y 坐标，更新 child 的 viewport 位置。

### 2. 子元素的 flex 属性

子 View 需要一个可选的 `layoutParams` 属性来参与 flex 布局：

```typescript
interface IFlexLayoutParams {
    flex?: number       // flex 权重（0 = 固定尺寸，> 0 = 弹性分配剩余空间）
    alignSelf?: 'start' | 'center' | 'end' | 'stretch'  // 覆盖容器的 crossAxisAlignment
}
```

这个属性挂在 View 的 `style` 或独立的 `layoutParams` 字段上，仅在父容器为 FlexView 时生效。

### 3. 与自由定位的关系

FlexView 内的子元素由布局算法计算坐标，用户**不能**手动拖拽移动位置（会破坏布局语义）。用户可以：

- 通过拖拽改变子元素的**顺序**（排列顺序）
- 通过 resize 改变子元素的**尺寸**（固定尺寸子元素）
- 通过设置 flex 权重让子元素**弹性伸缩**

这与 CombinedView（完全自由拖拽）形成明确的交互差异。

### 4. 与 BoxDecorationAddon 的关系

FlexView 继承自 ContainerView（与 CombinedView 平级），天然继承 View 基类的 `decoration` 属性。一个带 flex 布局的容器同时有背景/边框是完全正常的需求（比如一个带圆角边框的垂直列表容器）。

### 5. 对 AISchema 的影响

新增 `AIFlexContainerSchema`（或在 group 类型上增加 `layout` 字段）：

```typescript
// 方案一：group 类型增加 layout 字段
{
  type: "group",
  layout: {
    type: "flex",
    direction: "column",
    gap: 8,
    mainAxisAlignment: "start",
    crossAxisAlignment: "stretch",
    padding: 16
  },
  children: [...]
}

// 无 layout 字段 = 自由定位（向后兼容）
{
  type: "group",
  children: [...]
}
```

AI Agent 生成布局容器时，通过 `layout` 字段描述布局策略，converter 据此决定创建 CombinedView 还是 FlexView。

### 6. 序列化

FlexView 需要自己的 $type（如 `FLEXVIEW`），Serializer 注册后能正确反序列化。布局属性（direction、gap、alignment 等）作为 FlexView 的 JSON 字段输出。

## 实施节奏

| 阶段 | 内容 | 依赖 |
|------|------|------|
| Phase 0（当前） | CombinedView 保持自由定位不变 | 无 |
| Phase 1 | 实现 FlexView（direction + gap + alignment） | ADR-015 P1 完成（装饰能力就绪） |
| Phase 2 | FlexView 编辑态交互（拖拽排序、flex 权重调整面板） | Phase 1 |
| Phase 3 | AISchema + Converter 支持布局容器 | Phase 1 |
| Phase 4（远期） | WrapView、GridView 等更多布局策略 | Phase 1 验证可行性后 |

## 替代方案

### 方案 A：通过插件（LayoutAddon）附加布局能力

像 BoxDecorationAddon 一样，用插件给任意容器附加布局策略。

否决原因：布局策略深度影响 children 的坐标计算和交互行为（能否自由拖拽），这不是"装饰性附加"，而是容器的核心语义差异。用子类表达更准确，也更容易在编辑态区分交互模式。

### 方案 B：CombinedView 内部切换 layout mode

一个 CombinedView 通过 `layoutMode: 'free' | 'flex' | 'grid'` 属性切换行为。

否决原因：不同布局模式下的交互行为、子元素约束、序列化结构都不同，放在一个类里用 if/switch 切换会导致类职责膨胀。子类化更清晰。

### 方案 C：完整引入 CSS Flexbox 语义

包含 flex-shrink、flex-basis、order、flex-wrap 等完整属性。

否决原因：初期不需要这么复杂。先实现最核心的 direction + gap + alignment，覆盖 80% 的布局场景。复杂场景用户可以用自由定位手动调整，或者后续按需增加属性。

## 后果

- CombinedView（自由定位）保持不变，现有功能无影响
- FlexView 作为第一个布局子类，为后续更多布局策略奠定模式
- 布局与装饰正交：FlexView + BoxDecorationAddon 自由组合
- AISchema 通过 `layout` 字段区分自由定位和自动布局，向后兼容
- 编辑态需要新的交互模式（拖拽排序 vs 自由移动），这是 Phase 2 的工作
