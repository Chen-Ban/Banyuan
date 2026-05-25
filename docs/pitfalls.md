# 踩坑记录 — Banyuan

> 本文档记录开发过程中遇到的陷阱和非显而易见的约束。
> AI Agent 在修改相关代码时应参考本文件，避免重复踩坑。

## BanvasGL

### 分层拆包的包边界意识

**问题**：BanvasGL 采用分层拆包而非三入口隔离（参见 ADR-016）。`@banyuan/banvasgl` 核心包是单入口（`src/index.ts`），不含任何编辑态或运行态能力。如果在核心包中不小心引入了 React hooks、Worker 调度、或设计器 UI，会破坏包边界，导致运行态产物体积膨胀，或在 Node.js 服务端环境中报 DOM/Worker 相关错误。

**规避**：严格遵守包职责——编辑态能力（hooks、Worker、设计器组件）只能放入 `@banyuan/banvas-design`；运行态接口层放入 `@banyuan/banvas-runtime` 和 `@banyuan/banvas-runtime-web`；`@banyuan/banvasgl` 核心包中禁止 `import` 上述任何子包。新增导出时只需维护对应包的 `index.ts`，无需同步多个入口。

### Canvas 2D 坐标系与 DPR

**问题**：Canvas 2D 的物理像素与逻辑像素不同。在高 DPR 屏幕上，如果没有正确缩放 context，渲染会模糊。

**规避**：所有坐标计算统一在逻辑像素空间进行，DPR 缩放只在 Renderer 层的 `CanvasContext` 中一次性处理。不要在图形基元或 View 中手动乘以 devicePixelRatio。

### Web Worker 通信序列化

**问题**：Worker postMessage 只能传递可序列化的数据（structured clone）。传递 class 实例、函数引用、循环引用对象会静默失败或抛错。

**规避**：Worker handler 的输入输出必须是纯数据（Plain Object / ArrayBuffer）。需要传递图形信息时，先通过序列化器转为 JSON 快照，Worker 处理后返回纯数据结果，主线程再重建对象。

### 事务与渲染时序

**问题**：多个操作如果不在同一个事务中，会触发多次重渲染，造成闪烁和性能浪费。

**规避**：批量操作必须包裹在 `TransactionManager.begin()` / `commit()` 中。AI 工具调用中的 `apply_patch` 工具已内置事务封装，单次调用中的多个修改会合并为一个事务。

### 图形求交精度

**问题**：贝塞尔曲线求交使用数值方法（Newton-Raphson），在极端曲率下可能不收敛或产生重复交点。

**规避**：`IntersectionUtils` 中已内置去重逻辑（epsilon 阈值），但添加新的解析图形类型时，需测试边界情况（退化曲线、重合线段等）。

## XiangDi

### ToolHandler 类型体操

**问题**：`ToolHandler<TInput, TOutput>` 与 `ToolHandler`（默认泛型）之间不兼容，直接赋值会报 TS2322。

**规避**：注册到 ToolRegistry 时使用 `handler as unknown as ToolHandler` 双跳转。这是有意为之的类型安全让步——ToolRegistry 内部按名称动态分发，无法在类型层面精确匹配每个 handler 的泛型参数。参见 `WebSearchTool.ts` 和 `KnowledgeSearchTool.ts` 中的处理方式。

### LangGraph 节点的 stop_reason 判断

**问题**：XiangDi 已迁移至 LangGraph StateGraph（`graph/masterGraph.ts`），不再是手写的 AgentLoop。LLM 返回 `stop_reason: "end_turn"` 表示模型主动结束，`"tool_use"` 表示需要执行工具调用后继续循环。如果节点路由逻辑不正确判断，会导致 Agent 提前终止或陷入空轮。

**规避**：`graph/masterGraph.ts` 的条件边（conditional edge）中已有清晰的路由判断。扩展新的 stop_reason 值时，必须在对应的条件函数中显式处理，不要依赖 default 分支，并同步更新 `graph/state.ts` 中的 StateAnnotation 字段。

### Zod Schema 的 discriminatedUnion 与 optional 字段

**问题**：`AINodeSchema` 使用 `z.discriminatedUnion("type", [...])` 定义节点类型。当某个分支中的字段同时用了 `.optional()` 和 `.default()`，Zod 的 `_input` 类型推断会与 `_output` 不一致，导致 `ZodType<AINode>` 赋值报错。

