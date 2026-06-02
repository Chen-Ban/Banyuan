# ADR-019: 跨平台路径——JSON 中间表示 + WebView 壳 + WebGPU 渲染演进

> 状态：已接受（2025-06-01 修订：确认 WebView 壳为跨平台路径；渲染后端从 Canvas 2D 向 WebGPU 演进，支持 GPU 加速 2D + 3D 渲染 + 游戏生成）  
> 日期：2025-05-21  
> 修订日期：2025-06-01  
> 决策者：chenxin176

## 背景

Banyan 是一个零代码 + AI 设计平台，用户通过拖拽和自然语言操作，产出两份纯数据描述：

- **UI JSON（pages）**：视图树、样式、布局、数据绑定
- **Flow JSON（schema）**：逻辑节点、连线、条件分支、执行参数

80% 的内容由 AI 生成，20% 由用户微调。人不写代码——这意味着我们不需要设计一门编程语言，也不需要通用 AST 到目标语言的编译器。

问题：当 Banyan 要支持构建跨平台应用（Web、macOS、Windows、iOS、Android）时，跨平台渲染和逻辑执行应该以什么方式实现？进一步——当产品目标扩展到 3D 场景和游戏生成时，渲染层应该如何演进？

## 决策

采用「JSON 中间表示 + WebView 壳 + 渲染后端从 Canvas 2D 向 WebGPU 渐进升级」的路径。

- **跨平台**：所有平台通过 WebView 壳运行同一份 Web 代码，不做原生渲染适配
- **渲染演进**：BanvasGL 引擎内部渲染后端从 Canvas 2D 迁移到 WebGPU，利用 GPU 加速 2D 渲染并天然支持 3D 场景
- **产品扩展**：WebGPU 渲染能力使平台从「2D 业务应用生成」自然延伸到「3D 场景/游戏生成」

## 核心认知

**UI JSON 和 Flow JSON 本身就是平台无关的中间表示。** 它们描述的是「画什么」和「做什么」，不涉及「怎么画」和「怎么执行」。这两份 JSON 的地位等同于 Flutter 的 Display List——是一套有限的、声明式的指令集，而非图灵完备的通用代码。

**渲染后端是引擎内部实现细节，对上层 JSON 透明。** 无论底层是 Canvas 2D 还是 WebGPU，UI JSON 的结构不变——这意味着渲染后端的升级不影响用户数据、AI 生成逻辑、Flow 引擎。这是引擎内部的技术演进，不是产品层的 breaking change。

**WebGPU 是 Web 标准，仍在 WebView 内运行。** 从 Canvas 2D 迁移到 WebGPU 不违背「WebView 壳 + Web 渲染」的跨平台路径。它只是渲染后端从 CPU 绘制升级到 GPU 绘制——同样的 Web API，同样的跨平台模型。

## 架构

```
设计工具（Banyan）产出
┌──────────────────┐  ┌──────────────────┐
│  UI JSON (pages) │  │  Flow JSON       │
│  视图树 + 样式    │  │  (schema)        │
│  + 布局 + 绑定    │  │  节点 + 连线      │
│  + 3D 场景描述    │  │                  │
└────────┬─────────┘  └────────┬─────────┘
         │                     │
         ▼                     ▼
┌──────────────────────────────────────────┐
│  BanvasGL 引擎                            │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  Renderer 抽象层                    │  │
│  │  (统一的绘制指令接口)                │  │
│  └──────────┬──────────┬──────────────┘  │
│             │          │                 │
│        ┌────▼────┐ ┌───▼──────────┐     │
│        │Canvas2D │ │  WebGPU      │     │
│        │Backend  │ │  Backend     │     │
│        │(当前)   │ │  (演进目标)   │     │
│        │         │ │  ・GPU 加速2D │     │
│        │         │ │  ・3D 渲染    │     │
│        │         │ │  ・着色器管线 │     │
│        └─────────┘ └──────────────┘     │
│                                          │
│  + FlowRunner（流程执行）                 │
└────────────────────┬─────────────────────┘
                     │
                     │  同一份 Web 代码
                     │
         ┌───────────┼───────────┐
         ▼           ▼           ▼
┌─────────────┐┌─────────────┐┌──────────────┐
│  Web        ││  Desktop    ││  Mobile      │
│  浏览器直接  ││  Electron   ││  Capacitor   │
│  运行        ││  WebView    ││  WKWebView / │
│             ││             ││  WebView     │
│  ─────────  ││  ─────────  ││  ─────────── │
│  无壳        ││  平台壳      ││  平台壳       │
│             ││  + Bridge   ││  + Bridge    │
└─────────────┘└─────────────┘└──────────────┘
```

## 渲染后端演进路径：Canvas 2D → WebGPU

### 为什么从 Canvas 2D 走向 WebGPU

