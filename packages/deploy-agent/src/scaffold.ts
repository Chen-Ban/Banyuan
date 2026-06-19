/**
 * Scaffold 模块 - 从 appJSON 生成项目文件
 * 逻辑与 banyan backend scaffold.ts 一致的简化版，不依赖后端代码
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AppJSON, CollectionDef, CloudFunctionDef } from './types.js';

/** 生成项目 scaffold 到指定目录 */
export async function scaffoldProject(projectDir: string, appJSON: AppJSON): Promise<void> {
  // 确保目录结构存在
  await mkdir(join(projectDir, 'src'), { recursive: true });
  await mkdir(join(projectDir, 'public'), { recursive: true });

  // 并行写入所有文件
  await Promise.all([
    writeFile(join(projectDir, 'package.json'), generatePackageJson(appJSON)),
    writeFile(join(projectDir, 'vite.config.ts'), generateViteConfig()),
    writeFile(join(projectDir, 'tsconfig.json'), generateTsConfig()),
    writeFile(join(projectDir, 'index.html'), generateIndexHtml(appJSON)),
    writeFile(join(projectDir, 'src', 'main.tsx'), generateMainTsx()),
    writeFile(join(projectDir, 'src', 'App.tsx'), generateAppTsx(appJSON)),
    writeFile(join(projectDir, 'public', 'app.json'), JSON.stringify(appJSON, null, 2)),
  ]);
}

function generatePackageJson(appJSON: AppJSON): string {
  const pkg = {
    name: appJSON.appId,
    version: '1.0.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'vite',
      build: 'vite build',
      preview: 'vite preview',
    },
    dependencies: {
      react: '^19.0.0',
      'react-dom': '^19.0.0',
      '@banyuan/banvasgl': 'latest',
      '@banyuan/banvas-runtime': 'latest',
    },
    devDependencies: {
      '@types/react': '^19.0.0',
      '@types/react-dom': '^19.0.0',
      '@vitejs/plugin-react': '^4.3.0',
      typescript: '~5.7.3',
      vite: '^6.3.0',
    },
  };
  return JSON.stringify(pkg, null, 2);
}

function generateViteConfig(): string {
  return `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
`;
}

function generateTsConfig(): string {
  const config = {
    compilerOptions: {
      target: 'ES2020',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      jsx: 'react-jsx',
      resolveJsonModule: true,
    },
    include: ['src'],
  };
  return JSON.stringify(config, null, 2);
}

function generateIndexHtml(appJSON: AppJSON): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${appJSON.name}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body, #root { width: 100%; height: 100%; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}

function generateMainTsx(): string {
  return `import { createRoot } from 'react-dom/client';
import { App } from './App';

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
`;
}

function generateAppTsx(appJSON: AppJSON): string {
  // 获取首页尺寸作为画布 fixed mode 参数
  const firstPage = appJSON.pages?.[0] as { width?: number; height?: number } | undefined;
  const width = firstPage?.width ?? 375;
  const height = firstPage?.height ?? 812;

  return `import { useState, useEffect } from 'react';
import { useRuntimeBanvas } from '@banyuan/banvas-runtime';

export function App() {
  const [appJSONStr, setAppJSONStr] = useState<string | null>(null);

  useEffect(() => {
    fetch('/app.json')
      .then(res => res.text())
      .then(setAppJSONStr)
      .catch(err => console.error('[Banyuan App] Failed to load app.json:', err));
  }, []);

  if (!appJSONStr) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>Loading...</div>;

  return <BanvasCanvas appJSON={appJSONStr} />;
}

function BanvasCanvas({ appJSON }: { appJSON: string }) {
  const { Banvas } = useRuntimeBanvas({
    appJSON,
    width: ${width},
    height: ${height},
    appOptions: { flowEnabled: true },
  });

  return Banvas;
}
`;
}

// ──────────────────────────────────────────────────────────────────────────────
// Server Scaffold（全栈模式）—— 生成 Koa 服务端目录
// 符合 ADR-011 Decision 4 规范：server/schema.json + server/functions.json + Koa 入口
// ──────────────────────────────────────────────────────────────────────────────

export interface ScaffoldServerOptions {
  serverDir: string;
  appSlug: string;
  collections: CollectionDef[];
  cloudFunctions: CloudFunctionDef[];
  containerPort: number;
}

