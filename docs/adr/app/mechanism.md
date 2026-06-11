# App · 机制级决策

> 某个机制怎么工作——Banyan 应用层的关键运行机制。

---

## 决策依赖图

```
┌───────────────────────────────────┐
│  M1 AI 请求代理机制（SSE 转发）    │
└───────────────────────────────────┘

┌───────────────────────────────────┐
│  M2 构建与预览服务                 │
└──────────────────┬────────────────┘
                   │ extends
┌──────────────────▼────────────────┐
│  M4 去中心化构建（租户端就地部署）  │
└───────────────────────────────────┘

┌───────────────────────────────────┐
│  M3 Bridge 层平台能力抽象          │
└───────────────────────────────────┘

┌───────────────────────────────────┐
│  M5 实时协作方向（CRDT/Yjs）       │
└───────────────────────────────────┘

┌───────────────────────────────────┐
│  M6 前端 Store 统一状态管理     │
│    + PreviewServer 下推同步      │
└───────────────────────────────────┘

┌───────────────────────────────────┐
│  M7 流程节点属性面板              │
│   （engine:M19 Phase 1 过渡）     │
└───────────────────────────────────┘

        M1 ←complements→ M2
        M2 → M4（构建产物标准化后的分布式部署）
        M2 ←complements→ M3
```

关系说明：

- M1⇄M2：AI 请求代理和构建预览都是 banyan 后端对外提供的核心服务机制，互补构成后端完整能力
- M2→M4：M2 定义了构建产物标准化（dist/ 目录），M4 在此基础上将构建执行去中心化到租户端
- M2⇄M3：构建预览产出桌面产物，Bridge 抽象解决产物在不同平台运行时的能力适配，二者互补覆盖从构建到运行的全链路
- M5 独立：实时协作是面向未来的方向性锁定，当前不与其他机制产生依赖
- M6 独立：前端 Store 统一状态管理是前端架构重构，不修订 M1（done 后写库保持不变），与 A6（PreviewServer 职责边界）配合实现下推同步
- M7 独立：流程节点属性面板是 engine:M19 的 Phase 1 前端过渡方案，复用 UI 设计态 PropertyPanel 模式

---

## 后端服务机制

### M1. AI 请求代理机制（SSE 转发）

**✅ 已实施**

前端 AI 请求不直达 xiangdi-server，由 banyan 后端作为代理：前端 -> banyan 后端（读 pages from MongoDB，组装请求）-> xiangdi-server（执行 AI）-> banyan 后端（写 pages to MongoDB）-> 前端（SSE 流式转发）。

**决策链：** xiangdi-server 无状态不访问 DB -> 需要有人负责读写 pages -> banyan 后端已掌握 MongoDB 连接 -> 自然成为代理层 -> 代理层还能做鉴权、限流、日志 -> SSE 转发保持流式体验。

**约束：**

- banyan 后端 AiService 负责 SSE 代理逻辑
- 代理层不修改 AI 返回内容（透传），仅在 done 事件后写入 MongoDB
- 超时、重试、错误处理在代理层统一处理

---

### M2. 构建与预览服务

**✅ 已实施**（预览部分由 app/A5 取代）

banyan 后端提供 build 和 preview 服务：preview 启动临时 Vite dev server 渲染应用，build 执行完整构建流程生成可部署产物。

**决策链：** 低代码平台需要实时预览 -> Vite dev server 提供 HMR -> 构建需要完整打包 + Electron 包装 -> 两个场景共享应用数据但执行流程不同 -> 分为 preview service 和 build service。

> **预览部分被 app/A5 取代：** 「preview 启动临时 Vite dev server 渲染应用」这一前端独立进程的实现已被 app/A5 取代——预览态前端不再起独立 Vite 进程，而是在 banyan 编辑器内用 `useRuntimeBanvas` 就地渲染（前端与编辑态同源），预览态后端改为复用 deploy-agent `scaffoldServer` 在本地起真实服务。本条 M2 的 build 服务部分仍有效。

**约束：**

- ~~preview 是临时进程，关闭预览即销毁~~（预览态形态已由 app/A5 重定义，不再是独立 Vite 进程）
- build 产物输出到用户指定目录
- 两者共享应用 pages JSON 作为数据源

---

## 平台适配机制

