# ADR-038：原生能力桥接 — 统一 Bridge 接口注入 Web 服务层

**状态**：已接受（MVP 后实施）  
**决策日期**：2026-06-01  
**决策者**：陈班

---

## 背景

ADR-019 确立了 Banyuan 的跨平台路径：JSON 中间表示 + 统一接口层 + 各平台适配。该决策解决的是**渲染和逻辑执行**的跨平台问题——如何在不同平台上画出同样的 UI、跑出同样的流程。

但还有一类能力不在渲染和逻辑执行范畴内：**平台原生能力**。包括文件系统读写、摄像头、蓝牙、NFC、推送通知、打印、生物识别、系统对话框、剪贴板深度访问等。这些能力：

1. **不同平台的 API 完全不同**：Electron 通过 Node.js API，iOS 通过 Swift/ObjC，Android 通过 Kotlin/Java，Web 只有受限子集
2. **Web 层无法直接触达**：浏览器沙箱限制了 Web 代码对操作系统的访问
3. **用户的应用需要它们**：一个门店管理系统需要打印、一个设备巡检应用需要蓝牙扫描、一个进销存需要文件导入导出

Banyuan 的产品交付模型是「平台壳 + Web 服务」（ADR-037 Decision 3），壳是 WebView 容器，业务逻辑运行在 Web 层。如果 Web 层无法调用原生能力，那么用户构建的应用就只能是纯 Web 表现，无法利用平台壳提供的原生优势。

**需要一个 Bridge 层**：在壳和 Web 之间建立标准化的通信通道，让 Web 业务代码通过统一的 JavaScript 接口调用各平台的原生能力。

---

## 决策

### 架构总览

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Web 业务层                                      │
│                                                                     │
│   BanvasGL 画布 / FlowRunner 流程 / React SPA                       │
│                                                                     │
│   调用方式：                                                         │
│     const photo = await Bridge.camera.takePhoto()                   │
│     await Bridge.printer.print(htmlContent)                         │
│     const file = await Bridge.fs.pickFile({ accept: ['.xlsx'] })    │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               │  window.__BANYUAN_BRIDGE__ (统一接口)
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                     Bridge 契约层                                     │
│                     @banyuan/bridge                                  │
│                                                                     │
│   • 纯 TypeScript 接口定义（IBanyuanBridge）                          │
│   • 平台检测逻辑                                                     │
│   • 能力查询 API（Bridge.isAvailable('camera')）                     │
│   • 调用超时 / 错误标准化                                             │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ ElectronAdapter  │ │ CapacitorAdapter │ │   WebAdapter     │
│                  │ │                  │ │                  │
│ preload.ts 注入  │ │ Capacitor Plugin │ │ Web API 降级     │
│ Node.js / IPC    │ │ Swift / Kotlin   │ │ 或 throw         │
│                  │ │                  │ │ NotSupported     │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

### 核心设计原则

**1. 接口先行，实现后补。** `@banyuan/bridge` 包只定义 TypeScript 接口和运行时的 Bridge 获取逻辑，不包含任何平台实现代码。各平台适配器是独立的包/模块，按需实现。

**2. 能力可查询。** Web 层在调用前可以检测当前平台是否支持某项能力，从而做 UI 适配（隐藏不可用的功能入口，或展示降级提示）。

**3. 异步一切。** 所有 Bridge 方法返回 Promise，无论底层是同步还是异步实现。这统一了跨平台的调用模式。

**4. 安全沙箱化。** Bridge 只暴露预定义的能力集，不暴露通用的进程/文件系统访问。壳端通过白名单控制哪些能力对 Web 层可见。

**5. 版本化与能力协商。** Bridge 接口有版本号，壳端和 Web 端通过能力协商确定可用能力集，支持壳版本低于 Web 版本时的优雅降级。

---

### Decision 1：Bridge 契约接口（@banyuan/bridge）