/**
 * 生成服务端项目到指定目录
 *
 * 输出结构：
 *   server/
 *   ├── package.json
 *   ├── schema.json        ← CollectionDef[] 运行时快照
 *   ├── functions.json     ← CloudFunctionDef[] 运行时快照
 *   ├── index.js           ← Koa 入口
 *   ├── db.js              ← 从 schema.json 生成 Mongoose 动态模型
 *   ├── flow-runner.js     ← FlowSchema 执行器封装
 *   └── Dockerfile
 */
export async function scaffoldServer(options: ScaffoldServerOptions): Promise<void> {
  const { serverDir, appSlug, collections, cloudFunctions, containerPort } = options;

  await mkdir(serverDir, { recursive: true });

  await Promise.all([
    writeFile(join(serverDir, 'package.json'), generateServerPackageJson(appSlug)),
    writeFile(join(serverDir, 'schema.json'), JSON.stringify(collections, null, 2)),
    writeFile(join(serverDir, 'functions.json'), JSON.stringify(cloudFunctions, null, 2)),
    writeFile(join(serverDir, 'index.js'), generateServerIndex(containerPort)),
    writeFile(join(serverDir, 'db.js'), generateDbModule()),
    writeFile(join(serverDir, 'flow-runner.js'), generateFlowRunnerModule()),
    writeFile(join(serverDir, 'Dockerfile'), generateServerDockerfile(containerPort)),
  ]);
}

function generateServerPackageJson(appSlug: string): string {
  const pkg = {
    name: `${appSlug}-server`,
    version: '1.0.0',
    type: 'module',
    scripts: { start: 'node index.js' },
    dependencies: {
      koa: '^2.15.0',
      '@koa/router': '^13.1.0',
      'koa-bodyparser': '^4.4.1',
      mongoose: '^8.7.0',
      '@banyuan/banvasgl': 'latest',
    },
  };
  return JSON.stringify(pkg, null, 2);
}

function generateServerIndex(port: number): string {
  return `/**
 * Banyuan 全栈应用 —— 自动生成的 Koa 服务端入口
 * 提供 CRUD API + 云函数执行
 */
import Koa from 'koa';
import Router from '@koa/router';
import bodyParser from 'koa-bodyparser';
import { connectDB, getModel } from './db.js';
import { runFunction } from './flow-runner.js';
import { readFileSync } from 'node:fs';

const app = new Koa();
const router = new Router({ prefix: '/api' });

// ── 读取 schema / functions ──
const collections = JSON.parse(readFileSync('./schema.json', 'utf-8'));
const functions = JSON.parse(readFileSync('./functions.json', 'utf-8'));

// ── 通用 CRUD 路由（每个 collection 自动生成） ──
for (const col of collections) {
  const name = col.name;

  // GET /api/:collection
  router.get('/' + name, async (ctx) => {
    const Model = getModel(name);
    const filter = ctx.query.filter ? JSON.parse(ctx.query.filter) : {};
    const limit = parseInt(ctx.query.limit) || 50;
    const docs = await Model.find(filter).limit(limit).lean();
    ctx.body = { success: true, data: docs };
  });

  // GET /api/:collection/:id
  router.get('/' + name + '/:id', async (ctx) => {
    const Model = getModel(name);
    const doc = await Model.findById(ctx.params.id).lean();
    if (!doc) { ctx.status = 404; ctx.body = { success: false, message: 'Not found' }; return; }
    ctx.body = { success: true, data: doc };
  });

  // POST /api/:collection
  router.post('/' + name, async (ctx) => {
    const Model = getModel(name);
    const doc = await Model.create(ctx.request.body);
    ctx.status = 201;
    ctx.body = { success: true, data: doc.toObject() };
  });

  // PUT /api/:collection/:id
  router.put('/' + name + '/:id', async (ctx) => {
    const Model = getModel(name);
    const doc = await Model.findByIdAndUpdate(ctx.params.id, ctx.request.body, { new: true, runValidators: true });
    if (!doc) { ctx.status = 404; ctx.body = { success: false, message: 'Not found' }; return; }
    ctx.body = { success: true, data: doc.toObject() };
  });

  // DELETE /api/:collection/:id
  router.del('/' + name + '/:id', async (ctx) => {
    const Model = getModel(name);
    const doc = await Model.findByIdAndDelete(ctx.params.id);
    if (!doc) { ctx.status = 404; ctx.body = { success: false, message: 'Not found' }; return; }
    ctx.body = { success: true };
  });
}

// ── 云函数执行路由 ──
router.post('/functions/:name', async (ctx) => {
  const fn = functions.find(f => f.name === ctx.params.name);
  if (!fn) { ctx.status = 404; ctx.body = { success: false, message: 'Function not found' }; return; }
  const input = ctx.request.body || {};
  const result = await runFunction(fn.flowSchema, input);
  ctx.body = { success: true, data: result };
});

// ── Health check ──
router.get('/health', (ctx) => {
  ctx.body = { status: 'ok', timestamp: new Date().toISOString() };
});

// ── 组装并启动 ──
app.use(bodyParser());
app.use(router.routes());
app.use(router.allowedMethods());

const PORT = process.env.PORT || ${port};

await connectDB();

app.listen(PORT, () => {
  console.log('[Banyuan Server] Running on port ' + PORT);
  console.log('[Banyuan Server] Collections:', collections.map(c => c.name).join(', '));
  console.log('[Banyuan Server] Functions:', functions.map(f => f.name).join(', '));
});
`;
}

