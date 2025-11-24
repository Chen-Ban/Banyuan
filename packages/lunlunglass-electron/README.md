# Lunlunglass Electron

基于 Electron 的桌面应用程序，使用 `lunlunglass-frontend` 作为前端界面。

## 开发

### 前置要求

- Node.js (推荐 v18+)
- pnpm

### 安装依赖

在项目根目录运行：

```bash
pnpm install
```

### 启动开发环境

在 `lunlunglass-electron` 目录下运行：

```bash
pnpm run dev
```

这个命令会同时启动：
- Vite 开发服务器（前端）
- Electron 应用

### 单独启动

如果需要单独启动：

```bash
# 启动前端开发服务器
pnpm run dev:frontend

# 启动 Electron（需要前端服务器已运行）
pnpm run dev:electron
```

## 构建

### 构建生产版本

```bash
pnpm run build
```

这会：
1. 构建 Electron 主进程代码
2. 构建前端应用

### 预览生产构建

```bash
pnpm run preview
```

## 项目结构

```
lunlunglass-electron/
├── src/
│   ├── main.ts          # Electron 主进程
│   └── preload.ts       # 预加载脚本
├── dist/                # 编译后的文件
├── package.json
└── tsconfig.json
```

## 技术栈

- **Electron**: 桌面应用框架
- **TypeScript**: 类型安全
- **Vite**: 前端构建工具（通过 lunlunglass-frontend）
- **React**: 前端框架（通过 lunlunglass-frontend）

