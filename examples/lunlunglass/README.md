# 轮轮眼镜 · LunlunGlass

> 眼镜店管理系统示例应用。  
> 演示如何用 React + Koa + Electron 构建一个完整的桌面端门店管理工具，涵盖订单、模板、用户、小票打印等核心场景。

**LunlunGlass** 是 Banyuan monorepo 的示例项目，展示前后端 + 桌面壳的典型架构组合。它不是玩具 demo——包含真实的热敏小票打印（ESC/POS 协议）、MongoDB 持久化、文件上传等生产级功能。Studio 模板设计端集成了 `@banyuan/banvasgl` 画布引擎，用于设计小票打印模板。

---

## 技术栈

前端使用 React 19 + Vite + Ant Design 6 构建，通过 Layout 组件统一布局，API 层封装了 orders、templates、users、print 等接口调用。Studio 端通过 `@banyuan/banvasgl`（devDependency）集成画布能力，包含 ComponentPalette（组件面板）、PropertyPanel（属性面板，含 PropertiesTab/StyleTab/DataTab 子目录结构）、PrintPreview（打印预览）等编辑组件。后端基于 Koa，配合 Mongoose 操作 MongoDB。Electron 36 作为桌面壳，使用 wait-on 模式等待前后端就绪后启动窗口。小票打印通过共享打印库（`shared/printer`，`@lunlunglass/printer`）实现，内部包含 EscPosEncoder（ESC/POS 指令编码）、ImageComposer（图片合成，依赖 canvas/jsbarcode/qrcode）、PrinterTransport（传输层）三层抽象。

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

# 一键启动所有子应用（Studio + POS 各自的前后端和 Electron）
cd examples/lunlunglass
pnpm dev

# 或者分别启动：

# 启动 POS 收银端后端
cd examples/lunlunglass/pos/backend
pnpm dev

# 启动 POS 收银端前端（Vite dev server, :5174）
cd examples/lunlunglass/pos/frontend
pnpm dev

# 启动 Studio 模板设计端后端
cd examples/lunlunglass/studio/backend
pnpm dev

# 启动 Studio 模板设计端前端（Vite dev server, :5173）
cd examples/lunlunglass/studio/frontend
pnpm dev

