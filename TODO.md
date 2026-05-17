# Banyuan TODO

## 编辑器重设计（banyan + lunlunglass 共同适用）

### 背景

AI 生码采纳率 90%+ 的现状下，用户角色已从"生产者"转变为"验收者 + 微调者"。
两个前端的属性面板本质上都在暴露 BanvasGL 的数据结构（面向引擎开发者），
而不是提供用户真正需要的微调能力（面向终端用户）。详见 ADR-009。

业界收敛点（Lovable / Figma Make）：**对话生成（粗粒度）+ 可视化微调（细粒度）+ 一键部署**。
banyan 的交互模式与业界收敛点一致，但底层路径完全不同：

**业界的天花板是浏览器**。Lovable / Bolt 生成的是 HTML/CSS/React，产物受限于 Web 渲染模型，无法原生运行在 iOS、Android、嵌入式屏、工业 HMI 等非 Web 平台。

**banyan 的差异化在于自掌控渲染管线**。AI 生成的产物是平台无关的 BanvasGL Scene JSON，通过新增的 Canvas 适配层编译/渲染到各目标平台（Web / 桌面 / iOS / Android / 小程序 / 嵌入式）。适配层不是"套壳"，而是各平台独立实现同一套渲染接口——类似 Flutter 自掌控渲染管线的思路，但以 AI 生成为核心驱动力。

这个方向目前无强竞争对手：Lovable 不会做（目标用户是搭网站的人），Flutter 不会做（没有 AI 生成层），Figma Make 不会做（产物仍是 Web）。

> **注**：lunlunglass 是热敏打印模板编辑器，本身没有 AI 对话、流程图编辑器、事件绑定、数据 Tab，
> 反而更接近 ADR-009 描述的理想形态。它与 banyan 共享的问题只有：
> 属性面板视觉控制能力不足、旋转弧度字段多余、样式 Tab 只有 overflow。

---

### 待移除 / 降优先级的功能

#### banyan frontend 专属

- [ ] **流程图编辑器**（FlowCanvas + FlowNodePalette）
  - 认知门槛高，需要用户理解节点/连线/端口概念
  - AI 可以直接生成事件逻辑，用户不需要手动拖节点连线
  - 建议：移除可视化编排，事件逻辑完全交由 AI 对话生成

- [ ] **事件 Tab 的手动绑定交互**（onClick / onDoubleClick / onMouseEnter 等手动添加）
  - 与流程图编辑器强耦合，使用场景同样被 AI 对话覆盖
  - 建议：事件绑定通过 AI 对话完成，或通过右键菜单快捷操作触发

- [ ] **数据 Tab 的字段定义表**（FieldSchemaMapEditor，手动定义字段名/类型/默认值）
  - 数据结构由 AI 根据需求自动设计，用户不需要手动维护
  - 建议：移除手动编辑，数据结构只读展示（供调试参考）

#### banyan + lunlunglass 共同

- [ ] **属性 Tab 的旋转弧度（rad）字段**
  - 用户微调时不会输入弧度值，度数（°）已足够
  - 建议：只保留度数，移除 rad 字段
  - 涉及文件：`banyan/PropertyPanel/PropertiesTab.tsx`、`lunlunglass/PropertyPanel/PropertiesTab.tsx`

---

### 待强化的功能

#### banyan + lunlunglass 共同

- [ ] **样式 Tab 重设计**
  - 现状：只有 overflow 一个属性，几乎没有实用价值
  - 目标：提供直觉化的视觉控制——颜色选择器、字体/字号选择、间距滑块、圆角控制、阴影等
  - 原则：控件形态要符合审美，不是属性键值对的罗列
  - 涉及文件：`banyan/PropertyPanel/StyleTab.tsx`、`lunlunglass/PropertyPanel/StyleTab.tsx`

- [ ] **画布直接操作强化**
  - 现状：变换（X/Y/W/H）只能在属性面板输入数字
  - 目标：画布上直接拖拽移动/缩放，数字输入框作为辅助精确控制
  - 补充：对齐辅助线、吸附网格、多选对齐操作

- [ ] **右键菜单（ContextMenu）丰富化**
  - 现状：banyan 菜单项较少；lunlunglass 已有 9 项（复制/粘贴/删除/锁定/显隐/组合/取消组合/置顶/置底），相对完整
  - 目标：补充高频操作——复制样式、粘贴样式、对齐（左对齐/右对齐/水平居中/垂直居中/等间距）
  - 注：lunlunglass 的右键菜单可作为 banyan 的参考基准

- [ ] **PageList 体验优化**
  - 现状：基础的页面/图层树，功能完整但交互粗糙
  - 目标：图层缩略图预览、拖拽排序、图层可见性快速切换（hover 时眼睛图标）

#### banyan 专属

