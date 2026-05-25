# ADR-024：多租户 SaaS 部署拓扑

**状态**：已采纳  
**决策日期**：2026-05-20  
**决策者**：陈班

---

## 背景

Banyan 当前以桌面安装包形态交付（macOS .dmg / Windows .exe / Linux .AppImage），所有服务（banyan 后端 :3001、xiangdi-server :3002、knowledge-server :3003、MongoDB）运行在用户本地机器上，面向单用户场景。

随着产品商业化推进，Banyan 需要转型为多租户 SaaS 平台，引入用户系统和 C 端用户。这要求重新设计部署架构以支持多用户并发、租户隔离、弹性扩缩容和成本控制。

### 当前各服务的架构特征

- **banyan 后端**：有状态（依赖 MongoDB），职责混合——应用 CRUD、AI SSE 代理、构建打包（极度消耗 CPU/IO）、应用预览、动态 ORM。构建任务使用进程内队列（`waitQueue` + `runningCount`），无法跨实例共享。
- **xiangdi-server**：无状态，pages 随请求传入、随 done 事件返回，不访问 MongoDB。真正的 LLM 推理开销在远端（DeepSeek/Kimi）。
- **knowledge-server**：有状态（LanceDB 嵌入式文件存储 + ONNX 模型常驻内存），不支持多 writer 并发，不支持跨机器共享存储，是当前最大的扩展瓶颈。

---

## 决策

### 三个服务独立部署，各自按特征选择扩展策略

```
                         ┌─────────────────────────────────────┐
                         │          API Gateway                 │
                         │    (认证、限流、路由、租户识别)         │
                         └──────┬──────────┬──────────┬────────┘
                                │          │          │
                    ┌───────────▼──┐  ┌────▼─────┐  ┌▼──────────────┐
                    │ banyan 后端   │  │ xiangdi  │  │ knowledge     │
                    │ API + Worker │  │ (无状态)  │  │ (有状态)       │
                    │ 分离部署      │  │ N 实例    │  │ 按版本分片     │
                    └──────┬───────┘  └──────────┘  └───────┬───────┘
                           │                                │
                    ┌──────▼───────┐              ┌─────────▼────────┐
                    │  MongoDB     │              │  向量数据库        │
                    │  Replica Set │              │  (短期 LanceDB    │
                    └──────────────┘              │   长期 Milvus)    │
                                                  └──────────────────┘
```

### 1. xiangdi-server：水平扩容

无状态天然支持水平扩展，负载均衡即可。增加租户级令牌桶做 AI 调用配额管理。该服务可独立复用给其他产品线（SDK/API 商业化场景）。

### 2. banyan 后端：拆分 API 进程与 Worker 进程

- **API 进程**：应用 CRUD、AI SSE 代理、动态 ORM、应用预览。共享 MongoDB，可水平扩展。
- **Worker 进程**：构建打包任务。通过分布式消息队列（Redis/RabbitMQ）分发任务，独立的构建机按需弹性伸缩。每次构建在临时容器中执行，做到资源隔离和安全隔离。

当前进程内的 `waitQueue` + `runningCount` 机制在多实例下失效，必须改为分布式队列 + 持久化任务状态。

### 3. knowledge-server：分阶段演进

- **短期**：按 BanvasGL 版本 + 租户维度做分片，每个 knowledge-server 实例负责一组租户的知识库（sticky routing）。LanceDB 实例文件存储在持久化卷上。
- **长期**：将 LanceDB 替换为分布式向量数据库（Milvus / Qdrant / Weaviate），ONNX Embedding 推理抽离为独立的推理服务（可上 GPU 加速）。

---

## 需要补齐的基础设施

### 用户认证系统

当前没有终端用户认证。需要在 API Gateway 层或 banyan 后端增加：

- User model（注册/登录/OAuth）
- JWT 或 Session 认证
- 租户归属关系（User → Tenant → Application）

### 租户数据隔离

当前动态 ORM 的集合命名 `app_{appId}_{collectionName}` 提供了逻辑隔离，SaaS 场景下扩展为：

- **小租户**：共享 MongoDB 实例，通过 `tenantId` 做逻辑隔离
- **大租户**：独立数据库实例（物理隔离）

### 构建资源隔离

构建打包操作执行 `npm install` + `Vite build` + `electron-builder`，存在安全风险（恶意代码执行）和资源滥用风险。要求：

- 容器化构建环境（Docker / K8s Job）
- 每次构建起临时容器，构建完成后销毁
- CPU / 内存 / 磁盘 / 时间限额

### LLM 成本控制

- 租户级用量计量（token 消耗统计）
- 配额系统（免费额度 + 付费套餐）
- 速率限制（令牌桶 / 滑动窗口）

---

## 分阶段落地

### Phase 1：MVP（单机多进程）

与当前架构相似，增加用户认证 + 简单配额。目标：跑通产品验证，支撑数十个用户。

### Phase 2：早期增长（3-5 台机器）

- banyan API 进程与 xiangdi-server 分别部署
- 构建任务走分布式队列 + 独立 worker 机器
- knowledge-server 做 sticky routing 分片
- MongoDB Replica Set

### Phase 3：规模化

- Kubernetes 编排全部服务
- xiangdi-server 自动弹性伸缩（HPA）
- 构建任务容器化隔离（K8s Job）
- 向量数据库迁移（LanceDB → Milvus/Qdrant）
- Embedding 推理独立为 GPU 节点
- CDN 加速前端静态资源和预览页面

---

## 考虑过的方案

### 方案 A：三服务部署在同一台机器（被否决）

优点：运维简单，内网延迟最低。

缺点：构建任务会吃满 CPU 影响其他服务；knowledge-server 的 ONNX 推理与 API 响应争抢资源；无法独立扩缩容；单点故障影响全部服务。适用于本地桌面场景但不适用于 SaaS。**否决。**

### 方案 B：三服务独立部署，按特征各自扩展（采纳）

优点：资源隔离互不影响；各服务可按自身瓶颈独立扩容；xiangdi-server 可复用给其他产品；构建任务可隔离保障安全。

缺点：运维复杂度增加；服务间网络通信有延迟（同机房可控）。

### 方案 C：全部微服务化 + 事件驱动（过度设计，暂不采纳）

将 banyan 后端进一步拆分为独立微服务（应用服务、构建服务、预览服务、ORM 服务、AI 代理服务），通过事件总线通信。

缺点：当前团队规模和用户量不支撑这种复杂度；过早微服务化增加开发和调试成本。**留作 Phase 3+ 的远期选项。**

---

## 影响

### 正面影响

- 各服务按资源特征独立扩展，成本效率最优
- 构建任务隔离消除了安全风险和资源争抢
- xiangdi-server 可独立对外提供 API 服务（SDK 商业化路径）
- 渐进式演进，不要求一次到位

### 负面影响 / 权衡

- 运维复杂度增加（多服务 + 分布式队列 + 容器编排）
- 需要从头构建用户认证和租户隔离体系
- knowledge-server 的 LanceDB → 分布式向量数据库迁移是较大的工程量
- banyan 后端的构建队列从进程内改为分布式队列需要重构

---

## 参考

- [ADR-008：XiangDi 独立服务化](./008-xiangdi-as-independent-service.md)
- [ADR-006：AGPL-3.0 双重授权](./006-dual-license.md)
- [docs/business.md](../business.md) — 商业化路径规划