**1. 2D 性能瓶颈。** Canvas 2D 是 CPU 绘制——每一帧的矩形、圆角、阴影、文本都由 CPU 逐像素计算。对于简单业务表单足够，但当场景复杂度提升（大量节点的流程图、数据密集的可视化、复杂动画）时，Canvas 2D 会成为瓶颈。WebGPU 将这些绘制操作批量提交到 GPU 并行执行，帧率和吞吐量有数量级提升。

**2. 3D 是产品路线图的必然。** 用户用 AI 生成 3D 场景（产品展示、空间布局、数据可视化的三维表达）是自然的产品演进。Canvas 2D 无法渲染 3D，WebGL 能力有限且 API 陈旧。WebGPU 是 Web 上现代 GPU 编程的唯一正确答案——它对标 Vulkan/Metal/D3D12 的设计理念，支持 Compute Shader、多 Pass 渲染、GPU 端状态管理。

**3. 游戏生成是终极形态。** 当渲染引擎具备 WebGPU 能力（3D 渲染、物理引擎集成、粒子系统、骨骼动画），用户通过 AI 自然语言生成简单游戏成为可能。这是从「业务应用生成」到「交互体验生成」的跨越，而渲染后端是技术基础。

**4. WebGPU 的浏览器支持已就绪。** Chrome 113+（2023.05）、Edge 113+、Safari 18+（2024.09）均已支持 WebGPU。Electron 25+（Chromium 113+）默认启用。这不是实验性技术，而是已落地的 Web 标准。

### 渲染后端分层设计

BanvasGL 引擎内部引入 Renderer 抽象，使渲染后端可切换：

```typescript
/** 渲染后端抽象接口 */
interface IRenderBackend {
  /** 初始化渲染上下文 */
  init(canvas: HTMLCanvasElement): Promise<void>

  /** 2D 绘制原语 */
  drawRect(x: number, y: number, w: number, h: number, style: FillStyle): void
  drawRoundRect(x: number, y: number, w: number, h: number, radius: number[], style: FillStyle): void
  drawPath(path: Path2DData, style: StrokeStyle | FillStyle): void
  drawText(text: string, x: number, y: number, style: TextStyle): void
  drawImage(image: ImageSource, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void
  drawShadow(config: ShadowConfig): void

  /** 变换 */
  save(): void
  restore(): void
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void
  setClip(path: Path2DData): void

  /** 帧控制 */
  beginFrame(): void
  endFrame(): void

  /** 3D 扩展（WebGPU backend 实现，Canvas2D backend 抛出 NotSupported） */
  render3DScene?(scene: Scene3DData): void

  /** 资源管理 */
  dispose(): void
}
```

**Canvas2DBackend**（当前实现）直接映射到 CanvasRenderingContext2D API，零成本封装。

**WebGPUBackend**（演进目标）将 2D 绘制指令编译为 GPU Draw Call：
- 矩形/圆角/路径 → 三角形网格 + Fragment Shader
- 文本 → SDF（Signed Distance Field）字体渲染或 Glyph Atlas
- 图片 → GPU 纹理采样
- 阴影/模糊 → Compute Shader 高斯模糊
- 批量绘制 → Instanced Drawing，一次 Draw Call 渲染数百个同类图元

### 3D 渲染能力扩展

WebGPU Backend 天然支持 3D 渲染。在 UI JSON 中引入 3D 场景描述：

```typescript
/** 3D 视图类型扩展 */
interface IScene3DView {
  type: 'scene3d'
  /** 3D 场景数据 */
  scene: {
    camera: { position: Vec3, target: Vec3, fov: number }
    lights: LightData[]
    objects: Object3DData[]  // mesh + material + transform
    environment?: EnvironmentData  // skybox / IBL
  }
  /** 交互配置 */
  interaction: {
    orbitControl?: boolean   // 轨道控制
    raycast?: boolean        // 射线拾取
  }
}
```

这样用户通过 AI 描述「展示一个 3D 产品模型，可以 360° 旋转」，XiangDi Agent 生成对应的 scene3d 视图 JSON，BanvasGL WebGPU Backend 渲染。

### 游戏生成的技术路径

当 WebGPU Backend 具备以下能力，「AI 生成游戏」成为可能：

| 能力层 | 技术实现 | 对应的 JSON 描述 |
|--------|----------|-----------------|
| 渲染 | WebGPU 3D 渲染管线 | scene3d 视图 + mesh/material/light |
| 物理 | WASM 物理引擎（Rapier/Jolt） | physics 配置节点 |
| 动画 | 骨骼动画 + 关键帧插值 | animation 数据 |
| 粒子 | GPU Compute Shader 粒子系统 | particle 视图 |
| 输入 | 游戏手柄 / 触摸映射 | input binding 配置 |
| 逻辑 | FlowRunner 游戏逻辑节点 | Flow JSON（已有） |