```typescript
// packages/bridge/src/types.ts

/** Bridge 能力模块枚举 */
export type BridgeModule =
  | 'fs'
  | 'printer'
  | 'dialog'
  | 'camera'
  | 'bluetooth'
  | 'notification'
  | 'biometric'
  | 'clipboard'
  | 'geolocation'
  | 'nfc'

/** 核心 Bridge 接口 */
export interface IBanyuanBridge {
  /** Bridge 协议版本 */
  version: string
  /** 当前平台标识 */
  platform: 'electron' | 'capacitor-ios' | 'capacitor-android' | 'web'

  /** 查询某个能力模块是否可用 */
  isAvailable(module: BridgeModule): boolean
  /** 获取所有可用的能力模块 */
  getAvailableModules(): BridgeModule[]

  /** 文件系统 */
  fs: IBridgeFileSystem
  /** 打印 */
  printer: IBridgePrinter
  /** 系统对话框 */
  dialog: IBridgeDialog
  /** 摄像头（移动端为主） */
  camera?: IBridgeCamera
  /** 蓝牙（移动端/IoT 场景） */
  bluetooth?: IBridgeBluetooth
  /** 系统通知 */
  notification: IBridgeNotification
  /** 生物识别（指纹/面容） */
  biometric?: IBridgeBiometric
  /** 剪贴板（增强，超越 Web Clipboard API） */
  clipboard: IBridgeClipboard
}

/** 文件系统能力 */
export interface IBridgeFileSystem {
  readFile(path: string): Promise<Uint8Array>
  readTextFile(path: string, encoding?: string): Promise<string>
  writeFile(path: string, data: Uint8Array): Promise<void>
  writeTextFile(path: string, content: string, encoding?: string): Promise<void>
  exists(path: string): Promise<boolean>
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>
  readDir(path: string): Promise<FileEntry[]>
  remove(path: string, options?: { recursive?: boolean }): Promise<void>
  /** 选择文件（弹出系统文件选择器） */
  pickFile(options?: PickFileOptions): Promise<PickFileResult | null>
  /** 获取应用专属数据目录 */
  getAppDataDir(): Promise<string>
}

/** 打印能力 */
export interface IBridgePrinter {
  /** 获取可用打印机列表 */
  getPrinters(): Promise<PrinterInfo[]>
  /** 打印 HTML 内容 */
  print(html: string, options?: PrintOptions): Promise<PrintResult>
  /** 静默打印（无打印对话框） */
  silentPrint(html: string, printerName: string, options?: PrintOptions): Promise<PrintResult>
}

/** 系统对话框 */
export interface IBridgeDialog {
  showOpenDialog(options: OpenDialogOptions): Promise<string[] | null>
  showSaveDialog(options: SaveDialogOptions): Promise<string | null>
  showMessageBox(options: MessageBoxOptions): Promise<MessageBoxResult>
}

/** 摄像头 */
export interface IBridgeCamera {
  /** 拍照 */
  takePhoto(options?: CameraOptions): Promise<PhotoResult>
  /** 从相册选择 */
  pickFromGallery(options?: GalleryOptions): Promise<PhotoResult>
  /** 扫码 */
  scanBarcode(): Promise<BarcodeResult>
}

/** 蓝牙 */
export interface IBridgeBluetooth {
  /** 扫描附近设备 */
  scan(options?: BleScanOptions): Promise<BleDevice[]>
  /** 连接设备 */
  connect(deviceId: string): Promise<BleConnection>
  /** 断开连接 */
  disconnect(deviceId: string): Promise<void>
  /** 发送数据 */
  write(deviceId: string, data: Uint8Array): Promise<void>
  /** 监听数据 */
  onData(deviceId: string, callback: (data: Uint8Array) => void): () => void
}

// ... 其他模块接口按需定义
```

---

### Decision 2：注入机制 — 壳端注入，Web 端消费

#### Electron 壳端注入

通过 `contextBridge` + `preload.ts` 将 Bridge 实现注入 `window.__BANYUAN_BRIDGE__`：