# 启动 Electron 壳（会 wait-on 前后端就绪）
cd examples/lunlunglass/pos/electron   # 或 studio/electron
pnpm dev
```

如果只需调试前后端逻辑，可以不启动 Electron，直接在浏览器访问 Vite 开发服务器。

---

## 项目结构

LunlunGlass 已拆分为 **POS 收银端**（`pos/`）和 **Studio 模板设计端**（`studio/`）两个独立子应用，共享打印库位于 `shared/printer/`。

```
lunlunglass/
├── pos/                   # POS 收银端（门店运营系统）
│   ├── frontend/          # React 19 + Vite (:5174)
│   │   └── src/
│   │       ├── pages/
│   │       │   ├── index/         # 首页
│   │       │   ├── List/          # 列表页（含 OrderList、UserList 子页面）
│   │       │   │   ├── OrderList/       # 订单列表子页面
│   │       │   │   ├── UserList/        # 用户列表子页面
│   │       │   │   └── components/      # OrderTable、UserCard、UserCardList
│   │       │   ├── OrderPage/     # 订单详情
│   │       │   ├── UserPage/      # 用户管理（含 FaceDiagram、OptometryControls）
│   │       │   └── Settings/      # 设置页（PrinterConfig 打印机配置）
│   │       ├── components/
│   │       │   ├── PrintButton/         # 打印按钮组件
│   │       │   └── TemplateSelector/    # 模板选择器组件
│   │       ├── layouts/           # 统一布局组件
│   │       ├── api/               # API 客户端（orders, templates, users, print）
│   │       ├── services/          # 前端服务（TemplateSnapshotService）
│   │       ├── types/             # 类型定义（order, product, user）
│   │       └── routes/            # 路由配置
│   ├── backend/           # Koa + MongoDB
│   │   └── src/
│   │       ├── controllers/
│   │       │   ├── FieldsController.ts
│   │       │   ├── OrderController.ts
│   │       │   ├── PrintController.ts
│   │       │   ├── ProductController.ts
│   │       │   ├── StatisticsController.ts
│   │       │   └── UserController.ts
│   │       ├── services/
│   │       │   ├── OrderService.ts
│   │       │   ├── PrinterConfigService.ts  # 打印机配置管理
│   │       │   ├── PrintService.ts          # 调用 @lunlunglass/printer
│   │       │   ├── ProductService.ts
│   │       │   ├── StatisticsService.ts
│   │       │   ├── TemplateSyncService.ts
│   │       │   └── UserService.ts
│   │       ├── models/
│   │       │   ├── Order.ts
│   │       │   ├── Product.ts
│   │       │   ├── TemplateSnapshot.ts
│   │       │   └── User.ts
│   │       ├── routes/
│   │       │   ├── fields.ts
│   │       │   ├── orders.ts
│   │       │   ├── print.ts
│   │       │   ├── products.ts
│   │       │   ├── statistics.ts
│   │       │   └── users.ts
│   │       ├── config/
│   │       │   ├── database.ts
│   │       │   └── fields.ts           # 字段注册表（验光参数等）
│   │       ├── middleware/
│   │       │   └── localOnly.ts
│   │       └── types/
│   │           └── serialport.d.ts
│   └── electron/          # Electron 36 桌面壳
│       └── src/main.ts
│
├── studio/                # 模板设计端（Template Studio）
│   ├── frontend/          # React 19 + Vite (:5173)
│   │   └── src/
│   │       ├── pages/
│   │       │   ├── index/           # 首页
│   │       │   ├── TemplateList/    # 模板列表
│   │       │   └── TemplateDetail/  # 模板详情（含 @banyuan/banvasgl 画布编辑器）
│   │       │       └── components/
│   │       │           ├── ComponentPalette/   # 组件面板
│   │       │           ├── ContextMenu/        # 右键菜单
│   │       │           ├── PageList/           # 页面列表
│   │       │           └── PropertyPanel/      # 属性面板
│   │       │               ├── PropertiesTab/  #   属性标签页
│   │       │               ├── StyleTab/       #   样式标签页
│   │       │               ├── DataTab/        #   数据标签页
│   │       │               └── shared/         #   共享组件（NumberInput）
│   │       ├── components/
│   │       │   ├── PrintPreview/          # 打印预览组件
│   │       │   └── PropertyPanel/         # 属性面板（FieldBindingSection）
│   │       ├── layouts/           # 统一布局组件
│   │       ├── api/               # API 客户端（templates, fields）
│   │       ├── services/          # 前端服务（FieldProxyService）
│   │       ├── types/             # 类型定义（contextMenu, product）
│   │       └── routes/            # 路由配置
│   ├── backend/           # Koa + MongoDB
│   │   └── src/
│   │       ├── controllers/
│   │       │   ├── FieldsController.ts
│   │       │   ├── PrintController.ts
│   │       │   └── TemplateController.ts
│   │       ├── services/
│   │       │   └── TemplateService.ts
│   │       ├── models/
│   │       │   ├── Template.ts
│   │       │   └── TemplateSnapshot.ts
│   │       ├── routes/
│   │       │   ├── fields.ts
│   │       │   ├── print.ts
│   │       │   └── templates.ts
│   │       ├── config/
│   │       │   └── database.ts
│   │       └── middleware/
│   │           └── localOnly.ts
│   └── electron/          # Electron 36 桌面壳
│       └── src/main.ts
│
└── shared/
    └── printer/           # 共享打印库（@lunlunglass/printer）
        └── src/
            ├── index.ts             # 统一导出
            ├── EscPosEncoder.ts     # ESC/POS 指令编码
            ├── ImageComposer.ts     # 图片合成（canvas + jsbarcode + qrcode）
            ├── PrinterTransport.ts  # 传输层抽象
            └── types.ts             # 类型定义
```

---

## 许可证

双重授权：[AGPL-3.0](../../LICENSE)（开源）/ [商业授权](../../LICENSE-COMMERCIAL)（闭源集成）。详见项目根目录说明。
