# 引擎 · 架构级决策

> 整体怎么组织——@banyuan/banvasgl（带流程控制的图形引擎）顶层架构。

---

## 决策依赖图

```
                        ┌─────────────────────────────┐
                        │  A1 Canvas 2D 双缓冲渲染     │
                        └──────────────┬──────────────┘
                                       │ enables
                        ┌──────────────▼──────────────┐
                        │  A2 相机驱动无限画布          │
                        └──────────────┬──────────────┘
                                       │ enables
              ┌────────────────────────┼────────────────────────┐
              │                        │                        │
┌─────────────▼─────────────┐          │          ┌─────────────▼─────────────┐
│  A3 Flow 融合进 BanvasGL   │          │          │  A4 三态统一引擎           │
│  （子路径导出物理隔离）     │          │          │  （hook 层区分行为）        │
└─────────────┬─────────────┘          │          └───────────────────────────┘
              │ refines                 │
┌─────────────▼─────────────┐          │
│  A5 前后端执行器隔离        │          │
└───────────────────────────┘          │
                                       │
              ┌────────────────────────▼────────────────────────┐
              │  A6 八层引擎架构（对 A1~A5 的组织总结）           │
              └─────────────────────────────────────────────────┘
```

关系说明：

- A1→A2：Canvas 2D 渲染能力是相机模型的基础设施
- A2→A3/A4：无限画布模型确立后，引擎需要决定如何融入流程控制（A3）以及如何服务三种运行态（A4）
- A3→A5：Flow 融合决策确立后，需要进一步细化前后端如何隔离
- A2→A6：八层架构是对所有架构决策的组织性总结，依赖前面所有决策的存在

---

## 渲染基座

### A1. Canvas 2D 双缓冲渲染，预留 Renderer 接口

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

### A2. 相机驱动的无限画布模型

**✅ 已实施** · 依赖 A1

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

## 流程控制融合

### A3. Flow 融合进 BanvasGL，子路径导出实现物理隔离

**✅ 已实施** · 依赖 A2

流程执行引擎作为 `@banyuan/banvasgl` 的内部子模块（`src/flow/`），通过 package.json exports 子路径导出 + tsup code splitting 实现物理隔离。

**决策链：** View.events 和 View.lifetimes 的类型都是 FlowSchema | null，渲染层天然依赖流程定义 -> BanvasGL 语义上是「带流程控制的图形引擎」而非纯渲染包 -> 但后端云函数也需执行 FlowSchema，不应强制引入图形引擎代码 -> 子路径导出（`@banyuan/banvasgl/flow/server`）+ tsup splitting 保证后端入口只加载流程执行器代码。

**约束：**

- Flow 源码位于 `packages/banvasgl/src/flow/`，包含 runtime/executors/presets/types 四个子目录
- 子路径导出：`./flow`（核心）/ `./flow/client`（前端预设）/ `./flow/server`（后端预设）
- tsup splitting 保证各入口文件独立打包，后端引入 flow/server 不会加载图形引擎代码
- App 运行态通过 `createClientFlowRunner()` 创建 FlowRunner 实例，Scene.triggerSchema 直接调用

**反例：**

- Flow 作为独立 npm 包——引入了不必要的包间依赖管理复杂度，且语义上 Flow 就是 BanvasGL 的一部分
- Flow 逻辑与图形引擎代码混编不分离——后端引入云函数执行器时会加载整个图形引擎，依赖爆炸

---

### A5. 前后端执行器共享 FlowSchema 但物理隔离

**✅ 已实施** · 细化 A3

前端通过 createClientFlowRunner() 创建执行器（注册 client + shared 节点），后端通过 createServerFlowRunner() 创建执行器（注册 server + shared 节点）。

**决策链：** 同一个 FlowSchema JSON 在不同环境下执行时可用节点不同 -> Strategy Registry 模式：工厂函数创建 Runner 时按预设批量注册节点执行器。

**约束：**

- 前端绑定点只能调度 client + shared 节点
- 云函数（服务端执行）只能调度 server + shared 节点
- 新增 FlowNode kind 必须明确归属到 client / server / shared 之一
- App 持有唯一的 ClientFlowRunner 实例，Scene.triggerSchema 直接构造 FlowContext 并调用 FlowRunner.run

---

## 产品级架构

### A4. 三态统一引擎，hook 层区分行为

**未实施** · 依赖 A2

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

## 组织总结

### A6. 八层引擎架构

**✅ 已实施** · 依赖 A1~A5

BanvasGL 代码组织为八层：engine（App/Scene/Renderer/Camera/TransactionManager）/ view（View 基类及子类）/ graph（图形基元）/ flow（FlowRunner/FlowSchema/执行器，子路径导出）/ foundation（数学/样式基础）/ types（纯接口契约）/ actions（封装操作函数）/ hook（React 集成层，peerDep React）。

**决策链：** 单一入口 index.ts 统一导出所有公共 API -> 内部分层清晰化各职责 -> 依赖方向自上而下：engine -> view -> graph -> foundation -> types。flow 层独立于图形层，通过子路径导出服务后端。hook 层桥接引擎与 React 宿主。

**约束：**

- types 层是纯接口，不含实现代码
- foundation 是数学/样式基础设施，不依赖上层
- flow 层含 FlowRunner 调度器、执行器注册表、前后端预设，通过 package.json exports 子路径导出
- actions 封装对 Scene/View 的复合操作，含默认视图创建策略
- hook 层（`src/hook/`）为 React 集成适配，声明 React 为 peerDep，通过子路径 `@banyuan/banvasgl/react` 导出