```typescript
// apps/banyan/electron/preload.ts
import { contextBridge, ipcRenderer } from 'electron'

const electronBridge: IBanyuanBridge = {
  version: '1.0.0',
  platform: 'electron',
  isAvailable: (module) => AVAILABLE_MODULES.has(module),
  getAvailableModules: () => [...AVAILABLE_MODULES],

  fs: {
    async readFile(path) {
      return ipcRenderer.invoke('bridge:fs:readFile', path)
    },
    async writeFile(path, data) {
      return ipcRenderer.invoke('bridge:fs:writeFile', path, data)
    },
    // ...
  },

  printer: {
    async getPrinters() {
      return ipcRenderer.invoke('bridge:printer:getPrinters')
    },
    async print(html, options) {
      return ipcRenderer.invoke('bridge:printer:print', html, options)
    },
    // ...
  },
  // ...
}

contextBridge.exposeInMainWorld('__BANYUAN_BRIDGE__', electronBridge)
```

Electron 主进程中注册对应的 IPC handler：

```typescript
// apps/banyan/electron/main/bridge-handlers.ts
import { ipcMain, dialog, BrowserWindow } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'

ipcMain.handle('bridge:fs:readFile', async (_, path: string) => {
  return readFile(path)
})

ipcMain.handle('bridge:printer:getPrinters', async () => {
  const win = BrowserWindow.getFocusedWindow()
  return win?.webContents.getPrintersAsync() ?? []
})

// ...
```

#### Capacitor 壳端注入

Capacitor 通过 Plugin 机制自动将原生实现注入 `window.Capacitor.Plugins`。Bridge 适配层做一层映射：

```typescript
// packages/bridge-capacitor/src/index.ts
import { Camera, Filesystem, BluetoothLe } from '@capacitor/...'

const capacitorBridge: IBanyuanBridge = {
  version: '1.0.0',
  platform: Capacitor.getPlatform() === 'ios' ? 'capacitor-ios' : 'capacitor-android',
  
  camera: {
    async takePhoto(options) {
      const photo = await Camera.getPhoto({ resultType: CameraResultType.Base64, ...options })
      return { base64: photo.base64String!, format: photo.format }
    },
    // ...
  },
  // ...
}

window.__BANYUAN_BRIDGE__ = capacitorBridge
```

#### Web 端消费

```typescript
// packages/bridge/src/index.ts

/** 获取 Bridge 实例（各平台通过不同方式注入到 window 上） */
export function getBridge(): IBanyuanBridge {
  const bridge = (window as any).__BANYUAN_BRIDGE__
  if (!bridge) {
    // 纯 Web 环境，返回降级实现
    return webFallbackBridge
  }
  return bridge
}

/** 降级实现：纯 Web 环境下，部分能力用 Web API 替代，其余抛出 NotSupported */
const webFallbackBridge: IBanyuanBridge = {
  version: '1.0.0',
  platform: 'web',
  isAvailable: (module) => WEB_AVAILABLE_MODULES.has(module),
  getAvailableModules: () => [...WEB_AVAILABLE_MODULES],

  fs: {
    async pickFile(options) {
      // 使用 <input type="file"> 模拟
      return showFileInputPicker(options)
    },
    async readFile() { throw new BridgeNotSupportedError('fs.readFile', 'web') },
    // ...
  },
  notification: {
    async show(options) {
      // 使用 Web Notification API
      return new Notification(options.title, { body: options.body })
    },
  },
  // ...
}
```

---

### Decision 3：与 FlowRunner 集成 — Bridge 节点

用户在 Banyan 流程编辑器中可以通过 Flow 节点调用原生能力。在 `@banyuan/flow/client` 中新增 `bridge` 类型节点：

```typescript
// Flow 节点定义
{
  id: 'node_1',
  type: 'bridge',
  config: {
    module: 'camera',
    method: 'takePhoto',
    params: { quality: 80 },
    outputVariable: 'photo',  // 结果写入 flow 变量
  }
}
```

FlowRunner 客户端预设在执行 `bridge` 节点时，通过 `getBridge()` 获取 Bridge 实例并调用对应方法：

