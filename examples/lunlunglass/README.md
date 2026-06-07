# 轮轮眼镜 · LunlunGlass

> 眼镜店管理系统 —— Banyuan 平台的完整示例应用。

LunlunGlass 展示如何用 Banyuan 的技术栈（BanvasGL + React + Koa + Electron）构建一个真实的桌面端门店管理工具。它不是玩具 demo——包含热敏小票打印（ESC/POS 协议）、MongoDB 持久化、文件上传等生产级功能。

---

## 它做什么

一个眼镜店需要两套工具：

- **POS 收银端**：日常门店运营——管理客户、创建订单、记录验光数据、打印小票
- **Studio 模板设计端**：设计小票打印模板——拖拽组件到画布上，绑定数据字段，预览打印效果

两个端共享同一个打印库（`@lunlunglass/printer`），共享同一套模板数据。Studio 设计好模板后，POS 端直接使用。

---

## 项目结构

```
lunlunglass/
├── pos/               # POS 收银端（门店运营）
│   ├── frontend/      #   React + Vite (:5174)
│   ├── backend/       #   Koa + MongoDB
│   └── electron/      #   桌面壳
├── studio/            # 模板设计端（Template Studio）
│   ├── frontend/      #   React + Vite + @banyuan/banvasgl (:5173)
│   ├── backend/       #   Koa + MongoDB
│   └── electron/      #   桌面壳
└── shared/
    └── printer/       # 共享打印库（ESC/POS 编码 + 图片合成 + 传输层）
```

Studio 前端集成了 `@banyuan/banvasgl` 画布引擎，用于小票模板的可视化设计。

---

## 快速开始

```bash
# 在 monorepo 根目录
pnpm install

# 一键启动（Studio + POS 全部）
pnpm dev:lunlunglass

# 或单独启动 POS / Studio
cd examples/lunlunglass/pos/frontend && pnpm dev
cd examples/lunlunglass/studio/frontend && pnpm dev
```

前置条件：Node.js >= 18、MongoDB 运行中。如需打印功能，连接 ESC/POS 热敏打印机。

---

## 许可证

[AGPL-3.0](../../LICENSE) / 商业授权
