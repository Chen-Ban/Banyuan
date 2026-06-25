# 应用元数据数据流——前端 Store + PreviewServer 下推 实施方案

## 关联决策

- **域 / 粒度 / 标题**：app / protocol / **C5. PreviewServer hotUpdate 下推协议——IPC 单向推送**
- **上游依赖**：
  - app / architecture / **A5. 预览态后端复用 deploy-agent 本地化** —— PreviewServer 的物理形态（scaffoldServer + 本地 Mongo）
  - app / architecture / **A6. PreviewServer 职责边界——纯后端运行时，非元数据代理** —— 确立 PreviewServer 只读消费者定位
  - app / mechanism / **M1. AI 请求代理机制（SSE 转发）** —— done 事件后 banyan 后端写库（append-only，保持不变）
  - app / mechanism / **M6. 前端 Store 统一状态管理 + PreviewServer 下推同步** —— store 持有数据、save() 直连 banyan 后端、持久化后下推
  - app / protocol / **C2. Electron IPC 协议** —— IPC 基座规范
- **协同方案**：
  - `docs/specs/app/preview-local-backend.md` —— PreviewServer 后端执行职责（scaffoldServer、本地 Mongo、进程管理、hotUpdate 执行细节）

---

## 目标

建立应用元数据（appJSON / collections / cloudFunctions）在前端 store、banyan 后端、PreviewServer 之间的完整数据流，实现：

1. **前端 store 持有业务数据**：applicationStore 持有 appJSON（`string`，App.serialize() 产物） / collections / cloudFunctions 实际值，单一 `save()` 方法调用 banyan 后端聚合端点完成持久化
2. **append-only 持久化不变**：banyan 后端在 AI 对话 done 事件后写库的机制保持不变（M1 不修订），保证跨设备可恢复性
3. **PreviewServer 下游只读消费**：任何持久化成功后，前端通过 IPC 将 collections + cloudFunctions 推送给 PreviewServer 做 hotUpdate，PreviewServer 不主动拉取、不反向写入
4. **appJSON 不推送 PreviewServer**：PreviewServer 的 ServerFlowRunner 只需要数据表和云函数，页面布局数据只在前端 renderer 进程使用

非目标：

- PreviewServer 后端执行职责的内部实现细节（属 `preview-local-backend.md`）
- 前端 store 内部的 zustand slice / 中间件选型（实现细节由代码阶段决定）
- XiangDi Agent 内部如何产出 artifacts（属 xiangdi-agent 包内部逻辑）
- 对话 phase 状态机设计（属 xiangdi-agent 的 phases.ts）

---

## 整体拓扑

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Electron App                                                                │
│                                                                              │
│  ┌────────────────────────────────────────────────┐                          │
│  │  Renderer（前端）                               │                          │
│  │  ┌──────────────────────────────────────────┐  │                          │
│  │  │  applicationStore (zustand)              │  │                          │
│  │  │  ├ appJSON: string (App.serialize())     │  │                          │
│  │  │  ├ collections: CollectionDef[]          │  │                          │
│  │  │  ├ cloudFunctions: CloudFunctionDef[]    │  │                          │
│  │  │  ├ save() ─── HTTP PUT ──────────────────┼──┼──▶ banyan 后端(:3001)    │
│  │  │  └ hotUpdatePreview() ── IPC ──┐         │  │     PUT /apps/:id/save-all│
│  │  └──────────────────────────────────┼───────┘  │                          │
│  │                                     │          │  SSE (M1, 对话流)         │
│  └─────────────────────────────────────┼──────────┘──────────┐               │
│                                        │                     │               │
│  ┌─────────────────────────────────────▼──────┐              │               │
│  │  Main Process: PreviewServer               │              │               │
│  │  ┌──────────────────────────────────────┐  │              │               │
│  │  │  collections (当前可执行态)           │  │              │               │
│  │  │  cloudFunctions (当前可执行态)        │  │              │               │
│  │  ├──────────────────────────────────────┤  │              │               │
│  │  │  mongoose model 注册                  │  │              │               │
│  │  │  ServerFlowRunner 执行器映射          │  │              │               │
│  │  │  本地 Mongo 连接                      │  │              │               │
│  │  └──────────────────────────────────────┘  │              │               │
│  └────────────────────────────────────────────┘              │               │
│                                                              │               │
└──────────────────────────────────────────────────────────────┼───────────────┘
                                                               │
                                                               ▼
                                                       banyan 后端(:3001)
                                                       ├ MongoDB 持久化 (append-only)
                                                       ├ SSE 代理 → xiangdi
                                                       └ done 事件后写库