- [ ] **AiBar 持续迭代**：核心交互入口，体验对标 Cursor / Claude

---

### 保持现状的功能

- **BuildTaskModal + 构建/打包**（banyan）：差异化能力，保持并强化
- **ComponentPalette 的应用/模板元信息区**（名称/描述/保存）：基础功能，保持
- **属性 Tab 的变换区**（X/Y/W/H/旋转）：高频微调，保留数字输入作为精确控制辅助
- **属性 Tab 的状态区**（可见/锁定）：保留，可迁移到图层树快捷操作
- **lunlunglass 的纸宽预设**（58mm/80mm/110mm）：领域专用功能，保持

---

## LunlunGlass 打印系统重构

> 详细架构决策见 [ADR-010](./docs/adr/010-lunlunglass-two-system-split.md)

### 背景

LunlunGlass 当前将模板设计和门店运营混在同一个应用中，职责耦合。根据角色分析（开发者 / 模板设计者 / 店员），决定拆分为两套完全独立的业务系统。

### 目标架构

```
lunlunglass/
├── shared/
│   └── printer/         @lunlunglass/printer 共享打印服务包
├── studio/              模板设计系统 —— 面向老板/运营，Web 套壳 Electron
└── pos/                 门店运营系统 —— 面向店员，Web 套壳 Electron
```

两套系统独立部署，不共用后端。POS 主动从 Studio 拉取已发布模板并本地存储快照，打印时不依赖 Studio 在线。

### 已决策事项

- **字段注册表**：配置文件形式，存于 POS 后端资源目录，随代码提交 git，变更有历史可追溯
- **模板快照版本**：只保留最新已发布版本供店员选择；打印记录存 `snapshotId` 而非 `templateId`，补打时精确复现
- **Studio 访问字段**：Studio 后端提供 `GET /fields` 代理接口，内部转发到 POS 的 `GET /fields`；POS 地址配置在 Studio 后端环境变量 `POS_API_URL` 中，接口命名不体现代理语义
- **打印机配置**：存于 Electron 本地配置文件（`~/.lunlunglass-studio/printer.json` / `~/.lunlunglass-pos/printer.json`），前端提供配置界面；支持 USB 和局域网，暂不支持云端
- **模板同步方向**：POS 主动拉取（而非 Studio 推送），POS 后端配置 `STUDIO_URL`（域名优先，IP 兜底）
- **Studio 打印服务**：Studio 也内置 `@lunlunglass/printer`，用于设计者打印样张验证实际效果

---

### 阶段一：基础架构搭建

- [ ] **重组 lunlunglass 目录结构**
  - 新建 `shared/printer/`，将现有 `PrintService` 中的 `ImageComposer`、`EscPosEncoder`、`PrinterTransport` 迁移进来，发布为 `@lunlunglass/printer`
  - 将现有 `lunlunglass/frontend` 中模板设计相关页面（`TemplateDetail`、`TemplateList`）迁移到 `studio/frontend`
  - 将现有 `lunlunglass/frontend` 中门店运营相关页面（`OrderPage`、`UserPage`、`List`）迁移到 `pos/frontend`
  - 将现有 `lunlunglass/backend` 中模板相关代码（`TemplateController`、`TemplateService`、`Template` model、`routes/templates.ts`）迁移到 `studio/backend`
  - 将现有 `lunlunglass/backend` 中业务运营相关代码（`OrderController/Service`、`UserController/Service`、`ProductController/Service`、`StatisticsController/Service` 及对应 model/routes）迁移到 `pos/backend`
  - 将 `backend/src/config/fields.ts` 迁移到 `pos/backend/src/config/fields.ts`（字段注册表属于 POS，无需修改内容）
  - 将 `backend/src/config/database.ts` 分别复制到 `studio/backend` 和 `pos/backend`，各自连接独立数据库
  - 将 `backend/src/services/printer/` 整体迁移到 `shared/printer/`，studio/backend 和 pos/backend 均改为依赖 `@lunlunglass/printer`
  - 删除原 `lunlunglass/backend` 和 `lunlunglass/frontend` 目录
  - 更新 pnpm workspace 配置，新增 `studio/frontend`、`studio/backend`、`pos/frontend`、`pos/backend`、`shared/printer` 五个 workspace 包

