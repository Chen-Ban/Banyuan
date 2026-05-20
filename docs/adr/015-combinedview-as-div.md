# ADR-015: 通用视觉装饰插件（BoxDecorationAddon）

> 状态：已接受（修订）
> 日期：2025-07-18（初版）/ 2025-07-19（修订）
> 决策者：chenxin176

## 背景

当前 BanvasGL 的容器实现中，所有 View 类型都缺乏通用的视觉装饰能力——用户无法给容器设置 border、border-radius、background 等样式。初版决策（2025-07-18）试图通过将 CombinedView 的 `content` 固定为 RoundedRect 来解决，但进一步讨论后发现：

1. **样式需求不是 CombinedView 独有的**——图片容器需要圆角裁剪，文本容器需要背景色和边框，图形容器也可能需要独立于图形本身的容器装饰。只给 CombinedView 做样式能力是不自洽的。

2. **不应朝完整 CSS 盒模型演进**——BanvasGL 的数据模型是 scene graph（自由定位），不是 document flow。完整盒模型（margin/padding/border-box）的语义依托于流式布局，在自由画布中没有意义。我们需要的只是「视觉装饰」这个子集。

3. **Flutter 的 DecoratedBox 思路更适合**——装饰是一种正交能力，通过组合附加而非继承捆绑，不污染核心渲染/布局模型。

## 决策

引入 **BoxDecorationAddon**（视觉装饰插件），作为所有 View 的可选附加能力，与现有 BoundingBoxAddon（编辑态交互）平级。

核心原则：

- 视觉装饰是正交能力——任何 View（GraphView、TextView、ImageView、CombinedView）都可以按需挂载
- 装饰只管"画"不管"排"——与布局策略完全解耦
- 图形样式和容器样式是两个维度——content（图形主体）的 fill/stroke 是"图形长什么样"，decoration 的 background/border 是"盒子怎么装饰"，通过 UI 面板分区呈现给用户

## 设计要点

### 1. 架构定位

```
View（基类）
  ├── content: IGraph | null（视觉主体——图形/文字/图片）
  ├── decoration: BoxDecorationAddon | null（视觉装饰，可选）
  ├── boundingBox: BoundingBoxAddon | null（编辑态交互）
  └── children: View[]（子视图，ContainerView 及其子类才有）
```

BoxDecorationAddon 对标 Flutter 的 `BoxDecoration`，是一个纯渲染层的装饰描述，不参与布局计算。

### 2. 渲染管线调整

在 View.renderToOffScreen 中增加"前置装饰"阶段：

```
① decoration.renderBackground(ctx)         ← 新增：画背景填充 + 边框
② set clip（有圆角 + clipContent 时用圆角 path，否则矩形）  ← 增强
③ render content                            ← 不变
④ render children                           ← 不变
⑤ render plugins（BoundingBox 等）           ← 不变，不受 clip 影响
```

关键：decoration 在 content 之前渲染（背景层），BoundingBox 在最后渲染（浮在最上层），clip 阶段可根据 decoration 的 borderRadius 升级为圆角路径裁剪。

### 3. BoxDecorationAddon 属性

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| backgroundColor | string | 'transparent' | 背景填充色（HEX / rgba） |
| borderWidth | number | 0 | 边框宽度 |
| borderColor | string | 'transparent' | 边框颜色 |
| borderRadius | number \| [number, number, number, number] | 0 | 圆角半径（单值 / 四角独立） |
| clipContent | boolean | false | 是否按圆角裁剪子内容 |
| opacity | number | 1 | 整体装饰透明度 |

后续扩展：boxShadow、gradient、borderStyle（solid/dashed/dotted）。

### 4. 性能优化

- 当所有属性都为默认值时（无背景、无边框），`renderBackground` 直接跳过（零开销）
- decoration 为 null 时渲染管线完全无变化（向后兼容）
- 圆角裁剪（clipContent = true）仅在需要时启用，默认不构建 clip path