```

**关键数据流路径：**

- **初始化**：前端打开应用 → `GET /apps/:id/full-state` → store 初始化 → hotUpdatePreview 推送 PreviewServer
- **手动编辑**：UIPage 拖拽 → useRef 实时态 → 切页/保存时 flush → store 更新（appJSON 不推送 PreviewServer）
- **保存**：用户 Ctrl+S → flush ref → store.save() → `PUT /apps/:id/save-all` → 成功 → hotUpdatePreview 推送 PreviewServer（collections + cloudFunctions）
- **AI 产出**：SSE done → banyan 后端写库 → 前端收到 done 后 `refreshFromBackend()` 拉取最新数据 → store 更新 → hotUpdatePreview 推送 PreviewServer
- **集合/云函数 CRUD**：用户操作 → HTTP POST/PUT/DELETE banyan 后端 → 成功 → store 更新 → hotUpdatePreview 推送 PreviewServer

---

## 后端聚合端点设计

### `PUT /apps/:appId/save-all`

前端 store.save() 的唯一写入端点。后端内部复用现有 service 层：

```typescript
// 路由：apps.routes.ts
router.put('/apps/:appId/save-all', async (ctx) => {
  const { appId } = ctx.params
  const { appJSON, collections, cloudFunctions } = ctx.request.body

  // 内部并行调用现有 service（事务性可选，MVP 不强求原子）
  await Promise.all([
    appContentService.saveContent(appId, appJSON), // 复用现有 ADR-042 版本化写入
    schemaService.replaceCollections(appId, collections),
    cloudFunctionService.replaceAll(appId, cloudFunctions),
  ])

  ctx.body = { success: true }
})
```

**设计要点：**

- appJSON 保存仍走 ADR-042 的版本化语义（内部 runAutoConfirmedEdit），不破坏 AI 对话的 append-only 模型
- collections / cloudFunctions 走 replace-all 语义（全量覆盖），与 hotUpdate 全量推送语义对齐
- 失败时返回具体错误信息，前端可 retry 或提示用户

### `GET /apps/:appId/full-state`

前端 refreshFromBackend() 的唯一读取端点。后端内部并行查三张表：

```typescript
// 路由：apps.routes.ts
router.get('/apps/:appId/full-state', async (ctx) => {
  const { appId } = ctx.params

  const [appContent, schema, functions] = await Promise.all([
    appContentService.getLatestContent(appId),
    schemaService.getSchema(appId),
    cloudFunctionService.listAll(appId),
  ])

  ctx.body = {
    success: true,
    data: {
      appJSON: appContent?.appJSON ?? '',
      collections: schema?.collections ?? [],
      cloudFunctions: functions ?? [],
    },
  }
})
```

---

## 实施步骤

### 步骤 1：前端 applicationStore 重设计

**位置**：`apps/banyan/frontend/src/stores/applicationStore.ts`

Store 持有实际业务数据，不持有回调。所有持久化调用 banyan 后端聚合端点：

```typescript
interface ApplicationState {
  // === 业务数据 ===
  appId: string | null
  appJSON: string // App.serialize() 产出的完整 JSON 字符串
  collections: CollectionDef[]
  cloudFunctions: CloudFunctionDef[]

  // === 状态标识 ===
  isDirty: boolean // appJSON 是否有未保存的编辑
  isSaving: boolean

  // === 应用元信息（保留现有） ===
  appName: string
  designSize: DesignSize

  // === AI 对话 ===
  initialPrompt: Map<string, string>

