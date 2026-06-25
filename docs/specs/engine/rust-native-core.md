# BanvasGL Rust 原生核心迁移 — 实施方案

## 关联决策

| 决策 | 状态 | 关联 |
|------|------|------|
| **A0** — 机制/策略分离契约 | ✅ 已实施 | 根定位：runtime ⊃ rendering，只提供机制不内置策略 |
| **A8b** — 平台抽象层 (IDrawingContext/IDrawingSurface) | ✅ 已实施 | Rust 侧的天然 FFI 边界 |
| **A9** — Rust 核心 Step 1：2D 全量改写并验证功能（提案） | 未实施 | 本方案的父决策 |
| **P7** — 引擎纯净原则 | ✅ 已实施 | 核心不依赖 DOM/React |
| **P7a** — Flow 子模块后端独立 | ✅ 已实施 | 后端只取 Flow 执行，不引入渲染代码 |

---

## 术语表（Rust 生态扫盲）

每个术语配有「类比到 TypeScript 生态」对照。

### 项目结构相关

| Rust 术语 | 通俗解释 | TypeScript 类比 |
|-----------|---------|----------------|
| **crate** | Rust 的"包"。一个 crate = 一个编译单元，产出库或可执行文件 | npm 包 |
| **Cargo.toml** | crate 的配置文件。声明名称、版本、依赖 | `package.json` |
| **Cargo workspace** | 把多个 crate 放在同一个仓库里统一管理，共享依赖版本和编译缓存 | pnpm workspace |
| **`lib.rs`** | 库 crate 的入口文件 | `src/index.ts` |
| **`main.rs`** | 可执行 crate 的入口文件 | `src/cli.ts` |
| **`Cargo.lock`** | 锁定所有依赖的精确版本 | `pnpm-lock.yaml` |
| **`rust-toolchain.toml`** | 固定项目使用的 Rust 编译器版本 | `.nvmrc` |

### 编译产物相关

| Rust 术语 | 通俗解释 | TypeScript 类比 |
|-----------|---------|----------------|
| **crate-type** | 声明「这个 crate 编译成什么格式」| tsup 的 `format: ["esm", "cjs"]` |
| **`cdylib`** | C 动态库。编译成 `.so`/`.dylib`/`.dll`。是 napi-rs 编译 Node 原生模块的输出格式 | `.node` 文件 |
| **`rlib`** | Rust 静态库。编译成 `.rlib`，只能被其他 Rust 代码链接 | 无直接类比（类似 `.a` 静态库） |
| **target triple** | 描述「目标平台的 CPU 架构 + OS + C 运行时」的三段式标识符 | `darwin-arm64` / `linux-x64` 这类平台标签 |
| **`.node` 文件** | Node.js 原生扩展的二进制文件。napi-rs 把 `cdylib` 重命名为 `.node` | `.node` 文件 |
| **WASM** | WebAssembly。一种在浏览器/Node 中运行的二进制格式 | 浏览器可直接加载的 `.wasm` 文件 |

### 平台相关

| Rust 术语 | 通俗解释 |
|-----------|---------|
| **glibc** | GNU C Library。标准 Linux 发行版（Ubuntu/Debian/CentOS）用的 C 运行时库 |
| **musl** | 更小的 C 运行时库。Alpine Linux（Docker 常用）用它。与 glibc **不兼容** |
| **MSVC** | Microsoft Visual C++ 运行时。Windows 上 Rust 默认链接它 |
| **darwin** | Apple 操作系统（macOS/iOS）的内核名 |
| **aarch64 / x86_64** | CPU 架构。aarch64 = ARM 64 位（Apple Silicon M1-M4），x86_64 = Intel/AMD 64 位 |

### 绑定/桥接相关

| Rust 术语 | 通俗解释 | 角色 |
|-----------|---------|------|
| **napi-rs** | 一个 Rust 框架，用 Rust 写 Node.js 原生扩展。`#[napi]` 宏暴露函数给 JS | Rust ↔ Node.js 桥 |
| **wasm-bindgen** | 编译 Rust 到 WASM 并自动生成 JS 胶水代码 | Rust ↔ 浏览器/Node（WASM）桥 |
| **wasm-pack** | 封装了 `wasm-bindgen` + 构建 + 打包 npm 的完整流程 | `tsup` 的 WASM 版本 |
| **`#[napi]`** | napi-rs 的属性宏。写在函数/结构体上暴露给 JS | `export` 关键字 |
| **`#[wasm_bindgen]`** | wasm-bindgen 的属性宏 | `export` 关键字 |
| **trait** | Rust 的接口。定义一组方法签名，由具体类型实现 | `interface IDrawingContext` |
| **impl Trait for Struct** | Rust 的"为某个结构体实现某个接口" | `class WebDrawingContext implements IDrawingContext` |

### 工具链相关

| 工具 | 通俗解释 |
|------|---------|
| **cargo** | Rust 的包管理器 + 构建工具 + 测试运行器（三合一） | `pnpm` + `tsup` + `vitest` |
| **rustup** | Rust 版本管理器。安装/切换/更新 Rust 编译器 | `nvm` |
| **cargo-zigbuild** | 让 Rust 交叉编译 Linux 目标的工具（如 macOS → Linux .so） | - |

---

## 0. 前置审计：当前 banvasgl 的 DOM/平台耦合清单

2025-06-21 审计发现 **17 处 DOM/平台耦合违规**（集中于 `src/graph/media/`、`src/foundation/style/`、`src/engine/App.ts`）。A8b 实施后大部分已修复，以下标注当前状态。

### 0.1 渲染循环 — `requestAnimationFrame` ✅ 已修复

| 文件 | 原行号 | 代码 | 状态 |
|------|--------|------|------|
| `engine/App.ts` | 556 | ~~`requestAnimationFrame((timestamp) => ...)`~~ → `surface.requestFrame(callback)` (现 L574) | ✅ A8b 已修复 |
| `engine/App.ts` | 490, 503 | ~~`cancelAnimationFrame(...)`~~ → `surface.cancelFrame(handle)` | ✅ A8b 已修复 |

**当前方案**：`IDrawingSurface.requestFrame(callback)` 抽象了帧同步原语（Web 平台 = rAF，Node/headless = setTimeout）。Rust 侧无需改变——Host 在自有事件循环中调用 `engine.render_frame(timestamp)`。

### 0.2 DOM 元素创建 — `document.createElement` ✅ 已修复

| 文件 | 原行号 | 代码 | 状态 |
|------|--------|------|------|
| `graph/media/ImageElement.ts` | 236 | ~~`document.createElement('canvas')`~~ → 已移除，pixel extraction 走 `ctx.getImageData()` | ✅ A8b 已修复 |
| `graph/media/VideoElement.ts` | 110 | ~~`document.createElement("video")`~~ → `loadVideoWithContext(ctx)` 通过平台注入 | ✅ A8b 已修复 |
| `graph/media/VideoElement.ts` | 424 | ~~`document.createElement("canvas")`~~ → 同上 | ✅ A8b 已修复 |
| `foundation/style/Video.ts` | 269 | ~~`document.createElement('video')`~~ → 已改为 `ctx.loadVideoSource()` | ✅ A8b 已修复 |