所有这些能力仍然是**数据驱动**的——AI 生成的是 JSON 描述（场景/物理/动画/粒子/输入），引擎解释执行。这与 Banyuan 的核心模型完全一致：用户不写代码，AI 生成声明式数据，引擎渲染和执行。

## 为什么不自建语言

**1. 用户不写代码。** 自建语言的前提是有人类开发者需要阅读和编写它。Banyan 的用户是设计师和业务人员，他们操作的是可视化界面和自然语言，产出的是 JSON 数据。没有人需要一门新语言。

**2. JSON 已经是足够好的中间表示。** UI JSON 描述的是有限的视觉原语（矩形、文本、图片、容器、滚动列表、3D 场景……），Flow JSON 描述的是有限的逻辑原语（条件分支、循环、HTTP 请求、数据映射、物理模拟步进……）。这些指令集是封闭的、可枚举的，不需要图灵完备的表达能力。

**3. 解释执行比编译更适合这个场景。** 编译到原生代码适合性能敏感 + 长期运行的场景。而 Banyan 构建的应用本质上是「数据驱动的声明式 UI + 事件触发的有限逻辑流」，解释执行的开销完全可接受，且带来热更新、动态加载等灵活性。渲染性能由 GPU（WebGPU）承担，逻辑执行由 V8/JSCore 承担，都不需要 AOT 编译。

## 统一接口层的职责

统一接口层是 banvasgl 和 flow 引擎需要定义的核心契约。它不关心底层用哪个渲染后端，只定义「上层 JSON 需要什么能力才能被正确渲染/执行」。

渲染侧需要的原语（banvasgl Renderer 抽象）：

- 创建/销毁视图节点
- 布局计算（盒模型、flex、绝对定位）
- 2D 图形绘制（矩形、圆角、路径、文本、图片、阴影）
- 3D 场景渲染（网格、材质、光照、相机、环境）
- 事件绑定（点击、滑动、输入、射线拾取）
- 数据绑定（视图属性与数据源的响应式连接）
- 动画驱动（属性过渡、关键帧、骨骼动画）
- 粒子系统（GPU 粒子发射/更新/渲染）

执行侧需要的原语（flow FlowRunner 抽象）：

- 节点求值（计算节点输出）
- 条件分支（布尔表达式求值）
- 数据映射（JSON path 取值/赋值）
- 副作用执行（HTTP 请求、本地存储、导航跳转）
- 异步控制（等待、并发、超时）
- 物理模拟控制（启动/暂停/步进）
- 游戏循环控制（帧更新、碰撞响应）

当前 banvasgl 的 Renderer/Scene/View 体系和 flow 的 FlowRunner/NodeExecutor 注册表已经在做这件事。渲染后端抽象层（IRenderBackend）是新增的中间层，使 Canvas 2D 和 WebGPU 可切换。

## 各平台的实现路径

所有平台共享同一套 Web 渲染实现（BanvasGL），通过平台壳提供 WebView 容器：

- **Web**：浏览器直接运行，无壳。支持 WebGPU 的浏览器使用 GPU 渲染，不支持的自动 fallback 到 Canvas 2D
- **macOS/Windows 桌面**：Electron 壳（Chromium 内核，WebGPU 已默认启用），Bridge 提供原生能力（见 ADR-038）
- **iOS 移动端**：Capacitor 壳（WKWebView，Safari 18+ 支持 WebGPU），Bridge 提供摄像头/蓝牙等原生能力
- **Android 移动端**：Capacitor 壳（Chrome WebView，已支持 WebGPU），Bridge 提供原生能力

不做 WebView 外的原生渲染适配（Metal/D3D/Vulkan 直接调用）。理由：WebGPU 本身就是 Metal/D3D12/Vulkan 的 Web 抽象——它在各平台的底层实现正是调用这些原生图形 API。通过 WebGPU 间接使用 GPU 与直接调用原生 API 的性能差距极小（一层薄 wrapper），但开发和维护成本天差地别。

## banvas-runtime 的定位

banvas-runtime 是**唯一的渲染运行时**，运行在 Web 环境中。它内部通过 IRenderBackend 抽象支持多种渲染后端：

- **Canvas2DBackend**：当前默认实现，覆盖所有 2D 渲染场景，兼容性最广
- **WebGPUBackend**：演进目标，GPU 加速 2D + 3D 渲染 + 游戏能力

运行时自动检测 WebGPU 可用性，优先使用 WebGPU，不可用时 fallback 到 Canvas 2D。对上层（View/Scene/App）完全透明。

## 替代方案

### 方案 A：自建 DSL + 编译到原生代码

