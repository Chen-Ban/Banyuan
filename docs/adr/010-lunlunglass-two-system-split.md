# ADR-010: LunlunGlass 拆分为两套独立业务系统

**状态**: 已采纳  
**日期**: 2026-05-16  
**决策者**: 陈班

## 背景

LunlunGlass 最初将模板设计和门店运营混在同一个应用中，导致职责耦合：打印按钮加在模板编辑器里是设计者视角，加在订单列表里才是店员视角，两者上下文完全不同。随着打印系统设计的深入，发现使用者角色存在明确分层，需要重新划定系统边界。

## 角色分析

**开发者**（一次性）：定义字段注册表，把后端数据字段翻译为人话标签（如 `order.customer.name` → "顾客姓名"），维护 POS 系统的业务数据结构。

**模板设计者**（偶尔，老板/运营）：在画布上设计打印模板的静态背景，拖拽动态字段占位符并绑定字段 key（从字段注册表里选人话标签，不需要理解后端字段路径），发布模板。同时可以连接本地打印机打印样张，验证实际效果。

**店员**（每天）：管理顾客、订单、商品，结账时选择已发布模板一键打印，完全不感知模板内部结构。

## 决策

将 LunlunGlass 拆分为两套完全独立的业务系统，独立部署，不共用后端：

```
lunlunglass/
├── shared/
│   └── printer/         ← 共享打印服务包（@lunlunglass/printer）
│       ├── ImageComposer.ts
│       ├── EscPosEncoder.ts
│       └── PrinterTransport.ts
├── studio/              ← 模板设计系统（Template Studio）
│   ├── frontend/        使用者：模板设计者（老板/运营）
│   └── backend/         数据：模板、发布记录；字段通过代理从 POS 获取
└── pos/                 ← 门店运营系统（Store POS）
    ├── frontend/        使用者：店员
    └── backend/         数据：顾客、订单、商品、字段注册表、模板快照
```

两套系统均以 **Web 套壳 Electron** 的形式交付，本地 Node.js 后端随 Electron 一起运行，支持 USB 和局域网打印机连接，暂不支持云端打印。

### Template Studio

基于 banyan 低代码平台能力的业务裁剪版，不是 banyan 本身。裁剪内容：移除流程图、事件绑定、数据 Tab 等复杂功能；画布尺寸锁定为热敏纸规格（58mm/80mm）；增加业务专属组件——动态字段占位符（特殊 TextView，带 `fieldKey` 属性）。

Studio 也内置打印服务（来自 `@lunlunglass/printer`），用于设计者打印样张验证实际效果，减少模板发布后才发现问题的协同成本。

### Store POS

纯粹的门店运营系统，完全不包含画布编辑器。店员只看到模板缩略图和名称，打印时后端完成动态渲染。POS 同样内置打印服务（来自 `@lunlunglass/printer`），用于生产打印。

### 两系统的连接方式

采用 **POS 主动拉取**模式（方案 C）：POS 在店员打开模板选择器时，主动调用 Studio 的接口拉取已发布模板列表和快照。

选择此方案的原因：POS 是消费者，消费者主动拉取比生产者主动推送更自然；一个门店可能有多台 POS 收银台，若由 Studio 推送则需要维护所有 POS 的地址列表，复杂度高；POS 只需要知道一个 Studio 地址即可。

POS 后端配置项：
```
STUDIO_URL=https://studio.lunlunglass.com   # 生产环境用域名
STUDIO_URL=http://192.168.1.100:3000        # 局域网部署用 IP 兜底
```

POS 拉取的两类数据：
- `GET {STUDIO_URL}/fields` → 字段注册表（设计者绑定字段时用）
- `GET {STUDIO_URL}/templates/published` → 已发布模板列表（店员选模板时用）

### 字段注册表归属与维护方式

字段注册表属于 **POS 后端**，以**配置文件**形式维护（TypeScript/JSON，随代码提交到 git）。

选择配置文件而非数据库的原因：眼镜店业务字段结构稳定，不需要频繁变动；字段路径与代码强绑定，数据库 schema 变更时字段路径也要跟着改，这类改动本应走代码发布流程；配置文件变更有 git 历史可追溯。

Studio 前端需要字段列表时，调用 **Studio 后端的代理接口**（如 `GET /fields`），Studio 后端内部转发到 POS 的 `GET /fields`。接口命名不体现"代理"语义，Studio 前端完全不感知这是一个代理。POS 的服务地址配置在 Studio 后端环境变量中（`POS_API_URL`）。

### 模板快照版本管理

每次发布生成一个新的快照记录（带版本号和时间戳），**只保留最新已发布版本**供店员选择。打印记录里存储 `snapshotId`（而非 `templateId`），补打时直接使用原始快照，不受后续模板修改影响。版本管理复杂度完全在后端，店员不感知。

### 打印机连接配置

打印机配置存储在 **Electron 本地配置文件**中（如 `~/.lunlunglass-studio/printer.json` 和 `~/.lunlunglass-pos/printer.json`），各自独立，互不干扰。前端提供配置界面，用户可选择连接方式（USB / 局域网）和设备地址，无需重启服务。

### 静态内容与动态内容的边界

**静态内容**（模板设计时确定）：图形、装饰线条、固定文字标签（"姓名："、"度数："等 label）、Logo。这些内容通过 `exportImage()` 导出为背景图 PNG。