**当前方案**：媒体加载统一走 `IDrawingContext.loadImageSource()` / `loadVideoSource()`，引擎只持有平台无关 `IImageSource` / `IVideoSource`。

### 0.3 浏览器构造函数 — `new Image()` ✅ 已修复

| 文件 | 原行号 | 代码 | 状态 |
|------|--------|------|------|
| `graph/media/ImageElement.ts` | 108 | ~~`const img = new Image()`~~ → `loadImageWithContext(ctx)` | ✅ A8b 已修复 |
| `foundation/style/Image.ts` | 166 | ~~`new globalThis.Image()`~~ → `setLoadedSource(source)` + `ctx.createPattern(...)` | ✅ A8b 已修复 |

**当前方案**：平台通过 `ctx.loadImageSource()` 返回 `IImageSource`；`Image` 类通过 `setLoadedSource()` 接收。`createCanvasPattern()` 委托给 `ctx.createPattern(this._loadedSource, this.repeat)`。

### 0.4 DOM 类型泄露 ✅ 基本修复

| 文件 | 原行号 | 泄露的类型 | 状态 |
|------|--------|-----------|------|
| `graph/media/VideoElement.ts` | 42 | ~~`HTMLVideoElement`~~ → 现为 `video: IImageSource \| null` | ✅ 已修复 |
| `foundation/style/Video.ts` | 265 | ~~`HTMLVideoElement`~~ → 已移除 DOM 创建 | ✅ 已修复 |
| `graph/media/ImageElement.ts` | 390 | ~~`HTMLCanvasElement`~~ 参数（@deprecated） | ✅ 已废弃 |
| `graph/media/MediaElement.ts` | 304 | ~~`ImageData`~~ → `getImageData(): IImageSource \| null` | ✅ 已修复 |
| `graph/media/ImageElement.ts` | 233 | ~~`ImageData`~~ → `IImageSource` | ✅ 已修复 |
| `graph/media/VideoElement.ts` | 421 | ~~`ImageData`~~ → `IImageSource` | ✅ 已修复 |
| `graph/media/ImageElement.ts` | 244 | ~~`CanvasImageSource`~~ 强转 → 已移除 | ✅ 已修复 |

**残余**：部分 JSDoc 注释中仍使用 `HTMLImageElement`/`HTMLVideoElement` 作为概念描述（非代码路径），不影响实际类型安全。

### 0.5 其他

| 文件 | 原行号 | 内容 | 状态 |
|------|--------|------|------|
| `view/View/View.ts` | 81 | ~~`localStorage.getItem()`~~ — debug 特性 | ✅ 已移除 |
| `engine/renderer/Renderer.ts` | ~85 | `performance.now()` — FPS 统计 | 🟡 低优先级残留 |

**Rust 侧方案**：`performance.now()` 仅用于 renderer 内部 FPS 统计（`updateFPS`），不影响核心逻辑。Rust 侧使用 Host 传入的 `timestamp` 参数或 `std::time::Instant`。

---

## 1. 架构总览

### 1.1 核心原则

```
┌──────────────────────────────────────────────────────────────────┐
│                     A0 机制 / 策略分离                            │
│                                                                  │
│  机制（Rust 核心）               策略（TypeScript 宿主层）          │
│  ────────────────                ────────────────────────          │
│  • 场景树遍历                     • InteractionStateMachine        │
│  • 布局计算 (flex/list/grid)     • ClickRecognizer/DragRecognizer │
│  • 命中检测 (hitTest)            • useDesignBanvas/useRuntimeBanvas│
│  • FlowSchema 执行               • flowEnabled gate               │
│  • 动画插值                       • ResizeObserver / DPR 响应     │
│  • 几何变换 (Matrix4)            • 平台画布创建 (HTMLCanvasElement)│
│  • 脏标记传播                     • 事件适配 (DOM → InteractionInput)│
│  • 序列化/反序列化                • 网络图片/视频解码              │
│  • 视口裁剪                       • 帧调度 (rAF / setInterval)    │
│  • Graph 图形基元渲染             • 字体加载与文本塑形              │
│                                  • 平台剪贴板 / 文件系统           │
└──────────────────────────────────────────────────────────────────┘
```

**Rust 核心不持有**：DOM 引用、React 依赖、`requestAnimationFrame`、`document`、`window`、`HTMLCanvasElement`、`OffscreenCanvas`、`CanvasRenderingContext2D`、`localStorage`。

**Rust 核心只对外暴露 2 个 trait（平台注入）+ 数据 struct + 方法调用**：

| 类别 | 名称 | 方向 | 职责 |
|------|------|------|------|
| **trait** | `DrawingContext` | Host → Rust | 2D 绘图命令（~40 方法），对应已有 TS `IDrawingContext` |
| **trait** | `PlatformCanvas` | Host → Rust | 画布工厂 + 双缓冲 + composite，对应已有 TS `IDrawingSurface` |
| **struct** | `PixelBuffer` | Host → Rust | RGBA8 像素数据（纯数据，非 trait），Host 解码后传入 |
| **struct** | `InteractionInput` | Host → Rust | 已归一化的原子事件（已有 M10a 定义，纯数据） |
| **方法** | `engine.render_frame(ts)` | Host → Rust | Host 在自有的帧循环中每帧调用 |
| **方法** | `engine.handle_pointer_event(e)` | Host → Rust | Host 把归一化后的原子事件传给引擎 |

**为什么没有 FrameScheduler / ImageLoader / EventSource / FontProvider trait**：

- **帧循环**：属于 Host 的平台资源（rAF / setInterval）。Rust 不拥有事件循环，只提供 `render_frame()` 方法让 Host 调用。这是 Vello / tiny-skia / CanvasKit 的一致做法——渲染核心是库，不是框架。
- **图片/视频解码**：解码器是谁的不重要，重要的是解码产物是纯数据的 `PixelBuffer`。Host 用平台最优方案解码（Web 走浏览器硬件加速，Native 走 `image` crate），交给 Rust 存储和渲染。
- **输入事件归一化**：M10a 已定义平台无关的 `InteractionInput` 类型（`PointerDownInput | PointerMoveInput | ...`），Host 负责「原生事件 → InteractionInput」归一化（banvas-runtime / useInteraction），Rust 只接收已归一化的 struct 并做命中检测。不需要 trait。
- **字体塑形**：Phase 2+ 再评估，暂不抽象。Web 平台继续走 Canvas text API。

### 1.2 Rust workspace 与 TS 包的对应关系

