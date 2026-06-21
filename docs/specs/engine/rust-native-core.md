# BanvasGL Rust 原生核心迁移 — 实施方案

## 关联决策

- **域 / 粒度 / 标题**：engine / architecture / **A9. Rust 原生核心迁移（提案）**
- **上位依赖**：**A8b. 平台抽象层** — 已定义的 `IDrawingContext` / `IPlatformCanvas` / `ICanvasHost` 是 Rust 侧的 FFI 边界
- **当前状态**：提案阶段，未实施。本 spec 描述 Phase 1 原型验证的完整方案

---

## 术语表（Rust 生态扫盲）

在阅读本方案前，先解释会出现的 Rust 专有名词。每个术语都配有「类比到 TypeScript 生态」的对照，帮助理解。

### 项目结构相关

| Rust 术语 | 通俗解释 | TypeScript 类比 |
|-----------|---------|----------------|
| **crate** | Rust 的"包"。一个 crate = 一个编译单元，产出库或可执行文件 | npm 包 |
| **Cargo.toml** | crate 的配置文件。声明名称、版本、依赖 | `package.json` |
| **Cargo workspace** | 把多个 crate 放在同一个仓库里统一管理，共享依赖版本和编译缓存 | pnpm workspace |
| **`lib.rs`** | 库 crate 的入口文件 | `src/index.ts` |
| **`main.rs`** | 可执行 crate 的入口文件 | `src/cli.ts`（用 `#!/usr/bin/env node` 的入口）|
| **`Cargo.lock`** | 锁定所有依赖的精确版本 | `pnpm-lock.yaml` |
| **`rust-toolchain.toml`** | 固定项目使用的 Rust 编译器版本 | `.nvmrc`（固定 Node 版本） |

### 编译产物相关

| Rust 术语 | 通俗解释 | TypeScript 类比 |
|-----------|---------|----------------|
| **crate-type** | 声明「这个 crate 编译成什么格式」| tsup 的 `format: ["esm", "cjs"]` |
| **`cdylib`** | C 动态库。编译成 `.so`（Linux）/`.dylib`（macOS）/`.dll`（Windows）。**这是 napi-rs 编译 Node 原生模块的输出格式** | `.node` 文件（Node 原生模块） |
| **`rlib`** | Rust 静态库。编译成 `.rlib`，只能被其他 Rust 代码链接 | 无直接类比（类似 `.a` 静态库） |
| **target triple** | 描述「目标平台的 CPU 架构 + OS + C 运行时」的三段式标识符 | `darwin-arm64` / `linux-x64` 这类平台标签 |
| **`.node` 文件** | Node.js 原生扩展的二进制文件。napi-rs 把 `cdylib` 重命名为 `.node` | `.node` 文件就是编译后的产物 |
| **WASM** | WebAssembly 的缩写。一种在浏览器/Node 中运行的二进制格式 | 浏览器可直接加载的 `.wasm` 文件 |

### 平台相关

| Rust 术语 | 通俗解释 |
|-----------|---------|
| **glibc** | GNU C Library。标准 Linux 发行版（Ubuntu/Debian/CentOS）用的 C 运行时库 |
| **musl** | 另一个更小的 C 运行时库。Alpine Linux（Docker 常用）用它。与 glibc **不兼容** |
| **MSVC** | Microsoft Visual C++ 运行时。Windows 上 Rust 默认链接它 |
| **darwin** | Apple 操作系统（macOS/iOS）的内核名 |
| **aarch64 / x86_64** | CPU 架构。aarch64 = ARM 64 位（Apple Silicon M1-M4），x86_64 = Intel/AMD 64 位 |

### 绑定/桥接相关

