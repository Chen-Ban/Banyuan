# ADR-021: Addon Capability 声明与统一管线

## 状态

已采纳 (Accepted)

## 背景

BanvasGL 的 View-Addon 架构采用组合模式：每个 addon 作为 View 的具名属性存在。
随着 View 子类增长，addon 可能近线性增长（子类独有行为复杂度足够高时也应抽象为 addon）。

原有问题：
1. 每个子类通过 override `renderPlugins`/`interactPlugins` 手工接入自己的 addon，新增 addon 时容易遗漏
2. addon 的设计意图（是否参与渲染/交互/逻辑）隐含在运行时 early return 中，不可自文档化
3. 多选 resize 场景下，GraphView 需要 BoundingBox 的几何数据但不需要渲染和交互，缺乏表达手段

## 决策

### 1. AddonCapability 元信息

每个 addon 通过 `capabilities` 字段声明自己参与哪些管线：

```typescript
enum AddonCapability {
    RENDER = 'RENDER',     // 参与渲染管线
    INTERACT = 'INTERACT', // 参与交互管线
    LOGIC = 'LOGIC',       // 仅参与逻辑计算（不渲染不交互）
}
```

一个 addon 可同时声明多个职责。管线根据 capabilities 决定是否调用对应方法，避免空跑。

### 2. 统一 addon 管线

View 基类提供 `activeAddons` getter，子类通过 override 追加自己的 addon：

```typescript
// View 基类
protected get activeAddons(): IAddonBase[] {
    const addons: IAddonBase[] = [];
    if (this.boundingBox) addons.push(this.boundingBox);
    return addons;
}

// GraphView 追加 VertexAddon
protected override get activeAddons(): IAddonBase[] {
    const addons = super.activeAddons;
    if (this.controlPoints) addons.push(this.controlPoints);
    return addons;
}
```

`renderPlugins` 和 `interactPlugins` 统一遍历 `activeAddons`，按 `priority` 排序，
仅调用具有对应 capability 的 addon。子类不再需要 override 这两个方法。

### 3. 优先级机制

`priority` 字段决定同管线内多个 addon 的执行顺序（数值越小越先执行）：
- BoundingBoxAddon: priority = 0（最先）
- VertexAddon: priority = 10（在 BoundingBox 之后）
- BoxDecorationAddon: priority = -10（背景层，但不走 renderPlugins 管线）

### 4. Addon 新增规范

满足以下任一条件时，应将行为抽象为 addon：

1. **复用性**：多个 View 子类可能使用
2. **可选性**：行为可以不存在而不影响子类核心身份
3. **生命周期独立性**：有独立的挂载/激活/休眠周期
4. **复杂度**：即使是子类独有行为，复杂到影响可维护性

### 5. 不引入运行时插件注册表

产品决策：Banyan 零代码平台不允许用户自定义插件，通过组合容器达到复用目的。
因此不需要运行时动态注册 addon 的能力，保持具名属性的强类型和性能优势。

## 后果

- 新增 addon 时只需：声明属性 + 在 `activeAddons` 中追加，管线自动接管
- addon 的设计意图通过 capabilities 自文档化
- 多选 resize 等场景可通过运行时切换 capabilities 实现"仅逻辑不渲染"
- 外部包（banvas-design、flow-design）的 View 子类同样受益于统一管线