```
Banyuan/
├── Cargo.toml                          # workspace 根
├── rust-toolchain.toml
├── crates/
│   ├── banvasgl-core/                  # 引擎核心 — 纯 Rust，零平台依赖
│   │   ├── Cargo.toml                  # crate-type = ["rlib"]
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── math/                   # Matrix4, Point2, Vector2 → glam
│   │       ├── graph/                  # 17 种图形基元（analytic/combined/trajectory/media/text）
│   │       ├── view/                   # View 树 + 布局引擎
│   │       ├── scene/                  # 场景管理 + 渲染遍历
│   │       ├── flow/                   # FlowSchema 执行器（25 NodeKind）
│   │       ├── animation/             # 动画描述符 + 插值器 + 管理器
│   │       ├── hit_test/              # 命中检测（AABB + path hit）
│   │       ├── layout/                # flex / list / grid / scroll 布局策略
│   │       ├── style/                  # 样式系统（Color/FillStyle/StrokeStyle/ShadowStyle/Gradient）
│   │       ├── transaction/           # 事务系统（undo/redo 栈）
│   │       ├── media/                 # 媒体数据类型
│   │       │   └── pixel_buffer.rs    # PixelBuffer struct（纯数据）
│   │       └── platform/              # 平台抽象 trait 定义（仅 2 个）
│   │           ├── drawing.rs         # DrawingContext trait
│   │           └── surface.rs         # DrawingSurface trait
│   │
│   └── banvasgl-render/               # 渲染后端 — 可选 GPU/CPU 后端
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs                 # RenderBackend trait
│           ├── tiny_skia.rs           # CPU 回退渲染（tiny-skia）
│           ├── vello.rs               # 2D GPU 渲染（vello + wgpu）
│           └── rend3.rs               # 3D GPU 渲染（rend3 + wgpu，A9a）

packages/
├── banvasgl/                          # TS 壳 — 类型重导出 + 兼容层
│   ├── src/
│   │   ├── index.ts                   # 从 banvasgl-core WASM 重导出类型
│   │   ├── compat.ts                  # 旧 API 兼容适配器
│   │   └── types/                     # 保留纯类型定义（供 TS 侧消费）
│   └── package.json                   # dependencies: @banyuan/banvasgl-native
│
├── banvasgl-native/                   # Rust → JS 绑定（napi-rs + wasm-pack）
│   ├── package.json
│   ├── Cargo.toml                     # 不在 workspace 内（见 §10 决策 1）
│   ├── src/
│   │   └── lib.rs                     # #[napi] / #[wasm_bindgen] 绑定
│   └── wasm/                          # wasm-pack 产出
│
├── banvasgl-react/                    # Web 平台注入 + React Hook
│   ├── src/
│   │   ├── platform/
│   │   │   ├── WebDrawingContext.ts   # → Rust DrawingContext trait
│   │   │   └── WebPlatformCanvas.ts   # → Rust DrawingSurface trait
│   │   └── hooks/
│   │       ├── useCanvasInit.ts       # 注入平台实现到 Rust 核心
│   │       └── useCanvasCamera.ts
│   └── package.json                   # peerDep: react, @banyuan/banvasgl
│
└── banvas-react-runtime/              # 运行策略层（Web 交互识别，不变）
    └── package.json
```

### 1.3 数据流