| Rust 术语 | 通俗解释 | 角色 |
|-----------|---------|------|
| **napi-rs** | 一个 Rust 框架，让你用 Rust 写 Node.js 原生扩展。一行 `#[napi]` 宏就能把 Rust 函数暴露给 JS 调用 | Rust ↔ Node.js 桥 |
| **wasm-bindgen** | 一个 Rust 框架，让你编译 Rust 到 WASM 并自动生成 JS 胶水代码 | Rust ↔ 浏览器/Node（WASM）桥 |
| **wasm-pack** | 一个命令行工具，封装了 `wasm-bindgen` + 构建 + 打包 npm 的完整流程 | `tsup` 的 WASM 版本 |
| **`#[napi]`** | Rust 的"属性宏"。写在函数/结构体上，告诉 napi-rs "把这个暴露给 JS" | `export` 关键字 |
| **`#[wasm_bindgen]`** | 同上，告诉 wasm-bindgen "把这个暴露给 WASM" | `export` 关键字 |
| **trait** | Rust 的接口。定义一组方法签名，由具体类型实现 | `interface IDrawingContext` |
| **impl Trait for Struct** | Rust 的"为某个结构体实现某个接口" | `class WebDrawingContext implements IDrawingContext` |

### 工具链相关

| 工具 | 通俗解释 |
|------|---------|
| **cargo-zigbuild** | 一个让 Rust 编译器能「交叉编译 Linux 目标」的工具。比如在 macOS 上编译出 Linux 的 `.so`。底层用 Zig 的工具链 |
| **cargo** | Rust 的包管理器 + 构建工具 + 测试运行器（三合一）。类比 `pnpm` + `tsup` + `vitest` |
| **rustup** | Rust 版本管理器。安装/切换/更新 Rust 编译器 | `nvm`（Node 版本管理器） |

---

## 目标

1. **验证可行性**：用 Rust 写最小引擎核心，通过 `IDrawingContext` trait 驱动浏览器 Canvas 渲染
2. **量化性能**：对比 Rust（WASM/napi-rs）与纯 TypeScript 版在场景树遍历 + 布局计算 + Flow 执行上的耗时
3. **建立流水线**：搭好 Rust workspace + napi-rs/wasm-pack 构建 → npm 包分发的完整 CI/CD

---

## Phase 1 原型：最小可行链路

### 1.1 验证目标

```
Rust 引擎核心
  → 遍历一个包含 1000 个 Circle 的场景树
  → 通过 IDrawingContext trait 发出绘图命令
  → JS 侧 WebDrawingContext 把命令委托给真实 CanvasRenderingContext2D
  → 浏览器 Canvas 上看到 1000 个圆
```

### 1.2 新文件清单

```
Banyuan/
├── Cargo.toml                    # Cargo workspace 根配置
├── rust-toolchain.toml           # 固定 Rust 版本
├── crates/
│   └── banvasgl-core/
│       ├── Cargo.toml            # 引擎核心 crate 配置
│       └── src/
│           ├── lib.rs            # 入口：暴露 Engine struct + render 方法
│           ├── drawing.rs        # IDrawingContext trait 定义
│           ├── scene.rs          # Scene：持有 View 树
│           ├── view.rs           # View：含 children、render 方法
│           ├── graph/
│           │   └── circle.rs     # Circle 图形基元
│           └── math.rs           # Point2/Matrix4（用 glam crate）
│
└── packages/
    └── banvasgl-native/
        ├── package.json          # napi-rs 自动生成的 npm 包配置
        ├── build.rs              # napi-rs 构建脚本（自动生成）
        ├── index.js              # 运行时 loader：自动选当前平台的 .node 文件
        ├── index.d.ts            # TypeScript 类型声明（自动生成）
        └── src/
            └── lib.rs            # napi-rs 绑定层：#[napi] 导出 Engine 给 JS
```

### 1.3 文件内容骨架

#### `Cargo.toml`（仓库根 — Rust workspace 配置）

```toml
# Cargo workspace：统一管理所有 Rust crate 的依赖版本和编译
[workspace]
members = ["crates/*"]
# 注意：banvasgl-native 的 binding crate 不放在 workspace 内（原因见 1.6 关键设计决策）
# napi-rs 会自动在 packages/banvasgl-native/ 下生成独立的 Cargo.toml

# 共享依赖版本：类似 pnpm 的 catalog 功能
[workspace.dependencies]
glam = "0.28"          # Rust 的数学库（Matrix4, Vec3 等）—— 类比 gl-matrix
wasm-bindgen = "0.2"   # Rust → WASM 绑定

# 编译配置：对所有 crate 生效的优化级别
[profile.release]
opt-level = 3          # 最大性能优化（类比 tsup 的 minify）
lto = true             # Link-Time Optimization：链接时跨文件优化
```