### M3. Bridge 层平台能力抽象——壳端注入，Web 端消费

**未实施**

前端通过统一 Bridge 接口（`window.__BANYUAN_BRIDGE__`）调用平台原生能力（文件系统、打印、摄像头、蓝牙、NFC、对话框、剪贴板等）。壳端在启动时将平台实现注入到 window 上，Web 层通过 `getBridge()` 获取实例。

**设计语境：** 产品交付模型是"平台壳 + Web 服务"，壳是 WebView 容器，业务逻辑运行在 Web 层。如果 Web 层无法调用原生能力，用户构建的应用就只能是纯 Web 表现，无法利用平台壳的原生优势。比如一个门店管理系统需要打印、一个设备巡检应用需要蓝牙扫描——这些能力不同平台 API 完全不同，浏览器沙箱也限制了直接访问。

**核心设计原则：**

- 接口先行，实现后补：`@banyuan/bridge` 只定义 TypeScript 接口，不含任何平台实现代码
- 能力可查询：Web 层调用前可检测当前平台是否支持某项能力（`Bridge.isAvailable('camera')`），用于 UI 适配
- 异步一切：所有 Bridge 方法返回 Promise，统一调用模式
- 安全沙箱化：Bridge 只暴露预定义的能力集，应用在 `appJSON.permissions` 中声明所需能力，壳端按白名单注入
- 版本化与能力协商：壳端低版本时 Web 层调用新方法得到 `BridgeVersionError`，展示升级提示

**决策链：** 前端代码需要平台无关 -> 不能直接调用 Electron API -> Bridge 抽象层屏蔽差异 -> Electron 环境走 contextBridge IPC，Capacitor 走 Plugin，Web 环境走浏览器 API 降级 -> 运行时自动选择实现。

**与 Flow 集成：** `@banyuan/banvasgl/flow/client` 新增 `bridge` 节点类型，用户在流程编辑器中拖一个"拍照"节点，运行时自动通过 Bridge 调用摄像头，结果存入流程变量。

**约束：**

- Bridge 接口定义在独立包（`@banyuan/bridge`）中，零依赖
- 各平台适配器是独立的包（`bridge-electron` / `bridge-capacitor`），各自实现
- Bridge 不承载业务逻辑，只做平台能力映射
- 新增平台能力时先定义 Bridge 接口，再分别实现
- `fs` 模块的路径访问限制在应用专属目录内（路径沙箱）

**反例：**

- 前端直接 window.electron.xxx——Web 环境报错，平台耦合
- 所有平台能力走 HTTP 调后端——增加网络延迟，离线不可用，且后端运行在容器内也无法直接访问宿主机硬件
- 直接使用 Capacitor 统一全平台——Electron 社区插件不成熟，Electron 的 Node.js 能力远超 Capacitor 抽象

---

### M4. 去中心化构建——租户端构建 + 就地部署

**未实施**

构建在租户自己的 ECS 上由 deploy-agent 完成（scaffold → pnpm install → vite build → 部署到容器），不存在中心化构建集群。

**为什么选择去中心化：** 中心化构建面临排队问题——100 个租户同时发布时需要队列调度。去中心化让每个租户在自己的 ECS 上构建，构建能力随租户数线性增长，无需扩容中心构建集群。同时 appJSON → scaffold → build → dist → deploy 全链路在同一台机器完成，零网络传输、零 OSS 中转。一台 ECS 构建失败不影响其他租户。

**架构思路：** 这不是 MVP 简化，而是架构选型。选择去中心化是因为它在语义上也是正确的——谁的应用在谁的机器上构建，产物天然属于该租户，无跨租户数据流动。

**决策链：** 需要多租户隔离 -> 中心化构建有排队瓶颈 -> 去中心化 + 租户端就地执行 -> 每个租户一台 ECS -> deploy-agent 做管控代理 -> 通过 WebSocket 主动连接平台后端（无需在租户服务器暴露端口）。

**约束：**

- deploy-agent 通过 WebSocket 长连接主动连接 Banyan 后端，不暴露公网端口
- 构建产物标准化为 dist/ 目录，与平台无关
- 每个应用打包为自包含 Docker 容器（前端 SPA + 后端 Koa 壳 + ORM + 云函数运行时）
- 纯静态应用可降级为 nginx:alpine 容器

---