  // === 操作方法 ===
  load: (appId: string) => Promise<void>
  save: () => Promise<void>
  refreshFromBackend: () => Promise<void> // done 事件后拉取最新数据
  flushAppJSON: (serialized: string) => void // UIPage flush 整个 app 序列化字符串

  // === 集合 CRUD（即时持久化） ===
  createCollection: (schema: Omit<CollectionDef, 'name'> & { name: string }) => Promise<CollectionDef>
  updateCollection: (name: string, updates: Partial<CollectionDef>) => Promise<CollectionDef>
  deleteCollection: (name: string) => Promise<void>

  // === 云函数 CRUD（即时持久化） ===
  createCloudFunction: (fn: CreateCloudFunctionParams) => Promise<CloudFunctionDef>
  updateCloudFunction: (id: string, fn: UpdateCloudFunctionParams) => Promise<CloudFunctionDef>
  deleteCloudFunction: (id: string) => Promise<void>

  // === 初始化 / 清理 ===
  setInitialPrompt: (appId: string, prompt: string) => void
  consumeInitialPrompt: (appId: string) => string | undefined
  reset: () => void
}
```

每个持久化操作成功后，统一调用 `hotUpdatePreview()`（从 store 自取 appId，调用方无需传入）：

```typescript
const save = async () => {
  set({ isSaving: true })
  const { appId, appJSON, collections, cloudFunctions } = get()
  await fullStateApi.saveAll(appId!, { appJSON, collections, cloudFunctions })
  set({ isDirty: false, isSaving: false })
  hotUpdatePreview(collections, cloudFunctions)
}

const createCollection = async (schema) => {
  const created = await schemaApi.addCollection(get().appId!, schema)
  const collections = [...get().collections, created.data!]
  set({ collections })
  hotUpdatePreview(collections, get().cloudFunctions)
  return created.data!
}
```

**关于 flush：** UIPage 内 `useRef` 持有当前画布 `app.serialize()` 的实时结果，`flushAppJSON` 只更新 store 中的 appJSON 字符串（设 `isDirty: true`），不触发 hotUpdate（appJSON 不推送 PreviewServer）。

### 步骤 2：hotUpdatePreview 辅助函数

**位置**：`apps/banyan/frontend/src/utils/previewBridge.ts`（新建）

封装 IPC 下推逻辑，从 store 自取 appId：

```typescript
import type { CollectionDef } from '@/api/schema'
import type { CloudFunctionDef } from '@/api/cloudFunctions'
import { useApplicationStore } from '@/stores/applicationStore'

/**
 * 将最新 collections + cloudFunctions 推送给 PreviewServer 做 hotUpdate。
 *
 * - 从 store 自取当前 appId（PreviewServer 生命周期与应用页一致）
 * - 非 Electron 环境时静默跳过（无 PreviewServer 可接收）
 */
export async function hotUpdatePreview(
  collections: CollectionDef[],
  cloudFunctions: CloudFunctionDef[],
): Promise<void> {
  if (!window.electronAPI?.preview) return // 非 Electron 环境，静默跳过

  const appId = useApplicationStore.getState().appId
  if (!appId) return

  try {
    await window.electronAPI.preview.hotUpdate(appId, { collections, cloudFunctions })
  } catch (err) {
    // PreviewServer 可能未启动，不阻塞主流程
    console.warn('[previewBridge] hotUpdate IPC error:', err)
  }
}
```

### 步骤 3：Preload（已就绪）

**位置**：`apps/banyan/electron/src/preload.ts`

当前已暴露 `preview.hotUpdate(appId, patch)` 且 channel 为 `preview:hotUpdate`，**无需修改**。

### 步骤 4：Main 进程 IPC Handler（修复缺失）

**位置**：`apps/banyan/electron/src/main.ts`

在 `registerIpcHandlers()` 中补充缺失的 `preview:hotUpdate` handler：

```typescript
ipcMain.handle(
  'preview:hotUpdate',
  async (_event, appId: string, patch: { collections?: unknown[]; cloudFunctions?: unknown[] }) => {
    await previewOrchestrator.hotUpdate(appId, patch)
  },
)
```

### 步骤 5：PreviewServerOrchestrator 暴露 public hotUpdate

**位置**：`apps/banyan/electron/src/preview/PreviewServerOrchestrator.ts`

将现有 `private hotUpdate(instance, input)` 重构为 public 方法，接收 `(appId, patch)`：

```typescript
/**
 * 外部 IPC handler 调用的 public hotUpdate 入口。
 * 按 appId 查找实例，构造 input 全量替换。
 */
