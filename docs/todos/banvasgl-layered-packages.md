# TODO: BanvasGL 分层拆包

> 创建时间：2025-07-18
>
> 关联决策：[ADR-016](../adr/016-banvasgl-layered-packages.md)
>
> 背景：将 BanvasGL 拆分为核心层（领域无关图形基础设施）+ 流程编辑领域（BanvasFlow）。页面/应用领域暂留原位，待演化方向明确后再决定结构。

---

## P1：流程领域拆出为 BanvasFlow

- [ ] **确定 BanvasFlow 的公共 API 边界**
  - 梳理 NodeView、PortView、EdgeView、useFlowBanvas 的对外接口
  - 确定哪些类型/接口需要从核心层 re-export 或作为 peerDep 暴露

- [ ] **创建 `packages/BanvasFlow` 包骨架**
  - package.json（name: banvas-flow，peerDep: banvasgl）
  - tsconfig.json（继承 monorepo 公共配置）
  - tsup 构建配置（ESM + CJS 双出）
  - src/index.ts 入口

- [ ] **迁移流程相关代码**
  - NodeView、PortView、EdgeView → BanvasFlow
  - useFlowBanvas hook → BanvasFlow
  - 流程编辑交互逻辑（连线拖拽、端口吸附等）→ BanvasFlow
  - FlowRunner + NodeExecutorRegistry（ADR-013 已决策独立）→ BanvasFlow

- [ ] **清理 BanvasGL 中的流程残留**
  - 从 BanvasGL 的入口文件中移除流程相关导出
  - 确保 BanvasGL 构建产物不包含任何流程领域代码
  - 更新 BanvasGL 的三入口（frontend/backend/runtime）

- [ ] **更新上层消费方**
  - `apps/banyan/frontend`：import 路径从 banvasgl 改为 banvas-flow
  - `apps/banyan/electron`：同上
  - 确认 XiangDi 是否有流程相关引用需要更新

## P2：画布上下文管理重构（拆包前置条件）

当前 View/Graph 的 render 和 interact 通过模块级全局变量 `_activeCanvasContext` 隐式获取画布上下文。拆包后如果两个领域包各自 bundle 了一份 CanvasContext 模块，全局指针会分裂为两份独立变量，导致核心层 View 基类读取到错误的上下文。需要在拆包前将全局状态改为实例级传递。

- [ ] **View/Graph 的 render 方法改为参数传递 CanvasContext**
  - `View.render(ctx: CanvasContext)` 替代内部 `getActiveCanvasContext()` 调用
  - Renderer 在遍历 View 树时将 ctx 逐层传入
  - Graph 基元的 render 同步改为接收 ctx 参数

- [ ] **View/Graph 的 interact 方法改为参数传递 CanvasContext**
  - `View.interact(worldPoint, ctx: CanvasContext)` 替代内部 `getActiveCanvasContext()` 调用
  - 事件 handler 层在调用 interact 时传入当前 App 实例的 canvasContext
  - 移除 `activateContext()` / `deactivateContext()` 的成对调用模式

- [ ] **TextElement 构造时的 measureText 解耦**
  - 抽取 `TextMeasurer` 接口（只需 measureText 能力，不需要完整 CanvasContext）
  - Serializer 反序列化时通过参数注入 TextMeasurer，而非临时 activateContext
  - TextElement 构造函数接收 TextMeasurer 参数

- [ ] **移除全局活动上下文机制**
  - 删除 `_activeCanvasContext` 模块级变量
  - 删除 `setActiveCanvasContext` / `getActiveCanvasContext` 函数
  - 删除已废弃的 `getGlobalCanvasContext` / `destroyGlobalCanvasContext`
  - 确保所有调用点已迁移到参数传递模式

- [ ] **useCanvasInit 适配**
  - hook 内部不再需要在事件 handler 中 activate/deactivate
  - 事件 handler 直接从闭包中的 app.renderer 获取 canvasContext 并传入 interact

## P3：核心层精简

- [ ] **审计 BanvasGL 剩余代码的领域无关性**
  - 确认 View、ContainerView、Addon 基类中没有领域特定逻辑
  - 确认 Graph 基元体系、Math、Renderer、Camera、Scene 都是纯基础设施
  - 确认 CanvasContext 不再有全局状态，是纯实例对象

- [ ] **明确核心层的导出策略**
  - 核心层导出所有基础设施类型和接口（含 CanvasContext、TextMeasurer）
  - 领域层通过 peerDep 引用核心层，不 re-export 核心层内容（避免版本冲突）

## P4：页面/应用领域（待明确）

- [ ] **观察 div 化改造后的演进方向**
  - 设计态和预览/运行态是否需要进一步拆分
  - 运行态是否需要更轻量的渲染路径（去掉编辑器交互代码）
  - 当前三入口架构（frontend/runtime）是否足够，还是需要物理拆包

- [ ] **时机成熟时决定页面/应用领域的包结构**
  - 可能方案 A：独立为 BanvasDesign 包，内部不再拆分
  - 可能方案 B：拆为 BanvasDesign（设计态）+ BanvasRuntime（运行态轻量包）
  - 可能方案 C：保持在 BanvasGL 核心层中，通过入口文件隔离（现状）

## P5：基础设施适配

- [ ] **构建与 CI 适配**
  - pnpm workspace 中注册 BanvasFlow
  - `pnpm build:all` 脚本更新构建顺序（核心层先于领域层）
  - CI 中增加 BanvasFlow 的独立测试和构建验证

- [ ] **文档更新**
  - AGENTS.md 中更新包结构和依赖方向图
  - 各包 README 更新
  - 包间依赖关系图更新

## 关联文件

- `packages/BanvasGL/src/core/views/flow/`（当前流程相关代码所在目录）
- `packages/BanvasGL/src/core/renderer/CanvasContext.ts`（全局活动上下文机制所在）
- `packages/BanvasGL/src/core/renderer/Renderer.ts`（渲染循环、activate/deactivate 调用方）
- `packages/BanvasGL/src/core/views/View/View.ts`（render/interact 中 getActiveCanvasContext 调用点）
- `packages/BanvasGL/src/hook/useCanvasInit/index.ts`（底层画布初始化 hook）
- `packages/BanvasGL/src/hook/useFlowBanvas/index.tsx`（流程态 hook，拆包后迁入 BanvasFlow）
- `packages/BanvasGL/src/index.frontend.ts`（当前 useFlowBanvas 导出位置）
- `packages/BanvasGL/package.json`
- `pnpm-workspace.yaml`
- `AGENTS.md`
