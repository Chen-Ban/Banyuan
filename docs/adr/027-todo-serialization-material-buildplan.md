# ADR-027 建设计划 — 统一序列化体系与物料系统

> 关联决策：[ADR-027](./027-unified-serialization-and-material-system.md)

---

## 依赖关系图

```
Step 1: AI Projection 转换器
    │
    ├──→ Step 2: XiangDi 接入 AI Projection（依赖 Step 1）
    │
    └──→ Step 3: 废弃旧 AISchema（依赖 Step 2 验证通过）

Step 4: 物料核心能力（serialize / instantiate）
    │         （与 Step 1-3 无直接依赖，可并行）
    │
    ├──→ Step 5: 物料存储服务（依赖 Step 4 类型定义）
    │
    ├──→ Step 6: 前端物料面板（依赖 Step 4 + Step 5）
    │
    ├──→ Step 7: AI 物料联动（依赖 Step 2 + Step 4 + Step 5）
    │
    └──→ Step 8: 内置物料迁移（依赖 Step 4 + Step 6 验证通过）
              └──→ 废弃 IComponentTemplate / viewCreateStrategies
```

---

## Step 1：AI Projection 转换器（P0）

**目标**：实现全量 JSON ↔ AI Projection 的无损双向转换

**产出位置**：`packages/xiangdi-agent/src/schema/projection.ts`（新文件）

**具体任务**：

1.1 定义 `IAIProjectionNode` 类型体系
  - 公共字段：type, id, transform, size, decoration?, events?, lifetimes?, data?, layoutParams?
  - 各 ViewType 专有字段（flexStyle, content, editable 等）
  - `$material` 特殊节点类型定义

1.2 实现 `toAIProjection(viewJSON: any): IAIProjectionNode`
  - 展平 $type/$value 包装
  - Matrix4 16元素数组 → { x, y, rotation?, scaleX?, scaleY? } 语义解构
  - Viewport Bounds → { width, height } 提取
  - constraintBounds 省略
  - events/lifetimes null 值过滤（只输出非 null 条目）
  - 默认值省略（visible:true, freezed:false, opacity:1 等不输出）
  - decoration undefined 时不输出
  - children 递归转换（去掉 $type/$value 包装）
  - content 按 ViewType 语义化输出

1.3 实现 `fromAIProjection(node: IAIProjectionNode): any`
  - { x, y, rotation?, scaleX?, scaleY? } → Matrix4 16元素数组重建
  - { width, height } → viewport Bounds 重建 + constraintBounds 补齐
  - 省略字段填充默认值
  - events/lifetimes 空条目补 null
  - children 递归转换（重新包装 $type/$value）
  - `$material` 节点处理（查模板 → instantiate → 展开为完整 JSON）

1.4 单元测试
  - 对每种 ViewType 构造全量 JSON → toAIProjection → fromAIProjection → 断言与原始 JSON 语义等价
  - 边界情况：空 children、深层嵌套、FlowSchema 含复杂节点图、非零 rotation/scale

**影响文件**：
- 新增：`packages/xiangdi-agent/src/schema/projection.ts`
- 新增：`packages/xiangdi-agent/src/schema/projection.types.ts`
- 新增：`packages/xiangdi-agent/tests/projection.test.ts`

---

## Step 2：XiangDi 接入 AI Projection（P0）

**目标**：XiangDi 服务链路从 AISchema 切换到 AI Projection

**依赖**：Step 1 完成

**具体任务**：

2.1 修改 BanvasHostAdapter（apps/xiangdi-server）
  - `getPages()` 返回值从 AIApp 改为 AI Projection 格式
  - 内部调用 `toAIProjection()` 替代 `banvasToAIApp()`

2.2 修改 pages 写回逻辑
  - 接收 AI Projection 格式 → 调用 `fromAIProjection()` → 写回全量 JSON
  - 替代原来的 `aiAppToBanvas()`

2.3 修改 LLM Prompt / System Message
  - 更新 ProjectSpec 中的 Schema 描述，从 AISchema 格式替换为 AI Projection 格式
  - 更新 Few-shot 示例

2.4 修改工具层
  - 涉及 pages 读写的工具（如 setPages/getPages）适配新格式
  - XiangDi 知识种子更新

2.5 端到端验证
  - 完整跑通"用户描述 → AI 生成 pages → 前端渲染"流程
  - 验证事件绑定、生命周期、装饰、数据模型都能正确生成

**影响文件**：
- 修改：`apps/xiangdi-server/src/` 相关适配文件
- 修改：`packages/xiangdi-agent/src/schema/converters.ts`（重写或删除）
- 修改：`packages/xiangdi-agent/src/knowledge/seeds/` 知识种子
- 修改：`apps/banyan/backend/src/services/AiService.ts`

