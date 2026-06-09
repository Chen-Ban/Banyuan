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

        M1 ←complements→ M2
        M2 → M4（构建产物标准化后的分布式部署）
        M2 ←complements→ M3
```

关系说明：

- M1⇄M2：AI 请求代理和构建预览都是 banyan 后端对外提供的核心服务机制，互补构成后端完整能力
- M2→M4：M2 定义了构建产物标准化（dist/ 目录），M4 在此基础上将构建执行去中心化到租户端
- M2⇄M3：构建预览产出桌面产物，Bridge 抽象解决产物在不同平台运行时的能力适配，二者互补覆盖从构建到运行的全链路
- M5 独立：实时协作是面向未来的方向性锁定，当前不与其他机制产生依赖

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