**动态内容**（每张单子不同）：顾客姓名、度数数值、订单号、日期等。在画布里表现为绑定了 `fieldKey` 的 TextView，序列化时单独提取，不参与背景图导出。每个动态字段携带：`fieldKey`（字段契约名）+ `bounds`（像素坐标和尺寸）+ 样式信息。

### 字段绑定机制

**核心原则**：任何 TextView 都可以动态渲染。没有设置 `fieldKey` 则打印设计时的文本值（静态）；设置了 `fieldKey` 则打印时替换为业务数据（动态）。不新增组件类型，不改 BanvasGL 组件体系。

**存储方式**：`fieldKey` 存储在 `view.data` 的保留字段中，复用 BanvasGL 现有的 `IFieldSchemaMap` 机制：

```json
{
  "type": "TextView",
  "content": "张三",
  "data": {
    "fieldKey": {
      "type": "string",
      "value": "customer_name"
    }
  }
}
```

`fieldKey` 是约定的保留字段名，BanvasGL 层零改动，`view.data` 本来就支持任意 key-value。

**UI 入口**：复用 banyan 的数据 Tab，在 Studio 中改造为字段绑定 Tab：

- 只在选中 TextView 时显示，其他 View 类型不显示此 Tab
- Tab 内容固定为单行 `fieldKey` 字段，value 为下拉选择器（按分组展示字段注册表）
- 不可新增字段、不可删除字段、不可修改 key 名（与 banyan 数据 Tab 的自由编辑不同）
- 选中字段后，Canvas 上的文本立即替换为该字段的 `example` 值作为预览占位
- 提供"清除绑定"操作，清除后恢复显示设计时的文本值

**打印时的解析逻辑**：

```typescript
const fieldKey = view.data?.fieldKey?.value
if (fieldKey) {
  // 动态：从 { order, user } 上下文按 dataPath 取值
  const fieldDef = getFieldByKey(fieldKey)
  const value = getNestedValue(context, fieldDef.dataPath)
  renderText(value, view.bounds, view.style)
} else {
  // 静态：用设计时的文本值
  renderText(view.content, view.bounds, view.style)
}
```

**影响范围**：

- BanvasGL 层：零改动
- Studio 前端：数据 Tab UI 改造（自由编辑表格 → 单行字段选择器，显示条件限定为 TextView）
- 打印后端：序列化解析时增加 `view.data.fieldKey` 检查

## 完整连接关系

```
Studio（老板电脑，Electron）              POS（收银台，Electron）
┌──────────────────────────┐             ┌──────────────────────────┐
│ studio/frontend          │             │ pos/frontend             │
│   画布编辑、字段绑定        │             │   订单管理、打印入口        │
├──────────────────────────┤             ├──────────────────────────┤
│ studio/backend           │◄─拉取字段──  │ pos/backend              │
│   模板存储、字段代理        │◄─拉取模板──  │   业务数据、字段注册表       │
│   GET /fields（代理）      │             │   模板快照存储             │
│   GET /templates/published│             │   GET /fields（配置文件）  │
├──────────────────────────┤             ├──────────────────────────┤
│ @lunlunglass/printer     │             │ @lunlunglass/printer     │
│   样张验证打印             │             │   生产打印                │
└────────────┬─────────────┘             └────────────┬─────────────┘
             │                                        │
        设计者桌边打印机                            收银台打印机
       （USB / 局域网）                            （USB / 局域网）
```

## 与 banyan 的关系

```
banyan（低代码平台，通用）
  → 完整能力：画布编辑、AI 对话生码、组件系统、构建发布

lunlunglass/studio（业务裁剪版）
  → banyan 能力子集 + 眼镜店业务适配
  → 不是 banyan，是 banyan 能力的消费者

lunlunglass/pos（门店运营）
  → 与 banyan 无关，纯业务系统
```

## 考虑过的方案

**方案 A：lunlunglass 内部按路由/权限隔离**（单前端工程，`/studio` 和 `/pos` 两个入口）。问题：共用后端导致数据库职责混乱，模板数据和业务数据耦合；权限隔离在前端做不够彻底。

**方案 B：Studio 就是 banyan 本身**（lunlunglass 只保留 POS）。问题：banyan 是通用低代码平台，不应该内嵌眼镜店业务字段；设计者需要登录 banyan 才能设计模板，系统边界不清晰。

**方案 C（采纳）：两套完全独立的业务系统**。代价是维护两套前后端工程，但换来的是职责清晰、独立部署、互不影响。

**模板同步方案 A（Studio 推送）**：Studio 发布时主动推送快照到所有 POS。问题：一个门店多台 POS 时需要维护地址列表，复杂度高。

**模板同步方案 B（运行时 API 调用）**：POS 打印时实时调用 Studio 接口。问题：Studio 宕机会导致 POS 无法打印，运行时强依赖。

**模板同步方案 C（采纳，POS 主动拉取 + 本地快照）**：POS 主动拉取并本地存储快照，打印时不依赖 Studio 在线。

## 后果

- 店员日常使用的 POS 系统极简，不感知任何模板设计复杂度
- 模板设计系统可以独立迭代，不影响门店运营
- Studio 宕机不影响 POS 打印（模板快照已本地存储）
- Studio 内置打印服务，设计者可打印样张验证效果，减少发布后才发现问题的协同成本
- 打印服务逻辑只维护一份（`@lunlunglass/printer`），两个系统同步受益
- 现有 `lunlunglass/backend` 和 `lunlunglass/frontend` 需要重组目录结构
- 现有后端打印接口设计（`PrintService`、`PrintFieldMapping` 等）需要在新架构下重新设计