---

## Step 3：废弃旧 AISchema（P0）

**目标**：清除遗留代码

**依赖**：Step 2 验证通过

**具体任务**：

3.1 删除旧文件
  - 删除 `packages/xiangdi-agent/src/schema/AISchema.ts`
  - 删除 `packages/xiangdi-agent/src/schema/converters.ts`（旧版）
  - 删除相关测试文件

3.2 清理引用
  - 移除所有 import AISchema / banvasToAIApp / aiAppToBanvas 的代码
  - 更新 `packages/xiangdi-agent/src/index.ts` 导出

3.3 更新文档
  - AGENTS.md 中 AISchema 相关描述更新
  - XiangDi README 更新

---

## Step 4：物料核心能力（P1）

**目标**：实现物料的序列化（生成）和反序列化（还原）

**与 Step 1-3 无直接依赖，可并行开发**

**产出位置**：`packages/banvasgl/src/actions/materialActions.ts`

**具体任务**：

4.1 类型定义
  - 新增 `packages/banvasgl/src/types/material/material.ts`
  - 定义 IMaterial, IMaterialMeta, IMaterialTemplate, IMaterialParameter, IMaterialAsset
  - 定义 IMaterialActions 接口（serialize / instantiate）
  - 在 `packages/banvasgl/src/types/hook/hook.ts` 中注册 IMaterialActions

4.2 实现 serialize（View → 物料模板）
  - 入参：viewId + 物料配置（name, description, parameterBindings）
  - 调用 view.toJSON() 获取完整子树 JSON
  - 递归遍历收集所有 id → 替换为 `{{id:N}}` 占位符
  - 建立 oldId → placeholder 映射表
  - 扫描 FlowSchema（events + lifetimes 递归）中的 viewId 引用 → 同步替换 → 记录 internalIdRefs
  - 提取资源 URL → 记录到 assets（此时暂不做 CDN 上传，只记录原始 URL）
  - 根据 parameterBindings 将对应路径值替换为 `{{param:paramId}}`
  - 根节点 transform 坐标归零
  - 组装 IMaterialTemplate 返回

4.3 实现 instantiate（物料模板 → View）
  - 入参：IMaterial + position + params?
  - 深拷贝 template.root
  - 生成 idCount 个新 UUID → 替换所有 `{{id:N}}`
  - 遍历 internalIdRefs → 在 FlowSchema 中替换为真实 ID
  - 遍历 parameters → 将 `{{param:paramId}}` 替换为传入值或 defaultValue
  - 替换 `{{asset:assetId}}` 为 assets[].url
  - 设置根节点位置
  - 调用 Serializer.revive() 恢复 View 实例树
  - scene.addChild(rootView)
  - 返回根 View ID

4.4 注册到 actions 体系
  - 在 `packages/banvasgl/src/actions/index.ts` 中导出 createMaterialActions
  - 在 useBanvas hook 中挂载 actions.material

4.5 单元测试
  - 构造含嵌套子视图 + 事件绑定 + 数据模型的 FlexView → serialize → instantiate → 验证结构等价
  - 验证 FlowSchema 中 viewId 引用正确映射
  - 验证参数填充正确
  - 边界：空 children 物料、深层嵌套物料、含多个参数绑定到同一节点

**影响文件**：
- 新增：`packages/banvasgl/src/types/material/material.ts`
- 新增：`packages/banvasgl/src/types/material/index.ts`
- 新增：`packages/banvasgl/src/actions/materialActions.ts`
- 修改：`packages/banvasgl/src/types/hook/hook.ts`（增加 IMaterialActions）
- 修改：`packages/banvasgl/src/types/index.ts`（导出物料类型）
- 修改：`packages/banvasgl/src/actions/index.ts`（导出 createMaterialActions）
- 修改：`packages/banvasgl/src/index.ts`（确保物料类型公共导出）

---

## Step 5：物料存储服务（P1）

**目标**：banyan 后端提供物料 CRUD + 版本管理 API

**依赖**：Step 4 类型定义完成

**具体任务**：

5.1 数据模型
  - 新增 `apps/banyan/backend/src/models/Material.ts`
  - Schema：meta(IMaterialMeta) + template(IMaterialTemplate) + status + scope + userId

5.2 Service 层
  - 新增 `apps/banyan/backend/src/services/MaterialService.ts`
  - 方法：create / getById / search / update / deprecate / uploadAsset

5.3 Controller + Routes
  - 新增 `apps/banyan/backend/src/controllers/materialController.ts`
  - 新增 `apps/banyan/backend/src/routes/material.ts`
  - API：POST /api/materials, GET /api/materials, GET /api/materials/:id, PUT /api/materials/:id, DELETE /api/materials/:id, POST /api/materials/:id/assets

