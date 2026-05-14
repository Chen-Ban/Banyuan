# @banyuan/server

> 平台构建与预览服务。  
> 为 Banyuan 生态提供统一的应用构建 API 和实时预览渲染能力。

**@banyuan/server** 是 Banyuan monorepo 的基础设施包，负责两件事：接收构建请求并执行应用打包流程，以及提供预览路由让开发者即时查看画布产物的渲染效果。它是一个纯 Koa 服务，设计上保持轻量，易于在本地开发和 CI 环境中部署。

---

## 快速开始

### 前置条件

- Node.js >= 18
- pnpm（monorepo 工作区已配置）

### 开发模式

```bash
# 在 monorepo 根目录安装依赖
pnpm install

# 启动开发服务器（tsx watch 模式，修改自动重启）
cd packages/server
pnpm dev
```

开发模式使用 `tsx` 直接运行 TypeScript，无需预编译。

### 生产构建

```bash
pnpm build    # tsc 编译到 dist/
pnpm start    # 运行编译产物
```

---

## API 概览

服务启动后默认监听端口，提供以下路由分组：

`GET /api/v1/health` 返回服务健康状态，可用于负载均衡探活和 CI 中的就绪检测。

`/api/v1/build` 下挂载构建相关接口，接收构建请求、查询构建状态、获取构建产物。具体端点由 `routes/build.ts` 定义。

`/preview` 下挂载预览渲染路由，将画布 JSON 数据渲染为可访问的页面。预览服务的核心逻辑在 `services/preview/` 中实现。

---

## 项目结构

```
packages/server/
├── src/
│   ├── app.ts             # Koa 应用实例，挂载中间件
│   ├── server.ts          # HTTP server 启动入口
│   ├── routes/
│   │   ├── index.ts       # 路由汇总 + /api/v1/health
│   │   ├── build.ts       # 构建 API 路由
│   │   └── preview.ts     # 预览渲染路由
│   └── services/
│       └── preview/       # 预览渲染服务
├── tsconfig.json
└── package.json
```

中间件方面，`app.ts` 挂载了 `errorHandler`（统一错误处理与响应格式化）和 `logger`（请求日志），保持最小化依赖。

---

## 许可证

双重授权：[AGPL-3.0](../../LICENSE)（开源）/ [商业授权](../../LICENSE-COMMERCIAL)（闭源集成）。详见项目根目录说明。
