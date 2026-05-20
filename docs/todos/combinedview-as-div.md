# TODO: 通用视觉装饰插件（BoxDecorationAddon）

> 创建时间：2025-07-18（初版）/ 2025-07-19（修订）
>
> 关联决策：[ADR-015](../adr/015-combinedview-as-div.md)
>
> 背景：所有 View 类型通过 BoxDecorationAddon 获得视觉装饰能力（背景、边框、圆角、裁剪），对标 Flutter 的 BoxDecoration。装饰与布局正交，装饰只管"画"不管"排"。

---

## P1：BoxDecorationAddon 核心实现

- [ ] **创建 BoxDecorationAddon 类**
  - 文件路径：`packages/BanvasGL/src/core/views/addon/BoxDecorationAddon.ts`
  - 实现 ISerializable 接口
  - 属性：backgroundColor、borderWidth、borderColor、borderRadius（number | [四角]）、clipContent、opacity
  - 所有属性给默认值（transparent / 0 / false / 1）
  - `renderBackground(ctx, viewport)` 方法：根据属性绘制背景填充 + 边框
  - `buildClipPath(ctx, viewport)` 方法：当 clipContent = true 且有圆角时构建圆角裁剪路径
  - 性能优化：全默认值时 renderBackground 直接 return

- [ ] **View 基类增加 decoration 属性**
  - 文件路径：`packages/BanvasGL/src/core/views/View/View.ts`
  - 新增 `decoration: BoxDecorationAddon | null`（默认 null）
  - ViewOptions 中增加 `decoration?` 可选参数
  - 提供 `setDecoration(decoration)` / `getDecoration()` 方法

- [ ] **渲染管线调整**
  - 文件路径：`packages/BanvasGL/src/core/views/View/View.ts` 的 `renderToOffScreen` 方法
  - 在 clip 设置之前，调用 `this.decoration?.renderBackground(ctx, renderViewport)`
  - 在 clip 设置处，如果 `decoration?.clipContent && decoration?.borderRadius > 0`，用圆角路径替代矩形 clip
  - decoration 为 null 时逻辑完全不变（零开销向后兼容）

- [ ] **序列化/反序列化**
  - View 的 `toJSON()` 中输出 `decoration` 字段（仅当 decoration 非 null 时）
  - View 的 `restoreFromJSON()` 中恢复 decoration（缺失时 decoration = null，旧数据兼容）
  - BoxDecorationAddon 的 `toJSON()` 仅输出非默认值属性（最小化 JSON）
  - BoxDecorationAddon 的 `fromJSON()` 缺失字段用默认值填充

- [ ] **接口层更新**
  - `IView` 接口增加 `decoration: IBoxDecoration | null`
  - 新增 `IBoxDecoration` 接口定义
  - 导出注册到 barrel 文件

- [ ] **copy() 支持**
  - View 基类的 copy 逻辑中复制 decoration（深拷贝）

## P2：AISchema 同步

> ⚠️ 必须在 P1 完成后执行，AISchema 字段需与 BoxDecorationAddon 实际属性一一对应。

- [ ] **更新 AIBaseNodeSchema 增加 decoration 字段**
  - 在所有节点的基础 Schema 中增加可选的 `decoration` 对象字段：
    - `backgroundColor?: string`
    - `borderWidth?: number`
    - `borderColor?: string`
    - `borderRadius?: number`
    - `clipContent?: boolean`
    - `opacity?: number`
  - 文件路径：`packages/XiangDi/src/schema/AISchema.ts`

- [ ] **更新 converters.ts 双向转换逻辑**
  - `aiNodeToBanvas`：所有节点类型转换时，将 decoration 字段映射为 BoxDecorationAddon 实例
  - `banvasToAINode`：所有节点类型转换时，从 View 的 decoration 读取属性输出到 AISchema
  - 文件路径：`packages/XiangDi/src/schema/converters.ts`

- [ ] **更新 KnowledgeStore 种子数据**
  - composition 层示例更新为带 decoration 的容器结构
  - 补充"卡片容器""圆角图片"等新模式示例
  - 文件路径：`packages/XiangDi/src/knowledge/seeds/composition/`

## P3：进阶能力

- [ ] **更多装饰属性支持**
  - boxShadow（阴影：offsetX, offsetY, blur, spread, color）
  - gradient（渐变背景：linear-gradient / radial-gradient）
  - borderStyle（solid / dashed / dotted）
  - border 四边独立设置

- [ ] **性能评估与优化**
  - clipContent = true 时每帧构建 clip path 的性能影响
  - 是否需要缓存 clip path（viewport 不变时复用）

- [ ] **编辑态面板集成**
  - 前端属性面板中新增"容器属性"区域
  - 与"图形属性"面板分区显示
  - 支持可视化调整 decoration 各属性

## 关联文件

- `packages/BanvasGL/src/core/views/View/View.ts`（View 基类，渲染管线）
- `packages/BanvasGL/src/core/views/addon/BoundingBoxAddon.ts`（参考：现有插件模式）
- `packages/BanvasGL/src/core/interfaces/IView.ts`（接口定义）
- `packages/BanvasGL/src/core/views/index.ts`（导出 barrel）
- `packages/XiangDi/src/schema/AISchema.ts`（AI Schema 定义）
- `packages/XiangDi/src/schema/converters.ts`（双向转换器）