### 5. 两个维度的样式分层

| 维度 | 负责方 | UI 面板区域 | 示例 |
|------|--------|-------------|------|
| 图形样式 | content（IGraph） | "图形属性" 面板 | Rect 的 fill = 蓝色，stroke = 黑色 |
| 容器样式 | decoration（BoxDecorationAddon） | "容器属性" 面板 | 背景 = 白色，边框 = 灰色 1px，圆角 = 8px |

两者互不干扰，用户不会混淆。

### 6. 序列化

BoxDecorationAddon 实现 ISerializable 接口：

- `toJSON()`：仅输出非默认值的属性（最小化 JSON 体积）
- `fromJSON()`：缺失字段使用默认值（旧数据兼容）
- View 的序列化中增加 `decoration` 可选字段

### 7. 对 AISchema 的影响

在 `AIBaseNodeSchema` 层面增加可选的 `decoration` 字段（所有节点类型都可以有容器装饰），不再是 group 专属。

## 职责划分

| 关注点 | 负责方 | 说明 |
|--------|--------|------|
| 视觉装饰（背景、边框、圆角、裁剪） | BoxDecorationAddon | 始终渲染（编辑态 + 运行态），viewport 范围内绘制 |
| 视觉主体（图形/文字/图片的形状和样式） | content（IGraph） | 各 View 类型自己的可视化表现 |
| 编辑态交互（选中框、resize 手柄、旋转） | BoundingBoxAddon | 仅编辑态激活时显示 |
| 子元素管理与布局 | ContainerView 及其子类 | 布局策略由具体子类决定（见 ADR-017） |

## 继承关系（不变）

```
View（基类：content + decoration + boundingBox）
└── ContainerView（子节点管理：addChild / removeChild / clear）
    ├── CombinedView（自由定位容器，对标 Flutter Stack）
    │     ├── FlexView（flex 布局 —— 未来，见 ADR-017）
    │     └── ...（其他布局策略子类）
    └── NodeView（流程节点：端口 + 连线 + 执行语义）
```

CombinedView 与 NodeView 保持兄弟关系，属于不同领域（页面构建 vs 流程编辑），各自独立演化。

## 替代方案

### 方案 A：CombinedView 的 content 固定为 RoundedRect（初版决策）

只给 CombinedView 加样式能力，其他 View 类型没有。

否决原因：用户面向的"容器"概念与底层 View 类型不一一对应。图片容器、文本容器同样需要装饰。只做 CombinedView 是不自洽的。

### 方案 B：在 View 基类上直接加样式属性

把 backgroundColor/border 等作为 View 基类的内置属性。

否决原因：不是所有 View 都需要装饰，内置属性会增加所有 View 实例的内存开销和序列化体积。插件模式按需挂载更灵活。

### 方案 C：新增抽象层（UserContainer 包装类）

在 View 和用户概念之间加一层"用户容器"抽象。

否决原因：多一层间接增加了性能、序列化和 AI 理解成本。用户容器的概念差异可以通过 AISchema 层的语义映射解决，不需要在引擎层引入新抽象。

### 方案 D：朝完整 CSS 盒模型演进

引入 margin/padding/border-box/content-box 完整语义。

否决原因：BanvasGL 是 scene graph + 自由定位模型（对标 Flutter 的 Stack），不是 document flow。完整盒模型的语义依托流式布局，在自由画布中大部分属性没有意义。我们只需要「视觉装饰」这个子集。

## 后果

- 所有 View 类型获得统一的视觉装饰能力，用户在任何容器上都可以设置背景/边框/圆角
- 渲染管线小幅调整（增加前置装饰阶段），但 decoration 为 null 时零开销
- 图形样式和容器样式清晰分离，通过 UI 面板分区呈现
- AISchema 在 base 层增加 decoration 字段，所有节点类型通用
- 布局能力独立演进（见 ADR-017），与装饰能力正交
