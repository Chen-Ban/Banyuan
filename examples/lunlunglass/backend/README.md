# LunLunGlass Backend

LunLunGlass 后端服务，基于 TypeScript + Koa + MongoDB (Mongoose) 构建。

## 技术栈

- **Runtime**: Node.js
- **Framework**: Koa.js
- **Language**: TypeScript
- **Database**: MongoDB
- **ORM**: Mongoose

## 项目结构

```
src/
├── app.ts              # Koa 应用入口
├── index.ts            # 服务器启动文件
├── config/             # 配置文件
│   └── database.ts     # 数据库连接配置
├── middleware/         # 中间件
├── routes/             # 路由
│   └── index.ts        # 路由入口
├── controllers/        # 控制器
├── services/           # 服务层
├── models/            # 数据库模型
└── utils/             # 工具函数
```

## 开发

### 安装依赖

```bash
pnpm install
```

### 环境配置

复制 `.env.example` 为 `.env` 并配置环境变量：

```bash
cp .env.example .env
```

### 启动开发服务器

```bash
pnpm dev
```

服务器将在 `http://localhost:3000` 启动。

### 构建

```bash
pnpm build
```

### 启动生产服务器

```bash
pnpm start
```

## API 端点

### 健康检查

```
GET /health
```

## 环境变量

- `PORT`: 服务器端口（默认: 3000）
- `NODE_ENV`: 环境模式（development/production）
- `MONGODB_URI`: MongoDB 连接字符串

