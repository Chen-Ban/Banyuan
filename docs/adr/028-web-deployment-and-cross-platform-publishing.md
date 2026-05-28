# ADR-028：Web 部署发布与跨平台发布体系

**状态**：已采纳  
**决策日期**：2026-05-28  
**决策者**：陈班

---

## 背景

Banyuan 当前的构建产物只有桌面安装包（Electron 封装的 .dmg/.exe/.AppImage），缺少 Web 发布能力。用户设计完成后无法直接生成一个可访问的 Web 链接，也无法发布到 iOS/Android。

现有构建流程：前端 pages JSON → scaffold 生成 Vite 项目 → bundle 打包为纯静态 SPA → Electron 封装为桌面包。预览系统是内存临时方案（esm.sh CDN 加载，1 小时过期）。

核心诉求：

1. 按租户维度分配实体云服务器，租户的所有应用运行在其专属服务器上
2. 服务器控制台不暴露给用户，由平台统一运维（面向非研发人员）
3. 新建应用时在服务器上创建运行环境
4. 生成应用时触发打包，返回可访问的预览/正式链接
5. 架构需为后续 Electron、iOS、Android 跨平台发布预留扩展路径

---

## 决策

### 决策一：租户级实体服务器隔离（阿里云 ECS）

每个付费租户独占一台阿里云 ECS 实例，采用 Silo 隔离模式。

**选择阿里云 ECS 的理由**：

- 完善的 OpenAPI（RunInstances/DescribeInstances/SendCommand），支持自动化开通和管理
- 弹性公网 IP + 安全组 + VPC，网络隔离原生支持
- 轻量运维：Cloud Assistant 可远程执行命令，无需 SSH 直连
- 成本可控：2C4G 实例（ecs.t6-c1m2.large）足以承载中小租户数十个静态应用

**隔离边界**：

- 租户间：物理机级别隔离（独立 ECS）
- 应用间：Docker 容器级别隔离（同一 ECS 内）
- 网络：每台 ECS 绑定独立弹性 IP，Nginx 网关统一入口

### 决策二：构建集中化，运行分布化

构建在平台侧（Banyan 后端所在机器/构建集群）完成，产物分发到租户 ECS 部署。

**理由**：

- 构建是 CPU 密集操作（Vite + esbuild），不应消耗租户服务器资源
- 租户服务器不安装 node_modules，保持运行环境干净
- 产物标准化为 `dist/` 目录（index.html + assets + pages.json），与平台无关
- 同一份产物可部署到 Web（Nginx 托管）、Electron（本地加载）、Capacitor（移动壳）

### 决策三：Docker 容器作为应用运行单元

每个应用 = 1 个 Docker 容器：

- 纯静态应用：`nginx:alpine` 镜像，约 5MB
- 带云函数应用：`node:20-alpine` 镜像，运行 @banyuan/flow server runtime
- 资源限制：默认 `--memory=256m --cpus=0.5`，按套餐可调
- 版本管理：保留最近 5 个版本目录，`current` 软链接秒级切换/回滚

### 决策四：deploy-agent 作为租户服务器管控代理

在每台租户 ECS 上运行轻量 deploy-agent（Node.js 守护进程）：

- 通过 WebSocket 长连接与平台 Deploy Service 通信
- 负责：拉取产物、创建/更新/停止容器、更新 Nginx 配置、上报健康状态
- 无需在租户服务器上暴露任何端口给公网（agent 主动外连）
- 后续开放控制台时，agent 扩展为 Web Terminal 代理即可

### 决策五：泛域名 + 自定义域名双模式

- 默认域名：`{appSlug}.{tenantId}.banyuan.app`
- 自定义域名：用户配置 CNAME 指向平台，Nginx 动态匹配
- SSL：Let's Encrypt 通配符证书（泛域名）+ 按需申请（自定义域名）

### 决策六：跨平台产物复用

Vite 构建的 `dist/` 目录是所有平台的统一入口：

| 平台 | 封装层 | 额外依赖 |
|------|--------|---------|
| Web | Nginx 静态托管 | 无 |
| macOS/Windows/Linux | Electron 壳（现有） | electron-builder |
| iOS | Capacitor 壳 | @capacitor/ios + Xcode |
| Android | Capacitor 壳 | @capacitor/android + Android SDK |

移动端选择 Capacitor（而非 Cordova）的理由：Ionic 团队活跃维护、原生 Swift/Kotlin 插件体系、与现代 Web 工具链无缝集成、社区生态已超越 Cordova。

---

## 架构总览