### M5. 实时协作方向——CRDT（Yjs）

**未实施**

协作算法锁定为 CRDT（Yjs），不走 OT 路线，不走纯服务器定序路线。当前阶段不实施，但架构上做铺垫（Action 层 Command 序列化）。

**为什么选 CRDT 而非 OT：** Banyan 的 UI JSON 是树形结构——页面包含视图节点，视图节点有属性和子节点。OT 对复杂树形结构的操作变换规则需要为每种操作类型手写，边界 case 指数增长。CRDT 的 Yjs 用 Y.Map + Y.Array + Y.Text 可以直接映射视图树。此外 Electron 桌面端需要离线编辑能力，CRDT 天然支持离线编辑 + 重连后自动合并，这是协议层保证的，不需要额外工程。

**与 BanvasGL 的对接思路：** 协作层通过 actions 层操作 Scene（YjsAdapter），不绕过 TransactionManager。协作触发的操作标记 `{ source: 'remote' }`，避免二次同步。撤销/重做升级为 per-user 撤销（Yjs UndoManager）。Awareness（光标/选区实时感知）独立于主文档同步，走低延迟通道。

**引入前提条件：** Action 层操作描述升级为可序列化 Command 对象（这是当前值得做的铺垫，同时服务于操作历史/录制回放/AI 操作追踪）；WebSocket 基础设施就绪；核心单人编辑体验稳定。

**约束：**

- 协作方向锁定 CRDT（Yjs），不做 OT
- 引入时新增 `banvas-collab` 包，不修改 banvasgl 核心现有代码
- AI Agent（XiangDi）的操作天然可接入同一协作通道，AI 与人类协同编辑是长期方向

---

## 元数据管理机制

### M6. 前端 Store 统一状态管理 + PreviewServer 下推同步

**未实施** · 配合 app/A6，不修订 M1

定义前端 applicationStore 的状态管理机制，以及 banyan 后端持久化成功后如何将 collections + cloudFunctions 下推给 PreviewServer 做 hotUpdate。核心原则：store 持有业务数据本身（非回调），单一 `save()` 方法触发持久化到 banyan 后端（保持 M1 原有的 append-only 写库行为不变），持久化成功后通过 IPC 下推 PreviewServer 刷新预览执行环境。

**核心问题背景：** 当前前端使用 register-style 回调模式（registerSaveHandler / registerBuildHandler）管理保存与构建——store 不持有数据本身，只保存「保存时该调谁」。这导致 store 沦为事件总线代替品，各模块保存逻辑分散、无法统一管理。同时 AI 对话产出通过 banyan 后端 done 事件写入 MongoDB（append-only），前端需要在写库成功后获知变更内容以更新 store 和通知 PreviewServer。

**决策链：** store 应持有真实业务数据 → 保存时 store 已有完整状态，一个 `save()` 即可序列化并 HTTP PUT 到 banyan 后端 → banyan 后端保持原有 append-only 写库 → 写库成功后前端更新 store → 同时将 collections + cloudFunctions 通过 IPC 下推 PreviewServer 做 hotUpdate → AI 产出由 banyan 后端在 done 事件后写库（现有机制不变），前端收到 done 事件后拉取最新数据更新 store + 下推 PreviewServer。

**三种元数据的同步策略差异：**

- **appJSON（页面数据）：** 高频编辑（拖拽/属性调整），使用「编辑时 useRef + 切页/保存/构建时同步 store」策略。UIPage 内部用 ref 保持实时画布状态，避免每次拖拽触发全局 re-render，仅在离开页面或保存时 flush 到 store。appJSON 不推送给 PreviewServer（A6 约束）。
- **collections（数据集合 schema）：** 低频 CRUD，每次操作即时持久化到 banyan 后端，成功后更新 store + 下推 PreviewServer hotUpdate。
- **cloudFunctions（云函数 FlowSchema）：** 同 collections，低频 CRUD，即时持久化到 banyan 后端，成功后下推 PreviewServer。

**AI 产出的数据流（保持 M1 现有机制）：**

- banyan 后端在 done 事件后写入 MongoDB（append-only，保持不变）
- 前端收到 done 事件（含 summary）后，从 banyan 后端拉取最新 appJSON / collections / cloudFunctions 更新到 store
- store 更新后，将 collections + cloudFunctions 通过 IPC 下推 PreviewServer 做 hotUpdate