#### `rust-toolchain.toml`（固定 Rust 版本）

```toml
[toolchain]
channel = "stable"     # 使用 Rust 稳定版
```

> **为什么需要这个文件？** 类似 `.nvmrc` 固定 Node 版本。CI 环境读到这个文件会自动安装对应的 Rust 版本，避免「本地能编，CI 不能」的问题。

#### `crates/banvasgl-core/Cargo.toml`

```toml
[package]
name = "banvasgl-core"
version = "0.1.0"
edition = "2021"       # Rust 2021 版语法规则

[lib]
# 这个 crate 编译为 rlib（Rust 静态库），可以被其他 Rust crate 引用
crate-type = ["rlib"]

[dependencies]
glam = { workspace = true }    # 引用 workspace 中声明的共享版本

# wasm-bindgen 在 WASM 目标时才启用，非 WASM 平台不需要
[target.wasm32-unknown-unknown.dependencies]
wasm-bindgen = { workspace = true }
```

> **`target.wasm32-unknown-unknown.dependencies` 是什么？** 条件依赖——只在编译目标为 WASM 时才引入 `wasm-bindgen`。编译其他平台（如 Windows `.node`）时不引入。类似 `optionalDependencies`。

#### `crates/banvasgl-core/src/drawing.rs`（IDrawingContext trait）

```rust
// trait = Rust 的 interface。
// 这里定义的方法和 TypeScript 的 IDrawingContext 接口 1:1 对应。

pub trait DrawingContext {
    // 状态管理
    fn save(&mut self);
    fn restore(&mut self);

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

    // 变换
    fn set_transform(&mut self, a: f64, b: f64, c: f64,
                     d: f64, e: f64, f: f64);

    // 文字
    fn fill_text(&mut self, text: &str, x: f64, y: f64);
}

// 说明：
// - &mut self 表示方法会修改 DrawingContext 的状态（如改变 fillStyle）。
//   Rust 的所有权模型保证同一时刻只有一个地方能修改它。
// - f64 = 64 位浮点数（TypeScript 的 number）。
// - &str = 字符串引用（TypeScript 的 string）。
// - pub = public，对外可见（TypeScript 的 export）。
```

> **为什么这个 trait 定义在 banvasgl-core 而不是 napi-rs 绑定层？** trait 是引擎核心与平台的**契约**，不是绑定细节。TypeScript 侧的 `IDrawingContext` 在 `@banyuan/banvasgl/types/platform/`，Rust 侧的 trait 也应该在 `banvasgl-core`。

#### `crates/banvasgl-core/src/graph/circle.rs`

```rust
use crate::drawing::DrawingContext;

// struct = Rust 的数据结构（对象）
pub struct Circle {
    pub x: f64,
    pub y: f64,
    pub radius: f64,
    pub color: String,
}

impl Circle {
    // impl Circle { ... }  = 为 Circle 添加方法
    // 类比 TypeScript 的 class Circle { render(...) { ... } }

    pub fn new(x: f64, y: f64, radius: f64, color: String) -> Self {
        // Self = Circle 自身。Rust 没有 this，返回值用 Self
        Self { x, y, radius, color }
    }

    pub fn render(&self, ctx: &mut dyn DrawingContext) {
        // &self = 只读引用 this，不会修改 Circle
        // &mut dyn DrawingContext = 对「任何实现了 DrawingContext trait 的对象」的可变引用
        // dyn = dynamic dispatch —— 运行时决定具体调用哪个实现
        ctx.begin_path();
        ctx.arc(self.x, self.y, self.radius, 0.0, std::f64::consts::TAU, false);
        ctx.set_fill_style(&self.color);
        ctx.fill();
    }
}

// std::f64::consts::TAU = 2 * PI（6.283...）。Rust 标准库自带。
```

#### `crates/banvasgl-core/src/scene.rs`

