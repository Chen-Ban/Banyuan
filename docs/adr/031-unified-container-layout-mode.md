# ADR-031：统一容器布局模式（废弃 ADR-030 多容器方案）

**状态**：已采纳  
**决策日期**：2025-07-15  
**决策者**：陈班  
**废弃**：ADR-030

---

## 背景

ADR-030 提出新增 ScrollView、ListView、GridView 三个独立引擎容器，并在物料面板中作为独立物料暴露给用户。在实施过程中，经过用户体验层面的重新评估，发现多容器物料方案存在以下问题：

1. **物料面板膨胀**：每新增一种布局模式就多一个物料入口，用户需要在多个相似容器间做选择，认知负担高
2. **布局切换成本高**：用户如果中途想从列表布局改为网格布局，需要重新创建容器并迁移子元素，操作繁琐
3. **AI Agent 决策复杂度**：XiangDi 生成页面时需要在多个容器类型间选择，增加了不必要的决策分支

---

## 决策

**废弃 ADR-030 的多容器物料方案**，改为「统一容器 + 属性面板切换布局模式」：

- 物料面板只提供一个「布局容器」入口，底层对应 **CombinedView**
- CombinedView 通过 `style.layoutMode`（`'free' | 'flex' | 'list' | 'grid'`）切换布局行为
- 各布局模式的具体参数分别存放在 `style.flexLayout`、`style.listLayout`、`style.gridLayout` 对象中
- 属性面板提供布局模式切换 UI，切换时只需更新 `style.layoutMode`，无需替换 View 实例或迁移子元素
- **不存在独立的 FlexView 类**，ADR-030 中提到的 FlexView 概念已完全合并进 CombinedView

### 核心原则

布局行为是容器的一个**属性维度**，而非不同的**实体类型**。用户关心的是「我的子元素怎么排列」，而不是「我用的是哪种容器」。

### 演进约束（永久生效）

**后续所有新布局能力，只允许通过以下方式扩展，禁止新增独立的布局容器 ViewType：**

1. 在 `LayoutMode` 联合类型中新增一个值（如 `'masonry'`）
2. 在 `IViewStyle` 中新增对应的布局配置接口（如 `masonryLayout?: IMasonryLayout`）
3. 在 `CombinedView.layout()` 中新增对应的布局策略分支

这条约束的理由：
- 每新增一个独立 ViewType，序列化格式、AI Projection 转换器、物料面板、属性面板、创建策略均需同步扩展，维护成本呈线性增长
- `layoutMode` 是属性切换，用户和 AI Agent 无需感知底层类型差异，认知负担为零
- 布局算法的差异体现在 `layout()` 方法的策略分支中，这是实现细节，不应泄漏为公共 API 的类型差异

### ADR-030 决策一的处理

ADR-030 中的决策一（FlexView 新增 `wrap` 属性实现流式换行）的意图予以保留，但实现方式调整为：`wrap` 作为 `IFlexLayout` 的一个字段（`style.flexLayout.wrap`），归属于 CombinedView 在 `layoutMode='flex'` 时的布局配置，而非独立 FlexView 类的属性。

---

## 影响

- **CombinedView** 是唯一的布局容器 ViewType，`style.layoutMode` 控制布局行为
- `style.flexLayout`（`IFlexLayout`）、`style.listLayout`（`IListLayout`）、`style.gridLayout`（`IGridLayout`）分别承载各模式的布局参数，已在 `types/foundation/style.ts` 中定义
- ViewType 中的 SCROLLVIEW / LISTVIEW / GRIDVIEW 常量暂时保留（不影响现有代码），待后续确认是否需要独立实现
- 物料面板和创建策略中不新增独立容器物料，统一使用 CombinedView 入口
- `switchContainerLayout()` action 函数只需更新 `style.layoutMode` 及对应布局配置字段，无需实例替换

---

## 替代方案（已否决）

**多容器独立物料**（ADR-030 原方案）：每种布局模式对应一个独立 ViewType + 独立物料。优势是引擎层职责清晰、每个类代码简单；劣势是用户体验割裂、AI 决策复杂、布局切换成本高。
