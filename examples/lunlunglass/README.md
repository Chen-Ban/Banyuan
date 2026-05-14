# 轮轮眼镜 · LunlunGlass

> 眼镜店管理系统示例应用。  
> 演示如何用 React + Koa + Electron 构建一个完整的桌面端门店管理工具，涵盖订单、模板、用户、小票打印等核心场景。

**LunlunGlass** 是 Banyuan monorepo 的示例项目，展示前后端 + 桌面壳的典型架构组合。它不是玩具 demo——包含真实的热敏小票打印（ESC/POS 协议）、MongoDB 持久化、文件上传等生产级功能。

---

## 技术栈

前端使用 React 19 + Vite 构建，页面包括首页、订单列表、订单详情、模板管理、用户管理等，通过 Layout 组件统一布局，API 层封装了 orders、templates、users 等接口调用。后端基于 Koa，配合 Mongoose 操作 MongoDB，数据模型包括 Order、Product、Template、User、PrintFieldMapping。Electron 36 作为桌面壳，使用 wait-on 模式等待前后端就绪后启动窗口。小票打印通过 serialport 串口通信，内部实现了 EscPosEncoder（指令编码）、ImageComposer（图片合成）、PrinterTransport（传输层）三层抽象。

---

## 快速开始

### 前置条件

- Node.js >= 18
- MongoDB 运行中（默认连接 `localhost:27017`）
- 如需打印功能，连接 ESC/POS 热敏打印机

### 开发模式

```bash
# 在 monorepo 根目录
pnpm install

# 启动后端（默认端口 3000）
cd examples/lunlunglass/backend
pnpm dev

# 启动前端（Vite dev server）
cd examples/lunlunglass/frontend
pnpm dev

# 启动 Electron 壳（会 wait-on 前后端就绪）
cd examples/lunlunglass/electron
pnpm dev
```

如果只需调试前后端逻辑，可以不启动 Electron，直接在浏览器访问 Vite 开发服务器。

---

## 项目结构

```
lunlunglass/
├── frontend/              # React 19 + Vite
│   ├── src/
│   │   ├── pages/         # 页面组件
│   │   │   ├── index      # 首页
│   │   │   ├── List       # 订单列表
│   │   │   ├── OrderPage  # 订单详情
│   │   │   ├── TemplateDetail  # 模板详情
│   │   │   ├── TemplateList    # 模板列表
│   │   │   └── UserPage   # 用户管理
│   │   ├── components/
│   │   │   └── Layout     # 统一布局组件
│   │   └── api/           # API 客户端（orders, templates, users）
│   └── vite.config.ts
│
├── backend/               # Koa + MongoDB
│   ├── controllers/       # 路由控制器
│   │   ├── Order          # 订单 CRUD
│   │   ├── Print          # 打印触发
│   │   ├── Product        # 商品管理
│   │   ├── Statistics     # 统计数据
│   │   ├── Template       # 模板管理
│   │   └── User           # 用户管理
│   ├── services/
│   │   └── printer/       # 打印服务
│   │       ├── EscPosEncoder.ts    # ESC/POS 指令编码
│   │       ├── ImageComposer.ts    # 图片合成
│   │       └── PrinterTransport.ts # 串口传输
│   ├── models/            # Mongoose 模型
│   │   ├── Order
│   │   ├── PrintFieldMapping
│   │   ├── Product
│   │   ├── Template
│   │   └── User
│   └── uploads/           # 文件上传目录
│
└── electron/              # Electron 36 桌面壳
    └── main.ts            # wait-on 启动模式
```

---

## 许可证

双重授权：[AGPL-3.0](../../LICENSE)（开源）/ [商业授权](../../LICENSE-COMMERCIAL)（闭源集成）。详见项目根目录说明。