```rust
use crate::drawing::DrawingContext;
use crate::view::View;

pub struct Scene {
    pub views: Vec<View>,  // Vec<View> = View 的动态数组。类比 View[]
}

impl Scene {
    pub fn new() -> Self {
        Self { views: Vec::new() }  // Vec::new() = []（空数组）
    }

    pub fn add_view(&mut self, view: View) {
        self.views.push(view);      // push = Array.prototype.push
    }

    pub fn render(&self, ctx: &mut dyn DrawingContext) {
        for view in &self.views {   // for ... in = 遍历（类比 for ... of）
            view.render(ctx);
        }
    }
}
```

#### `crates/banvasgl-core/src/lib.rs`（引擎入口）

```rust
// lib.rs = 库 crate 入口文件。声明模块并暴露公共 API。

// mod = 声明一个子模块。Rust 按文件路径自动查找：
// mod drawing; → 找 drawing.rs 或 drawing/mod.rs
pub mod drawing;
pub mod graph;
pub mod math;
pub mod scene;
pub mod view;

// 重导出：让外部可以用 banvasgl_core::Scene 而不是 banvasgl_core::scene::Scene
pub use scene::Scene;
pub use view::View;
pub use drawing::DrawingContext;
```

> **Rust 的模块系统**：`mod X;` 声明子模块。`pub mod X;` 表示公开（export）。不像 TypeScript 用 `import`/`export`，Rust 用 `mod`/`pub mod` 声明，用 `use` 引用。`pub use` = TypeScript 的 barrel 重导出（`export { X } from './scene'`）。


### 1.4 napi-rs 绑定层

#### 自动生成流程

```bash
# 在 packages/banvasgl-native/ 目录下执行（napi-rs CI 会自动创建这个目录）
npx @napi-rs/cli new   # 脚手架，生成 Cargo.toml + src/lib.rs + build.rs + package.json
```

这个命令会生成一个标准的 napi-rs 项目结构。我们只需要编辑 `src/lib.rs` 来暴露我们的 Rust 引擎给 JS。

#### `packages/banvasgl-native/src/lib.rs`（伪代码 — napi-rs 绑定）

```rust
// #[napi] = napi-rs 的属性宏。放在函数或结构体上，
// 自动生成「从 JS 调用 Rust」所需的 C 胶水代码和 TypeScript 类型声明。
// 类比：写 export function render(...)，napi-rs 自动生成 .d.ts

use napi_derive::napi;
use banvasgl_core::{Scene, View, Circle};

// #[napi] 标记的结构体会暴露给 JS，可以在 JS 中 new Engine()
#[napi]
pub struct Engine {
    scene: Scene,
}

#[napi]
impl Engine {
    // #[napi(constructor)] = 这个函数是 JS 的 new Engine()
    #[napi(constructor)]
    pub fn new() -> Self {
        let mut scene = Scene::new();
        // 创建一个包含 1000 个随机圆的场景
        for _ in 0..1000 {
            let circle = Circle::new(
                rand::random::<f64>() * 800.0,  // x
                rand::random::<f64>() * 600.0,  // y
                rand::random::<f64>() * 50.0,   // radius
                format!("rgb({},{},{})",
                    rand::random::<u8>(),        // 红 0-255
                    rand::random::<u8>(),        // 绿
                    rand::random::<u8>(),        // 蓝
                ),
            );
            scene.add_view(View::from_circle(circle));
        }
        Self { scene }
    }

    // JS 侧调用 engine.render(drawingContextAdapter)
    // drawingContextAdapter 是一个 JS 对象，实现了 DrawingContext trait 的所有方法
    #[napi]
    pub fn render(&self, ctx: &mut dyn DrawingContext) {
        self.scene.render(ctx);
    }
}
```

> **`#[napi]` 宏做了什么？** 编译时，这个宏自动生成：
> 1. C 函数包装器（Rust fn → C ABI）
> 2. Node.js N-API 胶水代码（C → JS callbacks）
> 3. TypeScript `.d.ts` 类型声明文件
> 4. `index.js` 加载器（自动选择当前平台的 `.node` 文件）
>
> 类比 tsup 的 DTS 生成，但 napi-rs 还会额外生成 C 胶水代码。

### 1.5 JS 侧：WebDrawingContext 适配器

napi-rs 生成的 TS 类型中，`DrawingContext` trait 会变成一个 JS 对象参数。JS 适配器把调用委托给 `CanvasRenderingContext2D`：