public async hotUpdate(appId: string, patch: { collections?: unknown[]; cloudFunctions?: unknown[] }): Promise<void> {
  const instance = this.instances.get(appId);
  if (!instance || instance.status !== 'running') {
    // PreviewServer 未运行，静默跳过
    return;
  }

  // 合并 patch 到 lastInput，调用内部 hotUpdate 逻辑
  const merged: PreviewServerInput = {
    ...instance.lastInput,
    collectionSchemas: (patch.collections ?? instance.lastInput.collectionSchemas) as CollectionDef[],
    cloudFunctions: (patch.cloudFunctions ?? instance.lastInput.cloudFunctions) as CloudFunctionDef[],
  };

  await this.applyHotUpdate(instance, merged);
  this.resetIdleTimer(appId);
}
```

原 `private hotUpdate` 重命名为 `private applyHotUpdate`，逻辑不变。

### 步骤 6：AI 产出数据流（done 事件处理）

**位置**：`apps/banyan/frontend/src/hooks/useXiangDi.ts`

当前 `onDone` 回调签名为 `(summary: string) => void`。保持不变，但 AiBar 中的 `handleDone` 改为调用 store.refreshFromBackend：

```typescript
// AiBar 中
const handleDone = useCallback(async (summary: string) => {
  // banyan 后端已在 done 事件后写库（M1 不变）
  // 前端拉取最新数据，更新 store + 推送 PreviewServer
  await useApplicationStore.getState().refreshFromBackend()
}, [])
```

`refreshFromBackend()` 实现（在 store 内部）：

```typescript
const refreshFromBackend = async () => {
  const appId = get().appId
  if (!appId) return
  const res = await fullStateApi.getFullState(appId)
  const { appJSON, collections, cloudFunctions } = res.data!
  set({ appJSON, collections, cloudFunctions, isDirty: false })
  // 推送 PreviewServer
  hotUpdatePreview(collections, cloudFunctions)
}
```

### 步骤 7：UIPage 中的 ref + flush 机制

**位置**：`apps/banyan/frontend/src/pages/UIPage/` 相关组件

UIPage 内部用 `useRef` 持有当前画布 `app.serialize()` 的实时结果，不触发 re-render。在以下时机 flush 到 store：

- 切页（路由离开当前页面）
- 保存（Ctrl+S）
- 构建

```typescript
const appSerializedRef = useRef<string>(initialAppJSON)

// BanvasGL 序列化变更回调（Transaction commit 时触发）
const handleSerializeChange = useCallback((serialized: string) => {
  appSerializedRef.current = serialized
}, [])

// flush 到 store（appJSON 更新，不触发 PreviewServer 推送）
const flush = useCallback(() => {
  useApplicationStore.getState().flushAppJSON(appSerializedRef.current)
}, [])

// 路由离开时 flush
useEffect(() => {
  return () => {
    flush()
  }
}, [flush])
```

注意：`flushAppJSON` 只更新 store 中的 appJSON 字符串 + 设 isDirty = true，不触发 hotUpdatePreview（appJSON 不推送 PreviewServer）。

现有 `registerSaveHandler` 机制保留但简化——UIPage 的 saveHandler 只做 `flush()`，之后由 ApplicationLayout 统一调用 `store.save()`：

```typescript
// UIPage
useEffect(() => {
  const unsubscribe = registerSaveHandler(async () => {
    flush() // 只 flush ref → store，不直接调 API
  })
  return unsubscribe
}, [flush, registerSaveHandler])