**规避**：这是已知的 Zod 类型推断限制（TS 编译器报错但运行正常）。当前通过 `as any` 绕过。后续升级 Zod 版本或重构为独立 schema + union 可彻底解决。不要尝试通过调整泛型参数来"修复"，会越改越复杂。

### SpecPlanner 与 AgentLoop 职责分离

**问题**：早期设计中曾尝试让 AgentLoop 自己决定"做什么"（规划）和"怎么做"（执行）。这导致 prompt 过于复杂，模型输出不稳定。

**规避**：严格分离——SpecPlanner 负责规划（一次 LLM 调用，输出 ChangeSpec），AgentLoop 只负责按 ChangeSpec 的 tasks 执行工具调用。不要在 AgentLoop 的 system prompt 中加入规划指令。

### LLM 响应中的 JSON 解析

**问题**：LLM 返回的 tool_use input 有时会包含 trailing comma、注释、或不完整的 JSON（尤其在长输出被截断时）。

**规避**：ToolRegistry.execute() 调用前，AgentLoop 已完成 JSON parse。如果 parse 失败，应返回 tool_result 带 `is_error: true` 让 LLM 自行修正，而非直接抛出导致整个 loop 崩溃。

## Banyan

### MongoDB ObjectId 与前端路由

**问题**：MongoDB 的 `_id` 是 ObjectId 类型，JSON 序列化后变成 24 位 hex 字符串。前端路由使用 `id` 字段时，确保 Koa 序列化已将 `_id` 映射为 `id`。

**规避**：mongoose model 中配置 `toJSON: { virtuals: true, transform: (_, ret) => { ret.id = ret._id; delete ret._id; } }`。

### Electron 与 Vite Dev Server 的启动时序

**问题**：`electron` 子包使用 `wait-on http://localhost:5174` 等待前端 dev server 就绪后才启动 Electron 进程。如果前端端口变化或启动失败，Electron 会无限等待。

**规避**：端口号在 `vite.config.ts` 中硬编码（Banyan: 5174，LunlunGlass: 5173）。修改端口时，必须同步更新 electron 包的 `wait-on` 参数和 `main.ts` 中的 loadURL。

### 文件上传大小限制

**问题**：Banyan backend 的 koa-body 配置了 20MB 上传限制。超过此大小的文件会被静默拒绝（返回 413）。

**规避**：如果需要支持更大的文件（如高分辨率图片、视频素材），需调整 `app.ts` 中 `koaBody({ multipart: true, formidable: { maxFileSize: ... } })` 的配置。

## 跨包通用

### pnpm workspace 包引用

**问题**：workspace 内包之间引用使用 `workspace:*` 协议。发布到 npm 时，pnpm 会自动将其替换为实际版本号。但在本地开发时，如果没有先 `pnpm build` 被依赖的包，TypeScript 可能找不到类型。

**规避**：根目录的 `dev:banyan` 和 `dev:lunlunglass` 脚本已先执行 `pnpm --filter banvasgl build` 再并行启动。新增包间依赖时，确保开发脚本中有正确的构建前置步骤。

### tsup external 配置

**问题**：tsup 打包时如果不 external 掉 peer dependencies，会将其打入 bundle，导致 duplicate module 问题（尤其是 React）。

**规避**：`@banyuan/banvasgl` 核心包自包含，`tsup.config.ts` 中 `external` 为空数组（无 peer dep）。`@banyuan/banvas-design`、`@banyuan/banvas-runtime-web` 等子包将 `banvasgl` 声明为 peerDep，并在各自的 tsup.config.ts 中 external 掉。`@banyuan/xiangdi-agent` 将 `banvasgl` external 为 optional peer dep。新增 peer dependency 时，记得同步更新对应包的 tsup.config.ts `external` 数组和 package.json `peerDependencies`。

### ESM 导入路径的 .js 后缀

**问题**：TypeScript 编译为 ESM 时，不会自动添加文件后缀。运行时 Node.js 的 ESM loader 要求导入路径必须包含文件扩展名。

**规避**：所有内部模块导入统一使用 `.js` 后缀（即使源文件是 `.ts`）。例如 `import { Foo } from "./foo.js"`。tsup 打包时会正确处理，但若直接用 tsc 编译运行（如后端服务），缺少后缀会导致 ERR_MODULE_NOT_FOUND。