设计一门领域语言，将 UI 和逻辑编译为 Swift/Kotlin/JS 等原生代码。

否决原因：没有人类开发者需要读写这门语言。编译器的开发和维护成本极高，且引入了「编译器 bug」这个新的风险源。对于声明式 UI + 有限逻辑流的场景，编译带来的性能收益远不如解释执行带来的灵活性价值大。

### 方案 B：生成 Flutter/React Native 代码

将 JSON 转换为 Flutter Widget 代码或 RN 组件代码，复用现有跨平台框架。

否决原因：引入了对第三方框架的强依赖，受限于其 API 设计和更新节奏。且 Banyan 的视觉原语是自定义的（基于 banvasgl），与 Flutter/RN 的 Widget 体系不一定对得上，胶水代码的维护成本不可控。更重要的是，Flutter/RN 不支持自定义 GPU 渲染管线，无法扩展到 3D/游戏场景。

### 方案 C：WebGL 而非 WebGPU

使用 WebGL 2.0 作为 GPU 渲染后端。

否决原因：WebGL 基于 OpenGL ES 3.0，API 设计陈旧（全局状态机模型），不支持 Compute Shader（粒子系统、物理模拟需要），不支持多线程提交（性能天花板）。WebGPU 是 WebGL 的正式继任者，设计理念对标 Vulkan/Metal/D3D12，支持现代 GPU 编程范式。既然目标是长期演进，应直接押注 WebGPU 而非在即将过时的 WebGL 上投入。

### 方案 D：使用现有 WebGPU 引擎（Three.js/Babylon.js）

直接集成 Three.js 或 Babylon.js 作为 3D 渲染层。

部分采纳：3D 场景渲染可以在 WebGPU Backend 内部利用成熟引擎的数学库/加载器等基础设施。但 2D 渲染管线必须自研——因为 BanvasGL 的 2D 渲染有高度定制的需求（视图树遍历、增量重绘、事件 hit-test、布局系统紧耦合），通用 3D 引擎的 2D 渲染能力无法满足。策略：2D 管线自研 + 3D 场景渲染借力成熟方案的底层能力。

## 实施路径

**阶段 0（当前/MVP）**：Canvas 2D 渲染，满足 2D 业务应用需求。

**阶段 1 — Renderer 抽象层**：
- 在 BanvasGL 内部引入 `IRenderBackend` 接口
- 将当前的直接 Canvas 2D 调用重构为通过 Backend 接口调用
- 实现 `Canvas2DBackend`，行为与重构前完全一致
- 验证：所有现有测试通过，渲染结果像素级一致

**阶段 2 — WebGPU 2D 加速**：
- 实现 `WebGPUBackend` 的 2D 绘制能力
- 矩形/圆角 → GPU instanced drawing
- 文本 → SDF 字体渲染（MSDF atlas）
- 图片 → GPU 纹理
- 阴影/模糊 → Compute Shader
- 验证：大规模流程图（1000+ 节点）帧率对比 Canvas 2D

**阶段 3 — 3D 渲染**：
- 扩展 UI JSON schema，支持 `scene3d` 视图类型
- 实现 3D 渲染管线（PBR 材质、环境光照、阴影）
- 实现 3D 交互（轨道控制、射线拾取）
- XiangDi Agent 支持生成 3D 场景 JSON

**阶段 4 — 游戏能力**：
- 集成 WASM 物理引擎
- 实现 GPU 粒子系统
- 实现骨骼动画系统
- FlowRunner 新增游戏逻辑节点（帧循环、碰撞回调、得分管理）
- XiangDi Agent 支持游戏逻辑生成

## 后果

- 跨平台路径明确：JSON 中间表示 + WebView 壳 + Web 渲染，不做原生渲染适配——WebGPU 本身在各平台底层调用 Metal/D3D12/Vulkan，无需手动适配
- 渲染后端可切换：Canvas 2D（兼容性）和 WebGPU（性能 + 3D）共存，运行时自动选择
- 产品天花板大幅提升：从「2D 业务应用生成」扩展到「3D 场景生成」「游戏生成」，渲染能力不再是瓶颈
- 所有平台行为一致——同一份 Web 代码在所有 WebView 中运行，WebGPU 的跨平台一致性由浏览器厂商保证
- 原生能力通过 Bridge 层注入（ADR-038），渲染能力通过 WebGPU 获得——两者互补，覆盖完整的应用能力谱
- 天然支持热更新：更新 JSON 数据 + Web 资源即可改变应用行为，壳无需更新（ADR-037 Decision 3）
- 增量实施：阶段 0→1 是纯重构不影响功能，阶段 2 是性能升级，阶段 3/4 是能力扩展，各阶段独立可交付
- 风险：WebGPU 在低端 Android WebView 上的支持可能滞后，需保持 Canvas 2D fallback 长期可用
