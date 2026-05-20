# TODO: 布局子容器（FlexView 及后续布局策略）

> 创建时间：2025-07-19
>
> 关联决策：[ADR-017](../adr/017-layout-containers.md)
>
> 背景：通过 CombinedView 的子类实现不同布局策略（flex/wrap/grid），对标 Flutter 的 Row/Column/Wrap 模型。布局与装饰正交（ADR-015）。

---

## Phase 1：FlexView 核心实现

> 前置依赖：ADR-015 P1 完成（BoxDecorationAddon 就绪，View 基类渲染管线已调整）

- [ ] **创建 FlexView 类**
  - 文件路径：`packages/BanvasGL/src/core/views/FlexView/index.ts`
  - 继承自 ContainerView（与 CombinedView 平级）
  - 新增属性：direction、gap、mainAxisAlignment、crossAxisAlignment、padding
  - type 常量：`VIEWTYPE.FLEXVIEW`
  - 在 VIEWTYPE 常量和 ViewTypeMap 中注册

- [ ] **实现 FlexView.layout() 核心算法**
  - Override `layout()` 方法
  - 按 direction 方向遍历 children，计算累积偏移
  - 根据 mainAxisAlignment 分配主轴空间
  - 根据 crossAxisAlignment 调整交叉轴位置
  - padding 缩进布局区域
  - gap 作为子元素间距

- [ ] **View 增加 layoutParams 字段**
  - IView 接口增加 `layoutParams?: ILayoutParams`
  - 初期仅包含 `flex?: number` 和 `alignSelf?`
  - FlexView.layout() 中读取子元素的 layoutParams.flex 分配弹性空间
  - 序列化/反序列化支持

- [ ] **FlexView 序列化**
  - Serializer 注册 FLEXVIEW 类型
  - toJSON 输出布局属性（direction、gap、alignment、padding）
  - fromJSON 恢复布局属性
  - 兼容策略：无 layout 属性时 fallback 为默认值

- [ ] **导出与 barrel 文件更新**
  - `core/views/index.ts` 导出 FlexView
  - `core/constants/index.ts` 增加 FLEXVIEW 常量
  - `core/interfaces/` 增加 IFlexView 接口
  - 三入口（frontend/backend/runtime）检查是否需要同步

## Phase 2：编辑态交互

- [ ] **FlexView 内子元素拖拽排序**
  - 拖拽子元素时显示插入位置指示器（而非自由移动）
  - 释放时改变 children 数组顺序，触发重新 layout
  - BanvasDesign 层的交互处理

- [ ] **FlexView 属性面板**
  - 前端面板：direction 切换、gap 数值输入、alignment 选择器、padding 输入
  - 子元素 flex 权重调整 UI
  - 视觉预览效果

- [ ] **FlexView 内子元素 resize 约束**
  - 非 flex 子元素可 resize（固定尺寸）
  - flex 子元素仅能 resize 交叉轴方向（主轴由 flex 算法控制）
  - resize 后触发容器重新 layout

## Phase 3：AISchema 支持

- [ ] **AISchema 增加 layout 字段**
  - 在 AIGroupNodeSchema 中增加可选的 `layout` 对象字段
  - `layout.type: 'flex'`
  - `layout.direction / gap / mainAxisAlignment / crossAxisAlignment / padding`
  - 无 layout 字段 = 自由定位（向后兼容）
  - 文件路径：`packages/XiangDi/src/schema/AISchema.ts`

- [ ] **Converter 支持 layout 字段**
  - `aiNodeToBanvas`：有 layout 字段时创建 FlexView，否则创建 CombinedView
  - `banvasToAINode`：FlexView 输出 layout 字段，CombinedView 不输出
  - 文件路径：`packages/XiangDi/src/schema/converters.ts`

- [ ] **子元素 layoutParams 转换**
  - AISchema 中子节点增加可选 `flex?: number` 字段
  - Converter 双向映射 flex 权重

- [ ] **KnowledgeStore 种子数据**
  - 新增 flex 布局相关的 composition 示例
  - 如"垂直表单布局""水平导航栏""弹性卡片列表"
  - 文件路径：`packages/XiangDi/src/knowledge/seeds/composition/`

## Phase 4（远期）：更多布局策略

- [ ] **WrapView（流式换行布局）**
  - 对标 Flutter Wrap / CSS flex-wrap
  - 子元素按主轴排列，超出容器宽度时自动换行
  - 适用场景：标签云、图片流

- [ ] **GridView（网格布局）**
  - 对标 CSS Grid 简化版
  - 属性：columns、rows、gap、cellSize
  - 适用场景：卡片网格、仪表盘

- [ ] **布局嵌套**
  - FlexView 内嵌 FlexView（垂直内嵌水平）
  - 布局容器内嵌自由定位容器
  - 递归 layout 正确性验证

## 关联文件

- `packages/BanvasGL/src/core/views/ContainerView/index.ts`（父类：ContainerView）
- `packages/BanvasGL/src/core/views/CombinedViews/index.ts`（平级参考：CombinedView）
- `packages/BanvasGL/src/core/views/View/View.ts`（基类：layout 方法定义）
- `packages/BanvasGL/src/core/constants/index.ts`（VIEWTYPE 常量）
- `packages/BanvasGL/src/core/serializer/index.ts`（类型注册）
- `packages/XiangDi/src/schema/AISchema.ts`（AI Schema）
- `packages/XiangDi/src/schema/converters.ts`（双向转换器）