```typescript
// packages/flow/src/presets/client.ts — bridge 节点执行器

registerNodeExecutor('bridge', async (node, context) => {
  const bridge = getBridge()
  const { module, method, params, outputVariable } = node.config

  // 检查能力是否可用
  if (!bridge.isAvailable(module)) {
    throw new FlowError(`原生能力 ${module} 在当前平台不可用`)
  }

  // 动态调用 Bridge 方法
  const moduleImpl = bridge[module]
  if (!moduleImpl || typeof moduleImpl[method] !== 'function') {
    throw new FlowError(`Bridge.${module}.${method} 不存在`)
  }

  const result = await moduleImpl[method](params)

  // 写入 flow 变量
  if (outputVariable) {
    context.setVariable('local', outputVariable, result)
  }

  return result
})
```

这样用户在流程编辑器中拖一个「拍照」节点，运行时自动通过 Bridge 调用摄像头，结果存入流程变量，后续节点可以用这个变量（如上传到服务器、显示在页面上）。

---

### Decision 4：能力协商与版本兼容

壳和 Web 层各有独立的版本演进节奏。当壳版本低于 Web 层要求时，需要优雅降级：

```typescript
interface BridgeCapabilityNegotiation {
  /** 壳端声明支持的 Bridge 协议版本 */
  bridgeVersion: string
  /** 壳端声明支持的能力模块及其版本 */
  modules: Record<BridgeModule, string>  // { camera: '1.0', fs: '1.2', ... }
}

// Web 层在初始化时做能力协商
const bridge = getBridge()
const available = bridge.getAvailableModules()

// UI 层根据能力动态渲染
if (!bridge.isAvailable('camera')) {
  // 隐藏「拍照」按钮，或显示「请更新客户端以使用此功能」
}
```

版本策略：
- Bridge 接口使用语义化版本（semver）
- 新增方法 = minor 版本（向后兼容）
- 已有方法签名变更 = major 版本（需壳端同步更新）
- 壳端低版本时，Web 层调用新方法会得到 `BridgeVersionError`，UI 层展示升级提示

---

### Decision 5：安全模型

Bridge 不是无限制的系统访问通道，而是受控的能力集合：

**1. 能力白名单。** 壳端只注入应用声明需要的能力。应用在 `appJSON.permissions` 中声明所需能力：

```json
{
  "permissions": ["fs.read", "fs.write", "printer", "camera"]
}
```

壳端根据 permissions 字段决定暴露哪些 Bridge 模块。未声明的能力即使壳端支持也不注入。

**2. 路径沙箱。** `fs` 模块的路径访问限制在应用专属目录内，不允许访问系统目录或其他应用的数据。

**3. 敏感操作确认。** 部分敏感操作（如静默打印、蓝牙连接、文件删除）可配置为需要用户二次确认。

---

## 包结构规划

```
packages/
├── bridge/                        # 契约层（纯接口 + 获取逻辑 + Web 降级）
│   ├── src/
│   │   ├── types.ts               # IBanyuanBridge 及所有子接口
│   │   ├── index.ts               # getBridge() + 平台检测
│   │   ├── web-fallback.ts        # 纯 Web 环境的降级实现
│   │   └── errors.ts              # BridgeNotSupportedError 等
│   └── package.json               # 零依赖，纯 TypeScript
│
├── bridge-electron/               # Electron 平台适配（preload + IPC handlers）
│   ├── src/
│   │   ├── preload.ts             # contextBridge 注入
│   │   └── handlers/              # 各模块的 IPC handler 实现
│   └── package.json               # peerDep: electron
│
└── bridge-capacitor/              # Capacitor 平台适配
    ├── src/
    │   └── index.ts               # Capacitor Plugin → IBanyuanBridge 映射
    └── package.json               # peerDep: @capacitor/core
```

依赖方向：