```
┌─────────────────────────────────────────────────────────────────┐
│  TypeScript 宿主层（策略）                                       │
│                                                                 │
│  useCanvasInit(HTMLCanvasElement)                               │
│    │                                                            │
│    ├─ 1. WebDrawingContext(canvas.getContext('2d'))             │
│    ├─ 2. WebPlatformCanvas(canvas)                              │
│    │      // Web 平台实现 DrawingSurface trait                   │
│    ├─ 3. engine = RustEngine.create(platform_canvas)            │
│    │                                                            │
│    │   // Host 拥有帧循环，Rust 不感知调度                      │
│    ├─ 4. rAF loop:                                              │
│    │     engine.render_frame(timestamp)    ← Rust 方法调用      │
│    │                                                            │
│    │   // Host 拥有输入归一化，Rust 只接收已归一化的 struct       │
│    └─ 5. canvas.addEventListener('pointerdown', (e) => {       │
│           let input = normalize_to_interaction_input(e);        │
│           engine.handle_pointer_event(input);  ← Rust 方法调用  │
│         });                                                     │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Rust 核心（机制）— crates/banvasgl-core                  │   │
│  │                                                          │   │
│  │  Engine {                                                 │   │
│  │    scene: Scene,                                         │   │
│  │    renderer: Renderer,                                   │   │
│  │    layout_engine: LayoutEngine,                          │   │
│  │    hit_test: HitTestEngine,                              │   │
│  │    flow_runner: FlowRunner,                              │   │
│  │    animation_mgr: AnimationManager,                      │   │
│  │    transaction_mgr: TransactionManager,                  │   │
│  │    camera: Camera,                                       │   │
│  │    images: HashMap<ImageId, PixelBuffer>,  // 纯数据存储  │   │
│  │  }                                                        │   │
│  │                                                          │   │
│  │  /// Host 每帧调用（Host 拥有事件循环）                     │   │
│  │  pub fn render_frame(&mut self, timestamp_ms: f64) {      │   │
│  │    self.animation.tick(timestamp_ms);          // 动画插值 │   │
│  │    if !self.is_dirty() { return; }             // 脏检查  │   │
│  │    let visible = self.camera.cull(&self.scene); // 视口裁剪│   │
│  │    for view in visible {                                 │   │
│  │      view.render(self.platform.drawing_context());       │   │
│  │    }                                                     │   │
│  │    self.platform.composite();                            │   │
│  │  }                                                        │   │
│  │                                                          │   │
│  │  /// Host 把已归一化的原子事件传给引擎                       │   │
│  │  pub fn handle_pointer_event(&mut self, e: InteractionInput) │
│  │    -> HitTestResult { ... }                               │   │
│  │                                                          │   │
│  │  /// Host 解码图片后传入像素数据                            │   │
│  │  pub fn add_image(&mut self, id: ImageId, px: PixelBuffer) │
│  └─────────────────────────────────────────────────────────┘   │
│           │                                                     │
│           │ 仅通过 2 个 trait 调用平台实现                        │
│           ▼                                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  WebDrawingContext → CanvasRenderingContext2D            │   │
│  │  WebPlatformCanvas → HTMLCanvasElement + OffscreenCanvas │   │
│  │  // 实现 DrawingSurface trait                               │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. 迁移范围矩阵

### 2.1 迁移到 Rust 的模块

| TS 模块 | Rust crate / module | Phase |
|---------|---------------------|-------|
| `foundation/math/*` | 直接使用 `glam` crate | 1 |
| `graph/analytic/*` (6 种 + 1 基类 AnalyticGraph) | `graph/analytic/` — 纯几何计算 | 2 |
| `graph/combined/*` (6 种 + 1 基类 CombinedGraph) | `graph/combined/` | 2 |
| `graph/base/Bounds.ts` | `graph/bounds.rs` — AABB | 2 |
| `graph/base/Graph.ts` | `graph/graph.rs` — 基类 | 2 |
| `graph/text/*` | `graph/text/` | 2 |
| `graph/media/MediaElement.ts` | `graph/media/` — 抽象基类 | 2 |
| `graph/media/ImageElement.ts` | `graph/media/image.rs` | 2 |
| `graph/media/VideoElement.ts` | `graph/media/video.rs` | 2 |
| `graph/trajectory/*` | `graph/trajectory/` | 2 |
| `graph/algorithm/IntersectionUtils.ts` | `graph/intersection.rs` | 2 |
| `view/View/View.ts` | `view/view.rs` — View 基类 | 2 |
| `view/View/constant.ts` | `view/view_constants.rs` | 2 |
| `view/View/utils.ts` | `view/view_utils.rs` | 2 |
| `view/ContainerView/` | `view/container.rs` | 2 |
| `view/CombinedViews/*` | `view/combined.rs` | 2 |
| `view/CombinedViews/layout/*` | `layout/` — 布局引擎 | 2 |
| `view/addon/*` (6 addons) | `view/addon/` | 2 |
| `view/FlowViews/*` | `view/flow_views/` | 3 |
| `view/MediaViews/*` | `view/media_views/` | 3 |
| `view/TextView/` | `view/text_view.rs` | 3 |
| `engine/scene/Scene.ts` | `scene/scene.rs` | 2 |
| `engine/scene/layer/` | `scene/layer.rs` | 2 |
| `engine/scene/snap/` | `scene/snap/` | 2 |
| `engine/scene/utils/ViewTree.ts` | `scene/view_tree.rs` | 2 |
| `engine/scene/transaction/*` | `transaction/` | 3 |
| `engine/renderer/Renderer.ts` | `renderer/` | 2 |
| `engine/camera/*` | `engine/camera/` | 2 |
| `engine/material/*` ⚠️ 当前未实施 | `material/` — 物料系统 | 3 |
| `graph/DefaultStyleRegistry.ts` | `graph/default_style.rs` | 2 |
| `foundation/utils.ts` | `foundation/utils.rs` | 2 |
| `foundation/animation/*` | `animation/` | 3 |
| `foundation/flow/*` | `flow/` — Flow 执行器 | 3 |
| `foundation/style/*` | `style/` — 样式系统 | 2 |
| `foundation/constants.ts` | `constants.rs` | 2 |

### 2.2 保留在 TypeScript 的模块

| 模块 | 理由 |
|------|------|
| `engine/App.ts` | 编排层 — 组装 Rust 组件 + 宿主事件桥接 + `useSyncExternalStore` 协议 |
| `engine/serialization/*` (含 `rawjson/` + `template/` 子目录) | 序列化/反序列化 — Rust 侧通过 `serde` 自动序列化，TS 侧保留类型注册和 `fromJSON` 工厂；长期考虑 FlatBuffers |
| `actions/*` | 高阶操作 API — 对 Rust 核心的 thin wrapper，透传即可 |
| `types/*` | 纯类型定义 — 保留供 TS 消费 |
| `foundation/guards.ts` | 类型守卫 — TS-only 特性 |
| `view/property/*` | PropertyAdapter — 交互层的策略，非核心机制 |
| `view/GraphViews/*` | SelectBoxView 等编辑态专属视图 — 上层编辑策略 |

### 2.3 已抽象化 / 废弃的模块

> 以下模块的 DOM 耦合部分已在 A8b 中通过平台注入模式解耦，Rust 迁移时不再需要特殊处理。

| 模块 | 原因 |
|------|------|
| `graph/media/ImageElement.ts` (图片加载) | ✅ A8b 已解耦 → `loadImageWithContext(ctx)`；Rust 侧 Host 解码为 `PixelBuffer` |
| `graph/media/VideoElement.ts` (视频加载) | ✅ A8b 已解耦 → `loadVideoWithContext(ctx)`；Rust 侧 Host 解码为 `PixelBuffer` |
| `foundation/style/Image.ts` (图片图案) | ✅ A8b 已解耦 → `setLoadedSource()` + `ctx.createPattern()` |
| `foundation/style/Video.ts` (视频源) | ✅ A8b 已解耦 → `ctx.loadVideoSource()` |
| `view/View/View.ts` L81 localStorage | ✅ 已移除 |
| `graph/media/ImageElement.ts` (CanvasImageSource cast) | ✅ A8b 已解耦 → 使用 `IImageSource` |

---

## 3. Phase 1 原型：文件骨架与代码

### 3.1 Cargo.toml（仓库根 — Rust workspace 配置）

```toml
[workspace]
members = ["crates/*"]
# banvasgl-native 的 binding crate 不放在 workspace 内（见 §10 决策 1）

[workspace.dependencies]
glam = "0.28"          # Rust 的数学库（Matrix4, Vec3 等）—— 类比 gl-matrix
wasm-bindgen = "0.2"   # Rust → WASM 绑定

[profile.release]
opt-level = 3
lto = true
```

### 3.2 rust-toolchain.toml

```toml
[toolchain]
channel = "stable"
```

> 类似 `.nvmrc`。CI 读到这个文件自动安装对应 Rust 版本。

### 3.3 banvasgl-core Cargo.toml

```toml
[package]
name = "banvasgl-core"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["rlib"]

[dependencies]
glam = { workspace = true }

[target.wasm32-unknown-unknown.dependencies]
wasm-bindgen = { workspace = true }
```

> 条件依赖——只在编译目标为 WASM 时才引入 `wasm-bindgen`。类似 `optionalDependencies`。

### 3.4 DrawingContext trait（精简版用于原型）

```rust
// crates/banvasgl-core/src/platform/drawing.rs

pub trait DrawingContext {
    // 状态管理
    fn save(&mut self);
    fn restore(&mut self);

    // 变换
    fn set_transform(&mut self, a: f64, b: f64, c: f64, d: f64, e: f64, f: f64);

    // 路径
    fn begin_path(&mut self);
    fn move_to(&mut self, x: f64, y: f64);
    fn line_to(&mut self, x: f64, y: f64);
    fn arc(&mut self, x: f64, y: f64, radius: f64,
           start_angle: f64, end_angle: f64, counterclockwise: bool);

    // 样式
    fn set_fill_style(&mut self, color: &str);
    fn set_stroke_style(&mut self, color: &str);
    fn set_line_width(&mut self, width: f64);

    // 填充与描边
    fn fill(&mut self);
    fn stroke(&mut self);
    fn fill_rect(&mut self, x: f64, y: f64, w: f64, h: f64);

    // 文字
    fn fill_text(&mut self, text: &str, x: f64, y: f64);
}
```

> **为什么 trait 定义在 banvasgl-core 而非 napi-rs 绑定层？** trait 是引擎核心与平台的**契约**，不是绑定细节。TypeScript 侧的 `IDrawingContext` 在 `@banyuan/banvasgl/types/platform/`，Rust 侧的 trait 也应该在 `banvasgl-core`。

### 3.5 Circle 图形基元

```rust
// crates/banvasgl-core/src/graph/circle.rs
use crate::platform::drawing::DrawingContext;

pub struct Circle {
    pub x: f64,
    pub y: f64,
    pub radius: f64,
    pub color: String,
}

impl Circle {
    pub fn new(x: f64, y: f64, radius: f64, color: String) -> Self {
        Self { x, y, radius, color }
    }

    pub fn render(&self, ctx: &mut dyn DrawingContext) {
        ctx.begin_path();
        ctx.arc(self.x, self.y, self.radius, 0.0, std::f64::consts::TAU, false);
        ctx.set_fill_style(&self.color);
        ctx.fill();
    }
}
```

### 3.6 Scene + lib.rs

```rust
// crates/banvasgl-core/src/scene.rs
use crate::platform::drawing::DrawingContext;
use crate::view::View;

pub struct Scene {
    pub views: Vec<View>,
}

impl Scene {
    pub fn new() -> Self { Self { views: Vec::new() } }
    pub fn add_view(&mut self, view: View) { self.views.push(view); }

    pub fn render(&self, ctx: &mut dyn DrawingContext) {
        for view in &self.views {
            view.render(ctx);
        }
    }
}
```

```rust
// crates/banvasgl-core/src/lib.rs
pub mod platform;
pub mod graph;
pub mod math;
pub mod scene;
pub mod view;

pub use scene::Scene;
pub use view::View;
pub use platform::drawing::DrawingContext;
```

---

## 4. Phase 1 原型：napi-rs 绑定与 JS 适配器

### 4.1 napi-rs 自动生成流程

```bash
# 在 packages/banvasgl-native/ 目录下执行
npx @napi-rs/cli new
```

生成标准 napi-rs 项目结构。只需编辑 `src/lib.rs` 暴露 Rust 引擎：

```rust
// packages/banvasgl-native/src/lib.rs
use napi_derive::napi;
use banvasgl_core::{Scene, View, Circle};

#[napi]
pub struct Engine {
    scene: Scene,
}

#[napi]
impl Engine {
    #[napi(constructor)]
    pub fn new() -> Self {
        let mut scene = Scene::new();
        for _ in 0..1000 {
            let circle = Circle::new(
                rand::random::<f64>() * 800.0,
                rand::random::<f64>() * 600.0,
                rand::random::<f64>() * 50.0,
                format!("rgb({},{},{})",
                    rand::random::<u8>(),
                    rand::random::<u8>(),
                    rand::random::<u8>(),
                ),
            );
            scene.add_view(View::from_circle(circle));
        }
        Self { scene }
    }

    #[napi]
    pub fn render(&self, ctx: &mut dyn DrawingContext) {
        self.scene.render(ctx);
    }
}
```

### 4.2 JS 侧 WebDrawingContext 适配器

```typescript
// packages/banvasgl-native/src/adapter.ts
import type { DrawingContext } from './index'; // napi-rs 自动生成

export function createCanvasAdapter(ctx: CanvasRenderingContext2D): DrawingContext {
  return {
    save()              { ctx.save(); },
    restore()           { ctx.restore(); },
    beginPath()         { ctx.beginPath(); },
    moveTo(x, y)        { ctx.moveTo(x, y); },
    lineTo(x, y)        { ctx.lineTo(x, y); },
    arc(x, y, r, sa, ea, ccw) { ctx.arc(x, y, r, sa, ea, ccw); },
    setFillStyle(c)     { ctx.fillStyle = c; },
    setStrokeStyle(c)   { ctx.strokeStyle = c; },
    setLineWidth(w)     { ctx.lineWidth = w; },
    fill()              { ctx.fill(); },
    stroke()            { ctx.stroke(); },
    fillRect(x, y, w, h){ ctx.fillRect(x, y, w, h); },
    setTransform(a,b,c,d,e,f) { ctx.setTransform(a,b,c,d,e,f); },
    fillText(text, x, y){ ctx.fillText(text, x, y); },
  };
}
```

> 这个模式和 `WebDrawingContext` 一致——只是调用方向反了：Rust → JS（napi-rs）vs JS → Canvas。

### 4.3 浏览器测试页面

```html
<!-- test.html -->
<canvas id="c" width="800" height="600"></canvas>
<script type="module">
  import init, { Engine } from './wasm/banvasgl_core.js';
  import { createCanvasAdapter } from './src/adapter.js';

  await init();
  const ctx = document.getElementById('c').getContext('2d');
  const engine = new Engine();
  engine.render(createCanvasAdapter(ctx));
</script>
```

---

## 5. 关键 trait 与数据定义（Phase 2+ 完整版）

### 5.1 DrawingContext trait（完整版 ~40 方法）

Phase 1 原型使用精简版（§3.4）。Phase 2 补齐到与 TS `IDrawingContext` 1:1 对应，涵盖渐变、图案、阴影、像素操作、命中测试等全部能力。

### 5.2 DrawingSurface trait

```rust
// crates/banvasgl-core/src/platform/surface.rs

/// 平台画布表面 — 对应 TS `IDrawingSurface`。
///
/// 合并了旧 `IPlatformCanvas`（画布工厂 + 双缓冲）和 `IEngineContext`（帧调度）的职责。
pub trait DrawingSurface {
    /// 主绘图上下文（直接绘制到屏幕）
    fn main(&mut self) -> &mut dyn DrawingContext;

    /// 离屏双缓冲上下文
    fn offscreen(&mut self) -> &mut dyn DrawingContext;

    /// 将离屏缓冲区合成到主画布
    fn present(&mut self);

    /// 画布物理像素宽度
    fn width(&self) -> u32;

    /// 画布物理像素高度
    fn height(&self) -> u32;

    /// 调整画布逻辑尺寸（内部 × dpr 得到物理像素）
    fn resize(&mut self, logical_width: u32, logical_height: u32);

    /// 设备像素比
    fn dpr(&self) -> f64;
    fn set_dpr(&mut self, dpr: f64);

    /// 清空主画布和离屏缓冲区
    fn clear(&mut self);

    /// 销毁资源
    fn dispose(&mut self);

    /// 请求下一帧回调，返回句柄用于取消。
    /// 各平台使用自己的帧同步原语（Web: rAF, Node: setTimeout, Native: winit RedrawRequested）。
    fn request_frame(&mut self, callback: Box<dyn FnMut(f64)>) -> u32;

    /// 取消已请求的帧回调
    fn cancel_frame(&mut self, handle: u32);
}
```

### 5.3 PixelBuffer — 媒体像素数据（纯 struct，非 trait）

```rust
// crates/banvasgl-core/src/media/pixel_buffer.rs

/// CPU 侧可直接访问的图像像素缓冲区。
/// 这是解决审计 0.2-0.4 的根方案——所有图片/视频帧最终归一化为 PixelBuffer。
///
/// Host 负责解码（Web: createImageBitmap → ImageData, Native: image crate），
/// 构造 PixelBuffer 后传入 Rust。Rust 用它做布局计算 / 命中检测 / 渲染。
#[derive(Clone)]
pub struct PixelBuffer {
    pub width: u32,
    pub height: u32,
    /// RGBA8 格式，行优先（row-major），每行 width * 4 字节
    pub data: Vec<u8>,
}

impl PixelBuffer {
    pub fn new(width: u32, height: u32, data: Vec<u8>) -> Self {
        debug_assert_eq!(data.len(), (width * height * 4) as usize);
        Self { width, height, data }
    }

    pub fn get_pixel(&self, x: u32, y: u32) -> [u8; 4] {
        let idx = ((y * self.width + x) * 4) as usize;
        [self.data[idx], self.data[idx+1], self.data[idx+2], self.data[idx+3]]
    }

    pub fn crop(&self, x: u32, y: u32, w: u32, h: u32) -> PixelBuffer { ... }
}
```

### 5.4 Engine 公共 API（Host 调用方向）

```rust
// crates/banvasgl-core/src/lib.rs

impl Engine {
    pub fn new(platform: Box<dyn DrawingSurface>, options: EngineOptions) -> Self;

    // ── Host 驱动的方法（Host 拥有事件循环）──
    pub fn render_frame(&mut self, timestamp_ms: f64);
    pub fn handle_pointer_event(&mut self, event: InteractionInput) -> HitTestResult;

    // ── 媒体数据注入 ──
    pub fn add_image(&mut self, id: ImageId, pixels: PixelBuffer);
    pub fn remove_image(&mut self, id: ImageId);
    pub fn update_video_frame(&mut self, id: VideoId, frame: PixelBuffer);

    // ── 查询 ──
    pub fn is_dirty(&self) -> bool;
    pub fn get_scene(&self) -> &Scene;
}
```

---

## 6. 分阶段实施路线

### Phase 1：原型验证（1-2 月）

**目标**：Rust → WASM 驱动 Canvas 渲染 1000 个图形，性能对比 TS 版。

**交付物**：
- Cargo workspace + `banvasgl-core` crate（math / graph / simple scene / DrawingContext trait / DrawingSurface trait）
- `banvasgl-native` npm 包（wasm-pack 产出）
- 性能对比报告（TS vs Rust WASM：场景创建、渲染帧时、内存）

**不在此 Phase**：View 树、布局、Flow、动画、事务。

> Phase 1 的 `banvasgl-react` 不需要新增适配器——`WebDrawingContext`（已有）实现 DrawingContext trait，`WebPlatformCanvas`（已有）实现 DrawingSurface trait。Host 侧 rAF loop 直接调 `engine.render_frame(timestamp)`，无需额外抽象。

**新文件清单**：

| 文件 | 内容 |
|------|------|
| `Cargo.toml` | Cargo workspace 根配置 |
| `rust-toolchain.toml` | 固定 Rust 版本 |
| `crates/banvasgl-core/Cargo.toml` | 引擎核心 crate 配置 |
| `crates/banvasgl-core/src/lib.rs` | 入口 |
| `crates/banvasgl-core/src/platform/drawing.rs` | DrawingContext trait |
| `crates/banvasgl-core/src/platform/surface.rs` | DrawingSurface trait |
| `crates/banvasgl-core/src/media/pixel_buffer.rs` | PixelBuffer struct |
| `crates/banvasgl-core/src/graph/circle.rs` | Circle 图形基元 |
| `crates/banvasgl-core/src/math.rs` | Point2/Matrix4（用 glam） |
| `crates/banvasgl-core/src/scene.rs` | Scene |
| `crates/banvasgl-core/src/view.rs` | View |

**验证标准**：
- `cargo test` 有 math / graph / scene 的单元测试
- `wasm-pack build` 成功产出 < 500KB `.wasm`
- 浏览器 Canvas 显示 1000 个彩色圆 + 矩形 + 文本，60fps
- Rust 帧时 < TS 版 50%（预期 2-5x 加速）
- Host 侧 rAF loop 成功驱动 `engine.render_frame()` 稳定 60fps

---

### Phase 2：核心迁移（3-4 月）

**目标**：Graph（17 种） → View 体系 → 布局引擎 → Camera → Renderer → Scene → Style。

| 子阶段 | 内容 | Rust 模块 |
|--------|------|-----------|
| 2a: Graph | 17 种图形基元 + Bounds + 碰撞检测 | `graph/` |
| 2b: View | View 基类 + ContainerView + CombinedView + Addon 管线 | `view/` |
| 2c: Layout | FlexLayoutStrategy / ListLayoutStrategy / GridLayoutStrategy | `layout/` |
| 2d: Camera | OrthographicCamera + PerspectiveCamera | `engine/camera/` |
| 2e: Renderer | 渲染管线（双缓冲 + 优先级分层 + 视口裁剪 + 脏标记） | `renderer/` |
| 2f: Scene | Scene 管理 + LayerManager + SnapSolver + ViewTree 工具 | `scene/` |
| 2g: Style | Color / FillStyle / StrokeStyle / ShadowStyle / Gradient / Pattern | `style/` |

**关键决策**：

1. **View 体系**：Rust 侧用 enum + trait object 而非 class 继承。每个 View 类型是一个 enum variant，共享 `ViewNode` trait（render / hit_test / layout / get_bounds / children）。

2. **布局引擎**：LayoutStrategy trait → 4 个实现（free / flex / list / grid）。

3. **Addon 管线**：声明式 trait `Addon { fn render(...); fn hit_test(...); }`，引擎端 `AddonPipeline` 统一调度——与 TS 版 P9 完全对齐。

4. **文本**：Rust 侧走现有路线——Host 调 `DrawingContext.fill_text()`，Rust 只做排版计算（哪个 View 在哪、多宽多高），不做字形级渲染。`FontProvider` trait 暂不引入。

5. **Serialization**：保留 TS 侧序列化（JSON ↔ Rust struct）。Rust 侧通过 `serde` 自动导出 JSON Schema。长期考虑 FlatBuffers。

---

### Phase 3：应用语义迁移（2-3 月）

**目标**：Flow 执行器（25 NodeKind） + 动画系统 + 事务系统 + 物料系统 + 流程视图。

| 子阶段 | 内容 | Rust 模块 |
|--------|------|-----------|
| 3a: Flow | 25 NodeKind 执行器 + FlowRunner + FlowContext + FrameStack | `flow/` |
| 3b: Animation | AnimationDescriptor + AnimationExecutor + AnimationManager | `animation/` |
| 3c: Transaction | TransactionManager + OperationStack + DiffApplier | `transaction/` |
| 3d: FlowViews | NodeView / EdgeView / PortView | `view/flow_views/` |
| 3e: Material | MaterialInstantiator + MaterialSerializer + 占位符替换 | `material/` |

**关键决策**：

- **Flow 执行器**：25 NodeKind → 25 个 struct 实现 `NodeExecutor` trait。注册表是 `HashMap<&'static str, Box<dyn NodeExecutor>>`。这是**最大单一模块**，也是高性能收益最大的模块——纯计算，无 I/O。
- **前后端共享**：Rust Flow 核心编译为 `rlib`，前端 WASM 和后端 napi-rs 各自链接同一份代码。Node 端额外注入 db 和 httpClient（`ServerCapabilities` trait，与 TS 版 `BackendCapProxy` 对齐）。
- **Flow 执行器隔离**：25 NodeKind 分三类——shared（14）、client-only（7）、server-only（4）——Rust 侧通过 feature flags 条件编译。

---

### Phase 4：包整合 + 多平台（2-3 月）

**目标**：`@banyuan/banvasgl-native` npm 包发布 11 平台预编译二进制；`@banyuan/banvasgl` 变为 thin shell。

**交付物**：
- `banvasgl-native` CI 11 平台交叉编译矩阵（napi-rs 自动生成）
- `@banyuan/banvasgl` v1.0 变为纯转发层（`export * from '@banyuan/banvasgl-native'`）
- `banvasgl-react` 通过 `try { new NativeEngine() } catch { new TSEngine() }` 自动选择后端
- Node.js 平台（napi-rs）：用于 `deploy-agent` 的服务端 Flow 执行
- 移动端（UniFFI）：Swift / Kotlin 绑定（非必须，后续独立 Phase）

---

## 7. 审计问题解决对照表

| 审计项 | TS 违规位置 | 当前状态 | Rust 侧根方案 | Phase |
|--------|------------|---------|--------------|-------|
| `requestAnimationFrame` | `engine/App.ts:556` | ✅ A8b 已修复 → `surface.requestFrame()` | Host 拥有帧循环，Rust 暴露 `render_frame(timestamp)` | 1 |
| `cancelAnimationFrame` | `engine/App.ts:490,503` | ✅ A8b 已修复 → `surface.cancelFrame()` | Host 管理 rAF handle，Rust 不感知 | 1 |
| `document.createElement('canvas')` | `graph/media/ImageElement.ts:236` | ✅ A8b 已修复 → `ctx.getImageData()` | `DrawingContext::create_image_data()` | 2 |
| `document.createElement('canvas')` | `graph/media/VideoElement.ts:424` | ✅ A8b 已修复 → `loadVideoWithContext(ctx)` | 同上 | 2 |
| `document.createElement('video')` | `graph/media/VideoElement.ts:110` | ✅ A8b 已修复 → `ctx.loadVideoSource()` | Host 解码为 `PixelBuffer`，`engine.update_video_frame()` | 2 |
| `document.createElement('video')` | `foundation/style/Video.ts:269` | ✅ A8b 已修复 → `ctx.loadVideoSource()` | 同上 | 2 |
| `new Image()` | `graph/media/ImageElement.ts:108` | ✅ A8b 已修复 → `loadImageWithContext(ctx)` | Host 解码为 `PixelBuffer`，`engine.add_image()` | 2 |
| `new globalThis.Image()` | `foundation/style/Image.ts:166` | ✅ A8b 已修复 → `setLoadedSource()` + `ctx.createPattern()` | 同上 | 2 |
| `localStorage.getItem()` | `view/View/View.ts:81` | ✅ 已移除 | `DebugOptions` struct 由 `Engine::create(opts)` 传入 | 2 |
| `HTMLVideoElement` 类型 | `graph/media/VideoElement.ts:42` | ✅ A8b 已修复 → `video: IImageSource \| null` | 废弃 — Rust 只持有 `VideoId` + `PixelBuffer` | 2 |
| `HTMLVideoElement` 返回类型 | `foundation/style/Video.ts:265` | ✅ A8b 已修复 → 返回 `IVideoSource` | 废弃 — 返回 `PixelBuffer` | 2 |
| `HTMLCanvasElement` 参数 | `graph/media/ImageElement.ts:390` | ✅ 已 @deprecated — 不迁移 | - | - |
| `CanvasImageSource` cast | `graph/media/ImageElement.ts:244` | ✅ A8b 已修复 → 使用 `IImageSource` | 废弃 — 使用 `PixelBuffer` | 2 |
| `ImageData` 返回类型 | `graph/media/MediaElement.ts:304` | ✅ A8b 已修复 → `IImageSource \| null` | `PixelBuffer` struct（Rust 自有） | 2 |
| `performance.now()` | `engine/renderer/Renderer.ts:~85` | 🟡 低优先级残留（仅 FPS 统计） | Host 传入的 timestamp 参数 / `std::time::Instant` | 2 |

> **总计**：17 处违规中，15 处已在 A8b 中修复，1 处 @deprecated 不迁移，1 处低优先级残留（`performance.now()` 用于 FPS 统计，不影响核心逻辑）。

---

## 8. 风险与缓解

| 风险 | 等级 | 缓解 |
|------|------|------|
| WASM ↔ JS 数据传递开销抵消计算收益 | 🔴 高 | Phase 1 先基准测试；如超标，Phase 2 引入 FlatBuffers / shared memory |
| 文本塑形精度不如浏览器 Canvas 2D | 🟡 中 | `cosmic-text` + `harfbuzz` 组合；Web 平台可继续用 Canvas text API + Rust 排版 |
| 双代码库维护 | 🟡 中 | TS 版只修 bug 不加特性，新特性在 Rust 侧实现 |
| Rust 学习曲线 | 🟡 中 | Phase 1 是学习期；术语表辅助；原型期不强制全体参与 |
| banvasgl-react hook 重构 | 🟢 低 | hook 层很薄（~3 个 hook），已有 A8b 平台抽象基础 |

---

## 9. 影响范围

| 层级 | 变更 |
|------|------|
| 新文件 | `Cargo.toml` + `rust-toolchain.toml` + `crates/banvasgl-core/` (~40 .rs) + `crates/banvasgl-render/` (~6 .rs) |
| `@banyuan/banvasgl` | 逐步变为 thin shell — 类型重导出 + 旧 API 兼容适配器 |
| `@banyuan/banvasgl-react` | 无需新增适配器 — 已有 `WebDrawingContext` / `WebPlatformCanvas` 直接对应 2 个 trait（DrawingContext / DrawingSurface）；hook 层增加 rAF loop 调 `engine.render_frame()` |
| `@banyuan/banvasgl-native` | 新建 npm 包 — napi-rs + wasm-pack 双出 |
| `@banyuan/banvas-runtime` | 不变（运行策略层独立于引擎核心） |
| `@banyuan/xiangdi-agent` | 不变（通过 AI Projection 与引擎交互，不直接依赖引擎实现） |
| CI | `.github/workflows/banvasgl-native.yml`（napi-rs 自动生成） |
| 依赖 | Rust: `glam`, `serde`, `wasm-bindgen`, `napi-derive`; JS: 无新增 |

---

## 10. 关键设计决策

### 决策 1：binding crate 不放在 Cargo workspace 内

napi-rs 脚手架在 `packages/banvasgl-native/` 下生成独立 `Cargo.toml`。此 crate **不应**放进仓库根的 Cargo workspace。

**原因（SWC 团队实践）**：workspace 内 binding crate 会尝试用 path dependency 解析版本，导致与 npm 已发布版本冲突。放 workspace 外，binding crate 只依赖已发布的 crate 版本。

**类比**：pnpm workspace 中，若一个包同时被 workspace 内引用和 npm registry 引用，需要 `workspace:^*` 协议区分。

### 决策 2：trait 定义在 banvasgl-core，绑定在 banvasgl-native

`DrawingContext` trait 定义在引擎核心 crate，因为它描述了「引擎需要平台提供什么能力」。napi-rs 绑定层只是把 trait 翻译成 JS 可调用的形式。

**类比**：`IDrawingContext` 在 `@banyuan/banvasgl`（核心），`WebDrawingContext` 在 `@banyuan/banvasgl-react`（Web 适配）。

### 决策 3：开发时绕过 napi-rs，直接编译 WASM 调试

napi-rs 编译 `.node` 需要完整的原生 FFI 设置。原型阶段用 WASM 更快：

```bash
# 开发调试：编译 WASM，浏览器直接加载
cd crates/banvasgl-core
wasm-pack build --target web --out-dir ../../packages/banvasgl-native/wasm

# 发布：编译原生 .node（11 平台矩阵）
cd packages/banvasgl-native
napi build --platform --release
```

### 决策 4：Host 拥有帧循环，Rust 不抽象调度

不引入 `FrameScheduler` trait。Rust 暴露 `render_frame(timestamp)` 方法，Host 在自有事件循环（rAF / setInterval / 线程 loop）中调用。这是 Vello / tiny-skia / CanvasKit 的一致做法。

### 决策 5：媒体数据为纯 struct 而非 trait

不引入 `ImageSource` / `VideoDecoder` trait。Host 负责解码（Web 走浏览器硬件加速，Native 走 `image` crate），解码产物统一为 `PixelBuffer` struct 传入 Rust。

### 决策 6：输入事件归一化在上层完成

不引入 `EventSource` trait。M10a 已定义平台无关的 `InteractionInput` 类型。Host 负责「原生事件 → InteractionInput」归一化（banvas-runtime / useInteraction），Rust 只接收已归一化的 struct 做命中检测。

### 决策 7：IDrawingSurface 承载帧调度

`requestFrame` / `cancelFrame` 放在 `IDrawingSurface` trait 而非独立的 `FrameScheduler` trait。理由：帧同步是平台资源的 allocate/release 配对（Web: rAF handle → cancelAnimationFrame），逻辑上属于画布表面的生命周期——canvas 存在才有帧调度需求。合并后只需 2 个 trait 而非 3 个，降低 Rust 侧泛型参数复杂度。

### 决策 8：媒体加载的「平台注入」模式

引擎不持有解码器，只持有解码产物。具体路径：
1. `IDrawingContext.loadImageSource(url, crossOrigin)` → 返回平台无关 `IImageSource`（Web = `ImageData`-like）
2. `IDrawingContext.loadVideoSource(url, options)` → 返回平台无关 `IVideoSource`
3. Graph 元素通过 `loadImageWithContext(ctx)` / `loadVideoWithContext(ctx)` 接收
4. 渲染时通过 `IDrawingContext.drawImage(source, ...)` / `createPattern(source, ...)` 传回平台

Rust 侧对应方案：Host 解码为 `PixelBuffer` struct（纯 RGBA8 数据），调用 `engine.add_image(id, pixels)` / `engine.update_video_frame(id, frame)` 注入。`PixelBuffer` 是 Rust 自有 struct，非 trait——引擎用它在布局 / 命中检测中查询尺寸、提取像素，渲染时传回 `DrawingContext::draw_image()`。

### 决策 9：scroll 布局模式

scroll 是语法糖模式（`LayoutMode.Scroll` = `free` + `overflow: scroll`），不引入独立的 `ScrollLayoutStrategy`。Rust 侧作为 `LayoutMode::Scroll` enum variant，布局行为完全由 `CombinedView` 层处理（与 TS 侧一致）：拦截 `layoutMode='scroll'` → 强制设置 `overflow=Scroll` → 子元素走 free 定位。此决策确保新增模式不膨胀 `ILayoutStrategy` trait。

---

## 11. 实施步骤（Phase 1）

### Step 1：环境准备（10 分钟）

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-unknown-unknown
cargo install wasm-pack

rustc --version
cargo --version
wasm-pack --version
```

### Step 2：创建 Cargo workspace 和核心 crate（20 分钟）

按 §3 的骨架创建文件：

```bash
cd crates/banvasgl-core
cargo check    # 只检查不编译，类比 tsc --noEmit
cargo build    # 编译 debug 版本
```

### Step 3：编译 WASM，在浏览器中验证（30 分钟）

```bash
cd crates/banvasgl-core
wasm-pack build --target web --out-dir ../../packages/banvasgl-native/wasm
```

产物：
- `banvasgl_core_bg.wasm` — 二进制 WASM
- `banvasgl_core.js` — JS 胶水代码
- `banvasgl_core.d.ts` — TypeScript 类型

然后用 §4.3 的测试页面在浏览器中验证渲染。

### Step 4：性能对比（30 分钟）

写 TS 代码实现相同 1000 圆场景，`performance.now()` 测量：

| 指标 | TS 版 | Rust WASM 版 |
|------|-------|-------------|
| 场景创建耗时 | ? | ? |
| 渲染耗时（1000 帧平均） | ? | ? |
| 内存占用 | ? | ? |

预期 Rust WASM 2-5x 加速。差距不大则瓶颈在 JS↔WASM 边界调用，后续考虑 FlatBuffers。

### Step 5：CI 流水线（1 小时，可在 Phase 2 再做）

```bash
cd packages/banvasgl-native
npx @napi-rs/cli new --ci github
```

自动生成 GitHub Actions workflow，含 11 平台交叉编译矩阵 + npm publish。

---

## 12. 与 A9a（统一 2D/3D GPU 渲染）的关系

A9a 是 A9 的后继提案——在 Rust 核心建成后，用 wgpu + vello + rend3 实现 GPU 渲染：

```
Phase 2 完成后的 banvasgl-core
    │
    ├─ IRenderBackend trait
    │   ├── tiny_skia 实现（CPU 回退）        ← 始终可用
    │   ├── vello 实现（2D GPU via wgpu）     ← WebGPU 可用时
    │   └── rend3 实现（3D GPU via wgpu）     ← 可选 feature flag
    │
    └─ DrawingContext（上层不变！）
       GPU 加速对 banvasgl-react 完全透明
```

**A9a 的前提条件**是 A9 Phase 2 完成（Rust 核心有完整的 Scene + View + Renderer）。两者不冲突：Phase 2 的 Renderer 先走 tiny-skia CPU 路径，A9a 实施时加入 vello 后端。

---

## 13. 验收标准（Phase 1 出口）

- [ ] `cargo build` 在 `crates/banvasgl-core/` 下零 warning 编译通过
- [ ] `wasm-pack build --target web` 产出 < 500KB `.wasm` + JS glue
- [ ] `napi build --platform --release` 产出当前平台的 `.node` 文件
- [ ] 浏览器 Canvas 渲染 1000 图形（混合 Circle + Rect + Text），60fps
- [ ] Rust 帧时 < TS 版 50%（同场景对比）
- [ ] `cargo test` 覆盖 math / graph / scene / flow 子模块
- [ ] `banvasgl-react` 的 `useCanvasInit` 支持 `useNativeEngine: true` 选项
- [ ] 所有 Phase 1 trait（DrawingContext / PlatformCanvas）有 Web 适配器实现且通过集成测试
- [ ] Host 侧 rAF loop 成功驱动 `engine.render_frame()` 稳定 60fps
