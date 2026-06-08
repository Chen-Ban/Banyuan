# 引擎 · 架构级决策

> 整体怎么组织——@banyuan/banvasgl + @banyuan/flow 引擎核心层的顶层架构。

---

## Canvas 2D 双缓冲渲染，预留 Renderer 接口

**✅ 已实施**

MVP 阶段使用 Canvas 2D 双缓冲渲染。渲染层抽象为 Renderer 接口，后续可替换为 WebGPU 实现。

**决策链：** 产品目标（快速验证）-> 选择 API 最简单的渲染后端 -> Canvas 2D。接口化隔离未来升级路径。

**约束：**

- 节点数 > 1000 时可能出现渲染性能瓶颈，需要视口剔除 + 空间索引缓解
- 重计算已分流到 Web Worker，不阻塞渲染主线程
- 文本渲染、图片绘制开箱可用，不需要自建 font atlas

**反例：**

- WebGL 2——文本渲染需自建 MSDF font atlas，Safari 实现有坑，开发成本远超收益
- WebGPU——浏览器支持未普及（Firefox/Safari），2D 渲染管线工程量大，列入路线图远期目标

---

## 相机驱动的无限画布模型

**✅ 已实施**

Canvas DOM 元素尺寸 = 外部容器尺寸（自适应）。Scene 使用 OrthographicCamera，通过 camera position + zoom 的 VP 矩阵决定世界的哪部分映射到视口。

**决策链：** 用户需要无限画布浏览 -> CSS 缩放模型无法实现真正的无限画布和清晰缩放 -> 采用业界主流（Figma/tldraw/Excalidraw）相机模型 -> 引擎层已有 OrthographicCamera 全套基础设施。

**约束：**

- 缩放 = camera.zoom(factor)，平移 = camera.pan(dx, dy)
- 事件坐标从屏幕空间转世界空间需经 VP 逆矩阵
- Zoom-to-cursor：缩放前后鼠标指针下方世界点的屏幕位置保持不变
- DPR 与相机缩放在不同层级独立应用，互不干扰

**反例：**

- CSS 样式缩放（旧方案）——缩放后文本模糊（像素被拉伸而非重绘）、不支持平移、世界有固定边界
- 外部 React 虚拟相机——绕过引擎内核，无法复用 OrthographicCamera 已有设施

---

## 三态统一引擎，hook 层区分行为

**未实施**

三态（编辑态/预览态/线上态）全部使用 @banyuan/banvasgl 同一个引擎包，通过不同的 React hook 控制行为边界。

**决策链：** 产品需要设计到预览到发布的完整链路 -> 尝试过独立 runtime 包但从未落地 -> 核心洞察：三态差异仅在 hook 层行为和后端连接 -> 统一引擎 + 不同 hook。编辑态用 useDesignBanvas（元素可选中/拖拽/配置，FlowSchema 不执行），预览态和线上态用 useRuntimeBanvas（元素不可选中，FlowSchema 完整执行）。

**约束：**

- 两个 hook 共享底层 useCanvasInit（Canvas DOM 初始化、Renderer 创建、Camera 设置）
- 预览态通过画布内工具栏切换实现，不使用 iframe
- 线上态通过 deploy-agent Production Mode 全量构建部署到 ECS

**反例：**

- 独立 runtime 包——多包同步维护负担大，且从未实际创建
- iframe 嵌入预览——BanvasGL 是自包含 Canvas 引擎，hook 切换零延迟，iframe 增加不必要通信开销

---

## FlowRunner 独立为 @banyuan/flow 包

**✅ 已实施**

流程执行引擎从 banvasgl 中剥离为独立包 @banyuan/flow，banvasgl 通过 workspace:* 依赖它。

**决策链：** View.events 和 View.lifetimes 的类型都是 FlowSchema | null，渲染层天然依赖流程定义 -> 但 FlowSchema 的执行宿主不只在前端（云函数也用同一套语法）-> 前后端需要共享同一套执行器但可用节点集不同 -> 将流程执行器独立为包，通过子路径导出分离前后端预设。

**约束：**

- banvasgl 对 flow 的依赖是类型层 import type，运行时通过 App 持有的 FlowRunner 实例桥接
- flow 包零 runtime dependencies，纯独立
- 子路径导出：.（核心）/ ./client（前端预设）/ ./server（后端预设）/ ./types（纯类型）

**反例：**

- Flow 逻辑内嵌 banvasgl——后端需要整个图形引擎才能执行云函数，依赖爆炸
- 前后端分为两个独立包——共享节点（condition/delay/setVariable 等）需要重复维护

---

## 前后端执行器共享 FlowSchema 但物理隔离

**✅ 已实施**

前端通过 createClientFlowRunner() 创建执行器（注册 client + shared 节点），后端通过 createServerFlowRunner() 创建执行器（注册 server + shared 节点）。

**决策链：** 同一个 FlowSchema JSON 在不同环境下执行时可用节点不同 -> Strategy Registry 模式：工厂函数创建 Runner 时按预设批量注册节点执行器。

**约束：**

- 前端绑定点只能调度 client + shared 节点
- 云函数（服务端执行）只能调度 server + shared 节点
- 新增 FlowNode kind 必须明确归属到 client / server / shared 之一
- App 持有唯一的 ClientFlowRunner 实例，Scene.triggerSchema 直接构造 FlowContext 并调用 FlowRunner.run

---

## 七层引擎架构

**✅ 已实施**

BanvasGL 代码组织为七层：engine（App/Scene/Renderer/Camera/TransactionManager）/ view（View 基类及子类）/ graph（图形基元）/ foundation（数学/样式基础）/ types（纯接口契约）/ actions（封装操作函数）/ data（内置物料/数据构建器/右键菜单）。

**决策链：** 单一入口 index.ts 统一导出所有公共 API -> 内部分层清晰化各职责 -> 依赖方向自上而下：engine -> view -> graph -> foundation -> types。

**约束：**

- types 层是纯接口，不含实现代码
- foundation 是数学/样式基础设施，不依赖上层
- actions 封装对 Scene/View 的复合操作，含默认视图创建策略
- data 提供内置物料定义和构建器，供宿主应用消费