**为什么不修订 M1（done 后写库保持不变）：** 应用数据是 append-only 的，对话 phase（building → awaiting_confirm → committed）本身提供暂存语义。banyan 后端在 done 事件后写库保证了跨设备可恢复性——用户在 A 电脑对话产出的数据已落库，在 B 电脑打开即可恢复。这一机制不应因前端状态管理重构而改变。

**约束：**

- store 持有三类元数据的实际值（appJSON: string、collections: CollectionDef[]、cloudFunctions: CloudFunctionDef[]），不持有回调。appJSON 是 BanvasGL `app.serialize()` 产出的完整 JSON 字符串（包含 designSize + lifetimes + scenes），不是结构化数组
- 保存操作为单一 `save()` 方法，调用 banyan 后端聚合端点 `PUT /apps/:appId/save-all`（后端内部复用现有 appContent / schema / cloudFunctions 三套 service）
- 拉取最新数据使用聚合端点 `GET /apps/:appId/full-state`（后端内部并行查三张表，返回 { appJSON, collections, cloudFunctions }）
- banyan 后端 done 事件后写库机制保持不变（M1 不修订）
- 前端在 done 事件后主动拉取最新数据更新 store（通过 `refreshFromBackend` 调用 full-state 聚合端点）
- PreviewServer 只接收 collections + cloudFunctions 的下推，不接收 appJSON
- 持久化操作（save / CRUD）成功后才下推 PreviewServer，保证 PreviewServer 的可执行态与落库数据一致
- 前端 hotUpdatePreview 辅助函数不需要调用方传 appId（从 store 自取当前 appId），IPC 层内部仍传 appId 做路由（main 进程单例 Orchestrator 管理多实例）

**反例：**

- store 只存回调、不存数据——保存时需要遍历回调收集数据，无法统一管理状态
- 每次拖拽都同步 store——高频渲染导致性能瓶颈（appJSON 结构复杂，JSON 序列化开销大）
- 由 PreviewServer 承担持久化代理——本地状态丢失导致 AI 产出不可恢复，打破 append-only 跨设备保证
- done 事件不写库改为前端决定——换电脑后 AI 产出丢失

**实施方案：** `docs/specs/app/metadata-dataflow.md`（应用元数据数据流完整方案）

---

## 流程编辑机制

### M7. 流程节点属性面板（Phase 1 过渡方案）

**未实施** · 配合 engine:M19 Phase 1 · 复用 UI 设计态 PropertyPanel 模式

流程编辑器中选中节点后，在画布右侧渲染 DOM 属性面板，按 node.kind 动态渲染对应参数编辑表单。这是 engine:M19 终极目标（Blender 式内嵌编辑）的过渡方案——在 Canvas-native 控件体系成熟之前，用 DOM 层 Ant Design 表单组件提供完整编辑能力。

**决策链：** 当前流程节点无法编辑参数（engine:M19 背景）→ Canvas-native 控件体系需要较长建设周期 → 需要一个立即可用的过渡方案 → UI 设计态已有成熟的 PropertyPanel 模式（Ant Design Tabs + 编辑事务）→ 流程编辑器复用同一模式 → `useFlowBanvas` 已暴露 `selectedNode` + `selectedViewPos`，DOM 面板可直接消费。

**约束：**

- 面板固定在流程编辑器右侧（与 UI 设计态 PropertyPanel 位置一致），不跟随节点浮动
- 根据 `selectedNode.kind` 动态渲染对应表单，核心复用组件为 `FlowValueEditor`（FlowValue 五种来源的统一编辑器）
- 编辑事务复用 UI 设计态的 `beginPropertyEdit` / `commitPropertyEdit` 约定
- 属性面板是过渡方案，engine:M19 Phase 3 实现后降级为重型编辑场景入口（如 script code）
- FlowSchema 允许不完整状态存在（运行时执行器做容错），表单校验仅提示不阻断

**反例：**

- 浮层面板跟随节点——拖拽时跟随抖动、多节点密集时遮挡
- 模态对话框编辑——打断流程图编辑上下文
- 每种 kind 独立开发完整面板——FlowValueEditor 无法复用

**实施方案：** `docs/specs/engine/flow-node-inline-edit.md`（Phase 1 部分）