```
┌─────────────────────────────────────────────────────────┐
│                    Banyuan 平台层                         │
│                                                         │
│  Banyan 设计器(:5174) ──▶ Banyan 后端(:3001)            │
│                                │                        │
│                                ▼                        │
│                    ┌─────────────────────┐              │
│                    │  Deploy Service     │              │
│                    │  (:3004)            │              │
│                    │                     │              │
│                    │  - BullMQ 构建队列  │              │
│                    │  - 阿里云 ECS API   │              │
│                    │  - 产物分发调度     │              │
│                    └────────┬────────────┘              │
│                             │                           │
│              ┌──────────────┼──────────────┐            │
│              ▼              ▼              ▼            │
│         OSS 产物仓库   阿里云 DNS    SSL 证书管理       │
└─────────────────────────────────────────────────────────┘
                              │
                    WebSocket 长连接
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ 租户A ECS    │    │ 租户B ECS    │    │ 租户C ECS    │
│              │    │              │    │              │
│ deploy-agent │    │ deploy-agent │    │ deploy-agent │
│ Nginx 网关   │    │ Nginx 网关   │    │ Nginx 网关   │
│              │    │              │    │              │
│ ┌──┐┌──┐┌──┐│    │ ┌──┐┌──┐    │    │ ┌──┐         │
│ │A1││A2││A3││    │ │B1││B2│    │    │ │C1│         │
│ └──┘└──┘└──┘│    │ └──┘└──┘    │    │ └──┘         │
└──────────────┘    └──────────────┘    └──────────────┘
```

---

## 核心流程

### 租户开通

```
管理员操作 → Deploy Service 调用阿里云 ECS API
  → RunInstances (创建 ECS)
  → AllocateEipAddress (分配弹性 IP)
  → 通过 Cloud Assistant 执行初始化脚本:
      - 安装 Docker
      - 部署 deploy-agent (systemd 管理)
      - 安装 Nginx + 配置泛域名 SSL
      - 配置安全组 (只开放 80/443)
  → 阿里云 DNS 添加泛域名解析 *.{tenantId}.banyuan.app → EIP
  → 写入租户注册表 (MongoDB)
```

### 应用发布

```
用户点击"发布" → Banyan 后端
  → 提交构建任务到 Deploy Service 队列
  → 构建 Worker 执行:
      1. scaffold() — 生成 Vite 项目
      2. bundle() — Vite 构建
      3. 压缩 dist/ → {appId}-{version}.tar.gz
      4. 上传到 OSS
  → 通知 deploy-agent:
      - 从 OSS 拉取产物
      - 解压到 /srv/banyuan/apps/{appId}/versions/{version}/
      - 更新 current 软链接
      - 若容器不存在则创建，否则 reload Nginx
  → 返回正式链接: https://{appSlug}.{tenantId}.banyuan.app
```

### 版本回滚

```
用户选择历史版本 → Deploy Service → deploy-agent
  → 切换 current 软链接到目标版本目录
  → nginx -s reload
  → 完成 (秒级)
```

---

## 影响范围

| 模块 | 变更 |
|------|------|
| `apps/banyan/backend/src/services/build/` | 构建完成后增加 OSS 上传 + deploy-agent 通知 |
| `apps/banyan/backend/src/services/preview/` | 可选升级为部署到 staging 容器 |
| `apps/banyan/backend/src/routes/` | 新增发布/回滚/版本管理路由 |
| `apps/banyan/backend/src/models/` | 新增 Tenant/Deployment/PublishRecord 模型 |
| `apps/banyan/frontend/` | 设计器增加"发布到 Web"按钮和发布管理面板 |
| 新增 `apps/deploy-service/` | 部署控制面服务 |
| 新增 `packages/deploy-agent/` | 租户服务器代理 |

---

## 被否决的方案

### 方案A：共享服务器 + K8s namespace 隔离

否决理由：K8s 运维复杂度远超当前团队规模所需，且面向非研发用户的场景不需要如此精细的编排能力。ECS + Docker 足够覆盖单租户数十应用的规模。

### 方案B：Serverless（FC/云函数）托管

否决理由：纯静态 SPA 用 Serverless 是大材小用（CDN 更适合），且后续需要支持云函数长连接、WebSocket 等能力时 Serverless 会有冷启动和连接限制问题。独立 ECS 更灵活。

### 方案C：所有租户共享 CDN + OSS 静态托管

否决理由：无法支持带云函数的应用（需要 Node.js 运行时），且共享域名在 Cookie/Storage 等方面存在安全隔离问题。

---

## 后续演进

- 当租户规模增长到单机容纳不下时，可升级为多 ECS + 负载均衡
- 后续有需求时可对接阿里云容器服务（ACK），deploy-agent 平滑迁移为 K8s Operator
- 开放控制台：deploy-agent 扩展 Web Terminal + 简易日志查看器
- iOS/Android 构建：平台侧增加 Capacitor 构建流水线（需 macOS 构建机用于 iOS）