```typescript
// packages/banvasgl-native/src/adapter.ts（手写）
import type { DrawingContext } from './index'; // napi-rs 自动生成的类型

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

> **为什么需要这个适配器？** Rust 的 `DrawingContext` trait 和 `CanvasRenderingContext2D` API 不同。napi-rs 把 Rust trait 的方法调用通过 FFI 传给 JS，JS 适配器再委托给真实的 Canvas 2D 上下文。这个模式和 `@banyuan/banvasgl-react` 的 `WebDrawingContext` 是一样的——只是调用方向反了：Rust → JS（napi-rs）vs JS → Canvas。

### 1.6 关键设计决策（来自业界实践）

#### 决策 1：binding crate 不放在 Cargo workspace 内

napi-rs 的脚手架会在 `packages/banvasgl-native/` 下生成独立的 `Cargo.toml`。这个 crate **不应该**放进仓库根的 Cargo workspace。

**原因（SWC 团队在实践中发现）：**
当 binding crate 在 workspace 内时，Cargo 会尝试用 workspace 的 path dependency 解析版本——这会导致 workspace 内的 `banvasgl-core`（path dep）和 npm 上已发布的 `banvasgl-core`（version dep）冲突。放在 workspace 外，binding crate 只依赖已发布的 crate 版本，不受 workspace 约束。

**类比 TypeScript：** 类似 pnpm workspace 中，如果一个包同时被 workspace 内引用和 npm registry 引用，pnpm 需要 `workspace:^*` 协议来区分。

#### 决策 2：trait 定义在 banvasgl-core，绑定在 banvasgl-native

`DrawingContext` trait 定义在引擎核心 crate（`banvasgl-core`），因为它描述了「引擎需要平台提供什么能力」。napi-rs 绑定层（`banvasgl-native`）只是把这个 trait 翻译成 JS 可调用的形式。

**类比 TypeScript：** `IDrawingContext` 在 `@banyuan/banvasgl`（核心），`WebDrawingContext` 在 `@banyuan/banvasgl-react`（Web 适配）。

#### 决策 3：开发时绕过 napi-rs，直接编译 WASM 调试

napi-rs 编译 `.node` 需要原生编译器完整的 FFI 设置。原型阶段用 WASM 更快——`wasm-pack build` 一行命令，产物直接可在浏览器加载。

**开发流程：**
```bash
# 开发调试：编译 WASM，浏览器直接加载
cd crates/banvasgl-core
wasm-pack build --target web --out-dir ../../packages/banvasgl-native/wasm

# 发布：编译原生 .node（11 平台矩阵）
cd packages/banvasgl-native
napi build --platform --release
```

---

## 实施步骤

### Step 1：环境准备（10 分钟）

```bash
# 安装 Rust 编译器 + 包管理器
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# Windows 用户下载 rustup-init.exe

# 安装 WASM 编译目标
rustup target add wasm32-unknown-unknown

# 安装 wasm-pack（Rust → WASM 打包工具）
cargo install wasm-pack

# 验证安装
rustc --version   # 应输出 rustc 1.8x.x
cargo --version   # 应输出 cargo 1.8x.x
wasm-pack --version
```

### Step 2：创建 Cargo workspace 和核心 crate（20 分钟）

按 1.3 的骨架创建文件：
- `Banyuan/Cargo.toml`
- `Banyuan/rust-toolchain.toml`
- `Banyuan/crates/banvasgl-core/Cargo.toml`
- `Banyuan/crates/banvasgl-core/src/lib.rs`
- `Banyuan/crates/banvasgl-core/src/drawing.rs`
- `Banyuan/crates/banvasgl-core/src/math.rs`
- `Banyuan/crates/banvasgl-core/src/graph/circle.rs`
- `Banyuan/crates/banvasgl-core/src/view.rs`
- `Banyuan/crates/banvasgl-core/src/scene.rs`

```bash
# 验证编译
cd crates/banvasgl-core
cargo check    # 只检查不编译（快），类比 tsc --noEmit
cargo build    # 编译 debug 版本
```

### Step 3：编译 WASM，在浏览器中验证（30 分钟）

```bash
# 编译 WASM
cd crates/banvasgl-core
wasm-pack build --target web --out-dir ../../packages/banvasgl-native/wasm