// ApplicationLayout handleSave
const handleSave = async () => {
  await requestSave() // 触发 UIPage flush
  await store.save() // store 统一 save-all → banyan 后端 → hotUpdate
}
```

---

## 降级策略（非 Electron 环境）

纯浏览器开发调试模式下 `window.electronAPI` 为 undefined：

- store 所有持久化操作直接调用 banyan 后端 HTTP API（本身就是这么设计的，不需要降级分支）
- `hotUpdatePreview()` 检测到 `window.electronAPI?.preview` 为 undefined 时静默跳过
- 降级模式下不支持预览态后端执行（无 PreviewServer），预览仅为纯前端渲染

与旧设计的关键区别：旧设计中前端在 Electron 环境需要走 IPC 代理才能持久化，降级时要切换为 HTTP 直连。新设计中前端**始终通过 HTTP 直连 banyan 后端**做持久化，IPC 只用于 hotUpdate 下推，因此无需环境分支逻辑来处理持久化路径。

---

## 时序图：AI 产出 → 持久化 → PreviewServer 刷新

```
前端 (Renderer)              banyan 后端 (:3001)        xiangdi (:3002)     PreviewServer (Main)
     │                             │                         │                      │
     │─── SSE /api/ai/chat ───────▶│── HTTP /orchestrate ───▶│                      │
     │                             │                         │                      │
     │◀── text_delta ──────────────│◀── SSE ─────────────────│                      │
     │◀── agent_progress ──────────│                         │                      │
     │    ...                      │                         │                      │
     │◀── done {summary} ─────────│◀── done {artifacts} ────│                      │
     │                             │                         │                      │
     │                             │── MongoDB 写入 ─────────┘                      │
     │                             │   (append-only, M1)                            │
     │                             │                                                │
     │── GET /apps/:id/full-state ▶│                                                │
     │◀── { appJSON, colls, cfs } ─│                                                │
     │                             │                                                │
     │── store.refreshFromBackend  │                                                │
     │      └── hotUpdatePreview ──┼──── IPC preview:hotUpdate ──────────────────▶│
     │                             │                                                │── 刷新 model
     │◀── (IPC resolve) ──────────┼────────────────────────────────────────────────│── 刷新 FlowRunner
     │                             │                                                │
```

## 时序图：手动保存 → PreviewServer 刷新

```
前端 (Renderer)              banyan 后端 (:3001)        PreviewServer (Main)
     │                             │                         │
     │── Ctrl+S                    │                         │
     │── requestSave() → UIPage flush ref → store.flushAppJSON
     │── store.save()              │                         │
     │── PUT /apps/:id/save-all ──▶│                         │
     │                             │── 内部写三张表          │
     │◀── 200 { success: true } ───│                         │
     │                             │                         │
     │── hotUpdatePreview ─────────┼── IPC hotUpdate ───────▶│
     │                             │                         │── 刷新 model + FlowRunner
     │◀── (IPC resolve) ──────────┼─────────────────────────│
     │                             │                         │
```

## 时序图：集合 CRUD → PreviewServer 刷新

```
前端 (Renderer)              banyan 后端 (:3001)        PreviewServer (Main)
     │                             │                         │
     │── store.createCollection()  │                         │
     │── POST /apps/:id/schema/collections ▶│                │
     │                             │── MongoDB 写入          │
     │◀── 201 { created } ─────────│                         │
     │                             │                         │
     │── store.set({ collections })│                         │
     │── hotUpdatePreview ─────────┼── IPC hotUpdate ───────▶│
     │                             │                         │── 刷新 model + FlowRunner
     │◀── (IPC resolve) ──────────┼─────────────────────────│
     │                             │                         │