```
@banyuan/bridge (纯接口，零依赖)
    ▲
    │ import type
    │
@banyuan/flow/client (bridge 节点执行器依赖接口)
@banyuan/banvasgl (可选：画布事件触发 bridge 调用)
    
@banyuan/bridge-electron (实现接口，在 Electron 壳内使用)
@banyuan/bridge-capacitor (实现接口，在 Capacitor 壳内使用)
```

---

## 与现有架构的关系

| 现有模块 | 与 Bridge 的关系 |
|---------|----------------|
| ADR-019（跨平台渲染/执行） | 解决「画什么 + 跑什么」，Bridge 解决「调什么原生能力」，互补 |
| @banyuan/flow/client | 新增 `bridge` 节点类型，FlowRunner 通过 Bridge 执行原生调用 |
| @banyuan/banvasgl | View.events 流程中可通过 bridge 节点触发原生能力 |
| apps/banyan/electron | 当前 `nodeIntegration: false` + `contextIsolation: true`，正好是 Bridge 注入的标准模式 |
| deploy-agent scaffold | 构建产物中需注入 Bridge 的平台适配代码 |
| appJSON.permissions | 新增字段，声明应用所需原生能力 |

---

## 备选方案与否决理由

### 备选 1：直接使用 Capacitor 作为全平台 Bridge

让 Electron 壳也通过 Capacitor（Capacitor 有 Electron 社区插件）统一 API。

否决理由：Capacitor Electron 插件生态不成熟，且 Electron 的 IPC + Node.js 能力远超 Capacitor 的抽象。强制统一会导致 Electron 端能力退化。更合理的做法是自定义统一接口、各端独立实现。

### 备选 2：不做 Bridge 层，直接在各平台壳内硬编码原生调用

各平台壳独立实现自己的 JS 注入，没有统一接口。

否决理由：Web 业务代码需要 `if (platform === 'electron') {...} else if (platform === 'ios') {...}` 的条件分支，耦合度极高。新增一个平台就要修改所有业务代码。Bridge 契约层的核心价值就是解耦业务代码和平台实现。

### 备选 3：所有原生能力都走 HTTP API（后端代理）

Web 层通过 HTTP 请求后端，后端调用系统命令执行原生操作。

否决理由：延迟不可接受（拍照/蓝牙等交互型能力需要实时响应），且后端运行在容器内也无法直接访问宿主机硬件。原生能力必须在壳进程内解决。

---

## 实施计划

**当前（MVP）**：不实施。应用以纯 Web 能力运行，Electron 壳仅作为 WebView 容器。

**阶段 1（MVP 后 2 周）— 契约定义**：
- 创建 `@banyuan/bridge` 包，定义核心接口（fs/printer/dialog）
- 实现 `getBridge()` + Web 降级
- 定义 `appJSON.permissions` 字段

**阶段 2（2 周）— Electron 适配**：
- 实现 `@banyuan/bridge-electron`（preload + IPC handlers）
- 优先实现 fs/printer/dialog（眼镜店场景的核心需求）
- Banyan Electron 壳集成 Bridge 注入

**阶段 3（2 周）— Flow 集成**：
- 在 `@banyuan/flow/client` 中新增 `bridge` 节点执行器
- 流程编辑器 UI 中增加 Bridge 节点物料（拍照/打印/读文件等）
- 物料面板根据 `appJSON.permissions` 过滤可用 Bridge 节点

**阶段 4（后续）— 移动端**：
- 创建 `@banyuan/bridge-capacitor`
- 接入 Capacitor Camera/Filesystem/BluetoothLe 等插件
- deploy-agent 构建流程中增加 Capacitor 壳构建步骤

---

## 后果

- Web 业务代码通过统一的 `Bridge.xxx.yyy()` 接口调用原生能力，完全不感知底层平台差异
- 新增平台适配是增量式的——实现对应的 Adapter 包即可，不改动业务代码
- 用户在流程编辑器中可以直接拖拽 Bridge 节点使用原生能力，无需写代码
- 安全模型通过 permissions 声明 + 壳端白名单控制，避免过度暴露系统能力
- Bridge 接口版本化，壳和 Web 层可独立演进，通过能力协商优雅降级