5.4 资源上传
  - 物料中的图片等资源上传到 CDN / OSS
  - serialize 时记录的原始 URL → 上传 → 替换为 CDN URL

**影响文件**：
- 新增：`apps/banyan/backend/src/models/Material.ts`
- 新增：`apps/banyan/backend/src/services/MaterialService.ts`
- 新增：`apps/banyan/backend/src/controllers/materialController.ts`
- 新增：`apps/banyan/backend/src/routes/material.ts`
- 修改：`apps/banyan/backend/src/app.ts`（注册路由）

---

## Step 6：前端物料面板（P2）

**目标**：用户可通过 UI 保存/浏览/使用自定义物料

**依赖**：Step 4 + Step 5

**具体任务**：

6.1 "保存为物料"交互
  - 选中 View → 右键菜单 / 工具栏"保存为物料"
  - 弹窗：填写名称/描述/标签
  - 参数标记：可视化选择哪些属性暴露为参数
  - 调用 actions.material.serialize() → 调用后端 API 发布

6.2 物料面板 UI
  - 物料面板新增"自定义组件"分区
  - 列表展示：缩略图 + 名称 + 标签
  - 搜索/筛选：按 tag/category/keyword
  - 拖拽使用：拖拽到画布 → 弹窗填写参数 → instantiate

6.3 物料详情/编辑
  - 查看物料参数定义
  - 修改参数默认值
  - 版本管理（查看历史版本）

**影响文件**：
- 新增：`apps/banyan/frontend/src/components/MaterialPanel/`
- 新增：`apps/banyan/frontend/src/components/SaveMaterialDialog/`
- 修改：`apps/banyan/frontend/src/editor/` 相关面板组件
- 新增：`apps/banyan/frontend/src/api/material.ts`

---

## Step 7：AI 物料联动（P2）

**目标**：AI 可通过物料引用实现极致 token 压缩

**依赖**：Step 2 + Step 4 + Step 5

**具体任务**：

7.1 AI Projection 中 $material 节点处理
  - `fromAIProjection()` 遇到 `type: "$material"` 时：
    - 从物料服务获取模板
    - 调用 instantiate 逻辑展开为完整 JSON
  - `toAIProjection()` 暂不自动折叠为 $material（未来可加启发式折叠）

7.2 XiangDi 新增物料工具
  - `searchMaterials(query: string)`：语义搜索可用物料，返回 meta 列表
  - `getMaterialDetail(materialId: string)`：获取物料参数定义
  - 注册到 ToolRegistry

7.3 知识服务索引
  - 物料发布时触发：将 meta.name + description + parameters[].name 写入 knowledge-server
  - 建立物料知识表（按 BanvasGL 版本隔离）
  - AI 通过 searchMaterials → knowledge-server 混合检索 → 返回匹配物料

7.4 Prompt 优化
  - ProjectSpec 中注入"可用物料摘要"（高频物料的 id + name + 参数列表）
  - 引导 LLM 优先使用 $material 引用，无匹配时退回完整描述

**影响文件**：
- 修改：`packages/xiangdi-agent/src/schema/projection.ts`（$material 处理）
- 新增：`packages/xiangdi-agent/src/tools/materialTools.ts`
- 修改：`packages/xiangdi-agent/src/tools/index.ts`
- 修改：`apps/knowledge-server/src/routes/`（新增物料索引端点）
- 修改：XiangDi ProjectSpec 模板

---

## Step 8：内置物料迁移（P3）

**目标**：将当前 13 个内置物料从 `IComponentTemplate`（创建指令）迁移为 `IMaterial`（参数化快照），实现物料体系完全统一，废弃 `IComponentTemplate` 和 `viewCreateStrategies`

**依赖**：Step 4（物料核心能力）+ Step 6（前端面板验证通过）

**前置条件**：自定义物料（IMaterial）的完整创建链路已验证稳定——serialize / instantiate / 面板拖拽 / 参数填充均工作正常

**具体任务**：

8.1 为每个内置 ViewType 生成对应的 IMaterial 物料包
  - 对 13 个 DESIGN_MATERIALS 中的每一个：
    - 用 viewCreateStrategies 中的策略函数创建一个"标准实例"
    - 调用 actions.material.serialize() 生成 IMaterialTemplate
    - 标记合理的参数孔洞（如圆形的 radius、文本的 text、图片的 src 等）
  - 产出 13 个 IMaterial JSON 定义，存放于 `packages/banvasgl/src/data/builtinMaterials/` 目录
  - 每个物料是一个独立 JSON 文件（如 `line.json`, `circle.json`, `flex.json`）