function generateDbModule(): string {
  return `/**
 * 动态 Mongoose 模型生成 —— 根据 schema.json 自动创建 Collection 模型
 */
import mongoose from 'mongoose';
import { readFileSync } from 'node:fs';

const collections = JSON.parse(readFileSync('./schema.json', 'utf-8'));
const models = new Map();

// 字段类型映射
const TYPE_MAP = {
  string: String,
  number: Number,
  boolean: Boolean,
  date: Date,
  enum: String,
  ref: mongoose.Schema.Types.ObjectId,
  array: Array,
  object: mongoose.Schema.Types.Mixed,
};

function buildSchemaFields(fields) {
  const schemaDef = {};
  for (const field of fields) {
    const def = {
      type: TYPE_MAP[field.type] || mongoose.Schema.Types.Mixed,
      required: field.required || false,
    };
    if (field.defaultValue !== undefined) def.default = field.defaultValue;
    if (field.type === 'enum' && field.enumValues) def.enum = field.enumValues;
    if (field.type === 'ref' && field.refCollection) def.ref = field.refCollection;
    schemaDef[field.name] = def;
  }
  return schemaDef;
}

// 初始化所有模型
for (const col of collections) {
  const schema = new mongoose.Schema(buildSchemaFields(col.fields), { timestamps: true });
  const model = mongoose.model(col.name, schema);
  models.set(col.name, model);
}

export function getModel(name) {
  const model = models.get(name);
  if (!model) throw new Error('Unknown collection: ' + name);
  return model;
}

export async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/banyuan_app';
  await mongoose.connect(uri);
  console.log('[DB] Connected to MongoDB');
}
`;
}

function generateFlowRunnerModule(): string {
  return `/**
 * FlowSchema 执行器封装
 * 使用 @banyuan/banvasgl/flow/server 执行云函数
 */
import { createServerFlowRunner } from '@banyuan/banvasgl/flow/server';
import { getModel } from './db.js';

const runner = createServerFlowRunner();

/**
 * 执行一个 FlowSchema
 * @param {object} flowSchema - { nodes: [], edges: [] }
 * @param {object} input - 调用输入参数
 * @returns {Promise<unknown>}
 */
export async function runFunction(flowSchema, input = {}) {
  // 构建 FlowContext
  const context = {
    eventArgs: [],
    env: {
      db: {
        find: async (collection, filter, options) => {
          const Model = getModel(collection);
          let query = Model.find(filter);
          if (options?.sort) query = query.sort(options.sort);
          if (options?.limit) query = query.limit(options.limit);
          const docs = await query.lean();
          return docs;
        },
        insertOne: async (collection, doc) => {
          const Model = getModel(collection);
          const created = await Model.create(doc);
          return { insertedId: created._id.toString() };
        },
        updateMany: async (collection, filter, update) => {
          const Model = getModel(collection);
          const result = await Model.updateMany(filter, update);
          return { modifiedCount: result.modifiedCount };
        },
        deleteMany: async (collection, filter) => {
          const Model = getModel(collection);
          const result = await Model.deleteMany(filter);
          return { deletedCount: result.deletedCount };
        },
      },
    },
    variables: new Map([['local', new Map(Object.entries(input))], ['flow', new Map()]]),
    getVariable(scope, key) {
      return this.variables.get(scope)?.get(key);
    },
    setVariable(scope, key, value) {
      if (!this.variables.has(scope)) this.variables.set(scope, new Map());
      this.variables.get(scope).set(key, value);
    },
  };

  const result = await runner.run(flowSchema, context);
  return result;
}
`;
}

function generateServerDockerfile(port: number): string {
  return `FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY . .

EXPOSE ${port}

ENV PORT=${port}
ENV NODE_ENV=production

CMD ["npm", "start"]
`;
}