# 产物在 packages/banvasgl-native/wasm/：
# - banvasgl_core_bg.wasm    二进制 WASM 文件
# - banvasgl_core.js         JS 胶水代码
# - banvasgl_core.d.ts       TypeScript 类型
```

然后在 `packages/banvasgl-native/` 下写一个 HTML 测试页面：

```html
<!-- test.html -->
<canvas id="c" width="800" height="600"></canvas>
<script type="module">
  import init, { Engine } from './wasm/banvasgl_core.js';
  import { createCanvasAdapter } from './src/adapter.js';

  await init();  // 加载 WASM 模块
  const ctx = document.getElementById('c').getContext('2d');
  const engine = new Engine();         // Rust struct → JS
  engine.render(createCanvasAdapter(ctx)); // Rust 调用 JS adapter → Canvas
</script>
```

### Step 4：性能对比（30 分钟）

写一段 TypeScript 代码实现相同的 1000 圆场景，用 `performance.now()` 测量：

| 指标 | TS 版 | Rust WASM 版 |
|------|-------|-------------|
| 场景创建耗时 | ? | ? |
| 渲染耗时（1000 帧平均） | ? | ? |
| 内存占用 | ? | ? |

如果 WASM 渲染耗时明显低于 TS（预期 2-5x），则验证通过。如果差异不大甚至更慢，则瓶颈在 JS↔WASM 边界调用开销——这时需要考虑批量序列化方案（FlatBuffers）。

### Step 5：CI 流水线（1 小时，可在 Phase 2 再做）

生成 napi-rs 的 CI 配置：

```bash
cd packages/banvasgl-native
npx @napi-rs/cli new --ci github   # 自动生成 .github/workflows/ 下的 CI 配置
```

这条命令会自动生成一个 GitHub Actions workflow，包含 11 平台交叉编译矩阵 + npm publish。**不需要手写 CI 配置。**

---

## 验收标准

- [ ] `cargo build` 在 `crates/banvasgl-core/` 下编译通过
- [ ] `wasm-pack build` 成功产出 `.wasm` + JS 胶水代码
- [ ] 浏览器中打开 `test.html`，Canvas 上显示 1000 个彩色圆
- [ ] `performance.now()` 测量渲染耗时，与 TS 版对比有量化数据
- [ ] `cargo test` 有至少 3 个单元测试（Circle.render、Scene.render、矩阵运算）

---

## 影响范围

| 层级 | 影响 |
|------|------|
| 新文件 | `Cargo.toml`、`rust-toolchain.toml`、`crates/banvasgl-core/` 下 ~8 个 `.rs` 文件 |
| 现有包 | `@banyuan/banvasgl` 不变（Phase 1 不删 TS 版） |
| 新 npm 包 | `@banyuan/banvasgl-native` |
| CI | `.github/workflows/banvasgl-native.yml`（napi-rs 自动生成） |
| 依赖 | Rust: `glam`（数学），`wasm-bindgen`（WASM）；JS: 无新增 |

---

## Phase 2 展望（本 spec 范围外，仅概述）

Phase 1 只验证「Rust 能否驱动 Canvas」。Phase 2 才真正迁移引擎核心：

| TS 模块 | Rust 对应 |
|---------|-----------|
| `graph/*`（14 种图形基元） | `crates/banvasgl-core/src/graph/` |
| `view/*`（View 体系 + 布局） | `crates/banvasgl-core/src/view/` |
| `foundation/math` | 直接使用 `glam` crate |
| `foundation/flow`（Flow 执行器） | `crates/banvasgl-core/src/flow/` |
| `engine/Scene` + `engine/Camera` | `crates/banvasgl-core/src/engine/` |
| `engine/App`（应用生命周期） | 保留 TypeScript（编排层，非性能热点） |

Phase 2 完成后，`@banyuan/banvasgl-native` 的 `optionalDependencies` 包含 11 个平台包。`@banyuan/banvasgl-react` 的 hooks 通过 try/catch 自动选择 native 或 TS 回退。
