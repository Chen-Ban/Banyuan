# App · 架构级决策

> 整体怎么组织——Banyan 应用层的服务拓扑、前端架构与桌面平台策略。

---

## 决策依赖图

```
┌───────────────────────────────────┐
│  A1 XiangDi 服务无状态设计         │
└────────────────┬──────────────────┘
                 │ enables
┌────────────────▼──────────────────┐
│  A2 知识服务独立微服务部署          │
└───────────────────────────────────┘

┌───────────────────────────────────┐
│  A3 跨平台策略：Electron 壳+Web    │
└────────────────┬──────────────────┘
                 │ drives
┌────────────────▼──────────────────┐
│  A4 Monorepo 回归                  │
│  （LunlunGlass 不拆仓）            │
└───────────────────────────────────┘
```

关系说明：

- A1→A2：XiangDi 无状态设计确立了「服务职责单一、可独立扩缩容」的拓扑基调，知识服务独立部署是这一思路在重资源服务上的延伸
- A3→A4：Electron 壳 + Web 核心策略要求业务代码平台无关，monorepo 统一管理保证联动构建和类型检查，进一步驱动了示例项目不拆仓的决策

---

## 服务拓扑

### A1. XiangDi 服务无状态设计

**✅ 已实施**

xiangdi-server 不访问 MongoDB，不持有应用持久状态。pages 数据随请求传入、随 done 事件返回。持久化由 banyan 后端负责。

**核心问题背景：** 早期 Banyan 后端直接 `import xiangdi` 在同一进程运行 AI Agent。这导致 API Key 管理混乱（业务服务不应持有 LLM 凭证）、进程耦合（AI 崩溃拖垮业务 CRUD）、无法独立扩缩容、违反包边界。同时 `packages/server` 与 `apps/banyan/backend` 端口冲突，说明两者本应是同一服务。因此做出两个决策：XiangDi 独立为 HTTP 服务 + 旧 packages/server 归并进 banyan 后端。

**决策链：** AI Agent 执行是计算密集型 -> 需要水平扩展 -> 有状态服务难以扩展 -> 无状态 + 请求携带数据 -> 任意实例都可处理任意请求 -> banyan 后端作为有状态网关负责 MongoDB 读写。

**为什么代理模式而非前端直连 XiangDi：** 如果前端直连 XiangDi 服务，前端需要知道 XiangDi 地址；banyan 后端无法做鉴权和限流；done 事件后 pages 写回 MongoDB 需要前端再发一次请求，时序复杂。代理模式让 banyan 后端成为唯一出口，鉴权/限流/写回 MongoDB 全部在代理层一站式解决。

**约束：**

- xiangdi-server 禁止 import mongoose 或任何 MongoDB 驱动
- 请求体携带完整 pages JSON（Pull-based 架构）
- 响应通过 SSE 流式返回增量变更，最终 done 事件携带完整更新后的 pages
- API Key 只在 XiangDi 服务中管理，banyan 后端无需持有 LLM 凭证
- XiangDi 服务可复用于其他消费方（未来的 CLI 工具、其他平台）

**反例：**

- xiangdi-server 直连 MongoDB——横向扩展时数据一致性复杂，与 banyan 产生双写
- Push-based（banyan 推 pages 到 xiangdi）——banyan 需感知 xiangdi 执行时机，耦合加重
- banyan 后端直接 import xiangdi（同进程）——API Key 泄漏风险、进程耦合、无法独立扩缩容

---

### A2. 知识服务独立微服务部署

**✅ 已实施** · 依赖 A1

knowledge-server 作为独立进程运行（:3003），与 xiangdi-server 和 banyan 后端解耦。不共享进程、不共享数据库。

**决策链：** 知识检索依赖 ONNX Runtime + LanceDB（重资源）-> 与 AI 推理和业务逻辑混部会互相抢资源 -> 独立部署可独立扩缩容 -> 知识只读高频、写入低频（仅 CI/CD），适合独立优化。

**约束：**

- knowledge-server 只操作 LanceDB，不访问 MongoDB
- 与 xiangdi-server 通信走内网 HTTP（KNOWLEDGE_URL 环境变量）
- 写入接口需 KNOWLEDGE_INTERNAL_TOKEN 认证

**反例：**

- 知识检索嵌入 xiangdi-server 进程——ONNX 模型加载阻塞 Agent 启动，OOM 风险
- 知识存 MongoDB——向量检索能力弱，BM25 需额外实现

---

## 平台与工程策略

### A3. 跨平台策略：Electron 壳 + Web 核心

**✅ 已实施**

产品交付为 Electron 桌面应用，核心逻辑运行在 Web 层（React + BanvasGL Canvas）。Electron 仅提供壳（窗口管理、文件系统、原生菜单），不承载业务逻辑。

**决策链：** 目标用户是设计师和产品经理 -> 需要桌面级体验（离线构建、本地预览）-> Electron 是成熟的跨平台桌面方案 -> 但业务逻辑必须平台无关（未来可能有 Web 版）-> 严格分层：Web 层 = 全部业务，Electron 层 = 平台能力桥接。

**约束：**

- Electron 进程（main/preload）不包含业务逻辑，仅暴露平台 API
- 前端代码不直接调用 Node.js/Electron API，通过 Bridge 层抽象
- 构建产物可独立以纯 Web 模式运行（无 Electron 时降级为在线模式）

**反例：**

- 业务逻辑放 Electron main 进程——无法迁移到 Web 版，测试困难
- 纯 Web 部署——无法本地构建/预览，离线场景缺失

---

### A4. Monorepo 回归（LunlunGlass 不拆仓）

**✅ 已实施** · 由 A3 驱动

LunlunGlass 示例项目保留在 Banyuan monorepo 的 examples/ 目录内，不拆分为独立仓库。

**决策链：** 早期考虑独立仓以隔离示例项目 -> 但 LunlunGlass 强依赖 workspace:* 版本的 @banyuan/banvasgl -> 独立仓需要发 npm 或 git submodule -> 维护成本远超收益 -> monorepo 内 examples/ 目录天然享受类型检查和联动构建。

**约束：**

- examples/ 下的项目不发布到 npm
- examples/ 项目可以依赖 workspace:* 的包
- CI 构建包含 examples/ 以确保不被引擎变更破坏

**反例：**

- 拆为独立仓 + git submodule——submodule 版本同步繁琐，开发体验差
- 拆为独立仓 + 发 npm——引擎未发版时示例无法使用最新改动，联调效率低