```

---

## 验收标准

1. **store 持有业务数据**：applicationStore 直接持有 appJSON（string）/ collections / cloudFunctions 的实际值，不持有回调或引用
2. **持久化走聚合端点**：save() 调用 `PUT /apps/:appId/save-all`（后端内部复用三套 service）；refreshFromBackend() 调用 `GET /apps/:appId/full-state`
3. **M1 不修订**：banyan 后端在 done 事件后写库行为保持不变（append-only），前端 done 后拉取最新数据
4. **PreviewServer 只读消费**：PreviewServer 不发起任何 HTTP 请求，只通过 IPC 接收前端推送的 collections + cloudFunctions
5. **appJSON 不推送 PreviewServer**：IPC hotUpdate payload 只包含 collections + cloudFunctions
6. **hotUpdate 时机正确**：只在持久化确认成功后才推送 PreviewServer（先落库、再推送），保证 PreviewServer 可执行态与落库数据一致
7. **hotUpdatePreview 不传 appId**：辅助函数从 store 自取当前 appId，调用方零参数传递
8. **main.ts handler 已注册**：`preview:hotUpdate` channel 在 `registerIpcHandlers()` 中正确注册
9. **降级可用**：非 Electron 环境下持久化正常（HTTP 直连），hotUpdate 静默跳过，无报错
10. **UIPage 性能**：拖拽操作不触发 store 更新，仅 ref 更新；切页/保存时 flush，无明显卡顿

---

## 影响范围

| 文件 / 模块                                                     | 改动类型                                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `apps/banyan/frontend/src/stores/applicationStore.ts`           | 重设计：持有业务数据 + save() + CRUD + refreshFromBackend + flushAppJSON |
| `apps/banyan/frontend/src/utils/previewBridge.ts`               | 新建：hotUpdatePreview() 辅助函数（从 store 自取 appId）                 |
| `apps/banyan/frontend/src/api/fullState.ts`                     | 新建：saveAll / getFullState 聚合端点客户端                              |
| `apps/banyan/frontend/src/hooks/useXiangDi.ts`                  | 不改（onDone 签名不变）                                                  |
| `apps/banyan/frontend/src/components/AiBar/index.tsx`           | handleDone 改为 refreshFromBackend                                       |
| `apps/banyan/frontend/src/pages/UIPage/`                        | ref + flush 机制（appJSON 编辑）                                         |
| `apps/banyan/frontend/src/layouts/ApplicationLayout/index.tsx`  | handleSave 改为 requestSave + store.save()                               |
| `apps/banyan/electron/src/main.ts`                              | 修复：补充 `preview:hotUpdate` IPC handler                               |
| `apps/banyan/electron/src/preview/PreviewServerOrchestrator.ts` | 暴露 public hotUpdate(appId, patch)                                      |
| `apps/banyan/backend/src/routes/apps.ts`                        | 新增 save-all / full-state 两个聚合路由                                  |

**不需要修改的模块（对比旧方案）：**

| 文件 / 模块                                             | 说明                                                   |
| ------------------------------------------------------- | ------------------------------------------------------ |
| `apps/banyan/electron/src/preload.ts`                   | 已正确暴露 `preview:hotUpdate(appId, patch)`，无需修改 |
| `packages/xiangdi-agent/src/orchestration/events.ts`    | done 事件结构不变                                      |
| `apps/xiangdi-server/src/routes/orchestrateHandlers.ts` | 不变                                                   |
| `apps/banyan/backend/src/services/AiService.ts`         | 保持 done 事件后写库行为不变（M1 不修订）              |

---

## 风险与分阶段建议

**Phase 1（MVP，打通核心链路）：**

- 后端 save-all / full-state 聚合端点
- 前端 applicationStore 重设计（持有数据 + save + refreshFromBackend + flushAppJSON）
- previewBridge.ts（hotUpdatePreview 辅助函数）
- main.ts 修复 `preview:hotUpdate` handler
- PreviewServerOrchestrator public hotUpdate
- done 事件后 refreshFromBackend + hotUpdate
- UIPage ref + flush 机制

**Phase 2（补全 CRUD + 健壮性）：**

- DatabasePage / FunctionsPage 的即时 CRUD 走 store 方法 → hotUpdate 完整链路
- hotUpdate 失败重试（PreviewServer 进程未就绪时的排队）
- PreviewServer 启动时前端主动推送一次初始态（当前 start 时已传入全量数据，启动后无需额外推送）

**Phase 3（优化体验）：**

- 保存失败重试与冲突处理（乐观锁 / 版本号比对）
- 多标签页（同一应用多个 UIPage 同时打开）的 flush 协调
- PreviewServer hotUpdate 性能优化（diff 仅重注册变更的 model，而非全量）