- [x] **字段注册表实现**（POS 后端）✅
  - 文件：`backend/src/config/fields.ts`（重组后迁移到 `pos/backend/src/config/fields.ts`）
  - 数据结构：`FieldDefinition { key, label, description, dataPath, type, example }`
  - 按分组组织：`FieldGroup { groupKey, groupLabel, fields[] }`，共 4 组 26 个字段
  - 导出工具函数：`getFieldRegistry()`（分组结构）/ `getFlatFields()`（扁平列表）/ `getFieldByKey(key)`
  - **dataPath 解析上下文**：打印时后端构建 `{ order: IOrder, user: IUser }` 上下文，`user` 通过 `order.userId` 关联查出；dataPath 从此上下文按路径取值
  - 字段分组：顾客信息（3）/ 验光参数（12，含左右眼各5项 + 双眼瞳距）/ 订单信息（7，含条码/二维码）/ 商品信息（4，取 items[0]）
  - 实现 `GET /fields` 接口，直接读配置文件返回（待实现，见阶段一）

- [ ] **Studio 字段代理接口**（Studio 后端）
  - 实现 `GET /fields`，内部转发到 `POS_API_URL/fields`
  - Studio 后端环境变量：`POS_API_URL=http(s)://...`

- [ ] **模板快照拉取机制**（POS 后端）
  - 实现 `GET /templates/published`（POS 调用 Studio 的此接口拉取已发布模板列表）
  - POS 后端定时或按需拉取，本地存储快照（MongoDB）
  - 快照内容：静态背景图（PNG Buffer）+ 动态字段列表（fieldKey + bounds + 样式）+ 版本号 + 时间戳

---

### 阶段二：Template Studio

- [ ] **动态字段组件**（BanvasGL 层）
  - 新增特殊 `TextView` 子类或扩展属性，携带 `fieldKey` 字段
  - 序列化时可区分普通文本和动态字段占位符，动态字段不参与 `exportImage()` 背景图导出
  - 在组件物料面板中增加"动态字段"分类

- [ ] **Studio 组件面板裁剪**
  - 移除：流程图、事件绑定、AI 对话
  - 改造：数据 Tab → 字段绑定 Tab（仅 TextView 显示，内容改为字段选择器，见"字段绑定 UI"任务）
  - 保留：图形组件、文本、图片
  - 画布尺寸锁定为热敏纸规格（58mm / 80mm）

- [ ] **字段绑定 UI**（复用数据 Tab）
  - **BanvasGL 层零改动**：`fieldKey` 存入 `view.data.fieldKey`，复用现有 `IFieldSchemaMap` 机制，约定 `fieldKey` 为保留字段名
  - 数据 Tab 显示条件：仅在选中 TextView 时显示，其他 View 类型不显示此 Tab
  - Tab 内容：固定单行 `fieldKey` 字段 + 分组下拉选择器（从 Studio 后端 `GET /fields` 拉取，按顾客信息 / 验光参数 / 订单信息 / 商品信息分组展示）
  - 与 banyan 数据 Tab 的差异：不可新增字段、不可删除字段、不可修改 key 名
  - 选中字段后 Canvas 上文本立即替换为该字段的 `example` 值作为预览占位
  - 提供"清除绑定"操作，清除后恢复显示设计时的原始文本值
  - 序列化结构：`{ "data": { "fieldKey": { "type": "string", "value": "customer_name" } } }`

- [ ] **模板发布流程**
  - 发布时：`exportImage()` 导出静态背景图 + 提取动态字段列表（fieldKey + bounds + 样式）
  - 生成快照记录，标记模板状态为"已发布"，供 POS 拉取
  - Studio 后端实现 `GET /templates/published` 接口

- [ ] **样张打印**
  - 发布前可点击"打印样张"，调用本地 `@lunlunglass/printer` 打印当前模板效果
  - 打印机配置入口：Studio 设置页面，读写 `~/.lunlunglass-studio/printer.json`

---

### 阶段三：Store POS

- [ ] **重新设计打印后端接口**（废弃现有 `PrintService` / `PrintFieldMapping` 设计）
  - `POST /print`：接收 `{ snapshotId, orderId }`，后端按 `orderId` 查订单，按字段注册表取值，调用 `@lunlunglass/printer` 合成打印
  - `GET /fields`：返回字段注册表配置文件内容
  - `GET /templates/snapshots`：返回本地已同步的模板快照列表（供店员选择）
  - `POST /templates/sync`：手动触发从 Studio 拉取最新已发布模板

- [ ] **店员打印入口**
  - 订单详情页 / 结账页增加"打印标签"按钮
  - 弹出模板选择器（展示已同步模板的缩略图和名称）
  - 选择后调用 `POST /print`，传入 `snapshotId` + `orderId`
  - 完全不感知模板内部结构

- [ ] **打印机配置入口**
  - POS 设置页面，读写 `~/.lunlunglass-pos/printer.json`
  - 支持选择连接方式（USB / 局域网）和设备地址

- [ ] **ImageComposer 重构**（迁移到 `@lunlunglass/printer`）
  - 输入：静态背景图 Buffer + 动态字段列表（含已解析的值）
  - 输出：合成后的打印位图
  - 支持字段类型：text / barcode / qrcode