8.2 重写 `designMaterials.ts`
  - 从导出 `IComponentDefinition[]` 改为导出基于 IMaterial 的定义
  - `IComponentDefinition.template` 类型从 `IComponentTemplate` 改为 `IMaterialTemplate`
  - 加载方式：import JSON → 包装为 IComponentDefinition

8.3 统一创建路径
  - 面板拖拽创建从 `actions.view.create(template, position)` 切换为 `actions.material.instantiate(material, position, params)`
  - `actions.view.create()` 标记为 @deprecated，内部实现改为包装调用 `material.instantiate()`
  - 确保所有调用方（banyan 前端 + lunlunglass studio）切换到新路径

8.4 废弃清理
  - 删除 `packages/banvasgl/src/actions/viewCreateStrategies.ts`
  - 删除 `IComponentTemplate` 接口定义
  - 删除 `IViewActions.create()` 方法（或保留为 deprecated 包装）
  - 删除 `viewCreatorStrategies` 相关的依赖注入逻辑（CreateViewActionsOptions 中的 strategies 参数）
  - 清理所有 `import { IComponentTemplate }` 引用

8.5 验证回归
  - 所有 13 个内置物料拖拽创建正常
  - 创建后的 View 与旧策略函数产出的 View 等价（属性/尺寸/样式一致）
  - lunlunglass studio 物料面板功能正常
  - AI 创建视图路径正常（AI 也统一走 $material 引用内置物料）

**影响文件**：
- 新增：`packages/banvasgl/src/data/builtinMaterials/` 目录（13 个 JSON）
- 重写：`packages/banvasgl/src/data/designMaterials.ts`
- 删除：`packages/banvasgl/src/actions/viewCreateStrategies.ts`
- 修改：`packages/banvasgl/src/actions/viewActions.ts`（废弃 create，移除 strategies 依赖）
- 修改：`packages/banvasgl/src/actions/index.ts`（移除 strategies 导出）
- 修改：`packages/banvasgl/src/types/hook/hook.ts`（删除 IComponentTemplate，修改 IComponentDefinition）
- 修改：`apps/banyan/frontend/src/editor/`（拖拽创建切换到 material.instantiate）
- 修改：`apps/banyan/frontend/src/hooks/design/useDesignBanvas.tsx`（如有 strategies 注入）
- 修改：`examples/lunlunglass/studio/`（物料面板适配）

**迁移策略**：

内置物料从"策略函数"到"IMaterial 快照"的转换可以通过脚本自动完成：

```ts
// 迁移脚本伪代码（一次性执行，产出 JSON）
for (const def of DESIGN_MATERIALS) {
  // 1. 用旧策略创建一个标准实例
  const strategy = defaultViewCreatorStrategies.get(def.template.viewType)
  const view = strategy(def.template.defaultProps, 0, 0)
  
  // 2. 序列化为物料模板
  const material = actions.material.serialize(view.id, {
    name: def.label,
    description: def.description,
    parameterBindings: inferParameters(def.template)  // 从 defaultProps 推导参数
  })
  
  // 3. 写入 JSON 文件
  writeFileSync(`src/data/builtinMaterials/${def.id.replace('builtin.', '')}.json`, JSON.stringify(material))
}
```

---

## 里程碑规划

| 里程碑 | 包含 Steps | 交付标准 | 预估周期 |
|--------|-----------|----------|----------|
| M1：AI 无损化 | Step 1 + 2 + 3 | AI 能生成/修改事件绑定和完整视图属性 | 2-3 周 |
| M2：物料基础能力 | Step 4 + 5 | 用户可手动保存/还原复合物料 | 2 周 |
| M3：物料生态 | Step 6 + 7 | 前端面板可用 + AI 可引用物料 | 2-3 周 |
| M4：体系统一 | Step 8 | 内置物料迁移完成，IComponentTemplate 废弃，创建路径统一 | 1-2 周 |

---

## 风险与缓解

| 风险 | 缓解策略 |
|------|----------|
| AI Projection 格式比旧 AISchema 信息量大，LLM token 成本上升 | 通过物料引用机制抵消；默认值省略策略可减少 50-60% token |
| LLM 对新格式的理解可能需要调优 | Step 2 中通过 Few-shot 示例和知识种子引导 |
| FlowSchema 中 viewId 引用映射复杂 | serialize 时完整扫描所有 FlowSchema 节点，建立引用图；单元测试覆盖 |
| 物料版本升级后旧引用不兼容 | 物料模板中内嵌 fallback（完整 JSON），引用解析失败时降级 |
| 内置物料迁移后创建结果与旧策略不一致 | 迁移时对每个物料做 snapshot 对比测试，确保创建产物等价 |
| viewCreateStrategies 废弃后外部直接依赖方受影响 | Step 8 前先确认所有调用方（banyan + lunlunglass）已切换，策略函数标记 @deprecated 过渡一个版本 |
