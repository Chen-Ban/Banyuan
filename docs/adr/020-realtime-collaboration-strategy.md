# ADR-020: 多人实时协作策略——CRDT（Yjs）方向与引入时机

> 状态：已接受
> 日期：2025-05-25
> 决策者：chenxin176

## 背景

Banyan 是一个 AI 驱动的低代码设计平台，核心产出是 UI JSON（pages）和 Flow JSON（schema）。随着产品走向团队使用场景，多人同时编辑同一个页面的需求是可预见的。

协作能力涉及算法选型、架构改造、基础设施建设，决策一旦做出就很难更换，因此提前明确方向，避免走弯路。

## 问题

1. 主流协作算法各有什么取舍？适合 Banyan 的是哪种？
2. Banyan 当前的架构（TransactionManager + SerializedPageJSON + actions 层）如何与协作层对接？
3. 引入时机是什么？引入收益如何量化？

---

## 协作算法调研

### OT（Operational Transformation，操作变换）

Google Docs 的选择。每个操作到达时，对并发操作做"变换"以消解冲突。

适合：文本编辑（插入/删除位置的偏移计算直觉）。不适合：复杂的树形结构（视图树的增删移动组合）——每种操作类型都需要手写变换规则，边界 case 极多，维护成本随操作类型数量指数级增长。

### CRDT（Conflict-free Replicated Data Type，无冲突复制数据类型）

Figma、Linear 的选择。数据结构本身被设计成"任意顺序合并结果一致"，不需要中心协调变换。代表实现：**Yjs**（生态最完善，文档编辑领域标准库）和 Automerge。

适合：树形结构的并发编辑、离线编辑、P2P 场景。主要成本：内存占用略高（需要保留删除墓碑以支持合并），部分极端并发语义不如 OT 直觉（但对设计工具来说可接受）。

### 事件溯源 + 权威服务器

所有操作发给服务器定序后广播，客户端按服务器顺序重放。实现最简单，但强依赖服务器在线，网络抖动直接影响操作响应；且无法支持离线编辑。

---

## 决策

**选定 CRDT（Yjs）作为协作算法方向。**

理由：

**1. 数据模型天然契合。** Banyan 的 UI JSON 是树形结构——页面包含视图节点，视图节点有属性和子节点。Yjs 的 `Y.Map`（键值对）+ `Y.Array`（有序列表）+ `Y.Text`（文本）可以直接映射这棵树，不需要为每种操作手写 OT 变换规则。

**2. 离线编辑是内置能力。** Banyan 面向的使用场景包括桌面客户端（Electron），用户断网时应当能继续编辑，重新连接后自动合并。CRDT 的离线编辑是协议层保证的，不需要额外工程。

**3. 生态成熟。** Yjs 被 Notion、Outline、Tiptap、BlockSuite（飞书文档同款方案）等大量项目验证，拥有完整的 Provider 生态（WebSocket、WebRTC、IndexedDB 持久化）。

**4. 与 actions 层对接路径清晰。** 见下方架构节。

---

## 架构：如何与 BanvasGL 结合

Banyan 当前已有的基础：

- **TransactionManager**：事务化操作，支持撤销/重做
- **SerializedPageJSON**：Scene 的完整序列化/反序列化
- **actions 层**（`IBanvasActions`）：所有写操作的唯一入口，白名单式 API

协作层需要新增的内容：

```
packages/
└── banvas-collab/              ← 新包，平台无关的协作适配层
    ├── YjsAdapter.ts           ← BanvasGL Scene ↔ Y.Doc 双向同步
    ├── AwarenessAdapter.ts     ← 光标 / 选区的实时感知（非持久化数据）
    └── ProviderFactory.ts      ← WebSocket / WebRTC / IndexedDB Provider 工厂
```

**数据流：**

```
用户操作
  │
  ▼
actions.view.setProperty(...)     ← 现有操作入口，不变
  │
  ├─▶ 本地立即应用（乐观更新）      ← 现有逻辑，不变
  │
  └─▶ YjsAdapter.applyToDoc()     ← 新增：将操作同步到 Y.Doc
        │
        ▼
     Yjs Provider（WebSocket）
        │
        ▼
     其他客户端的 Y.Doc
        │
        ▼
     YjsAdapter.onDocChange()     ← 新增：监听 Y.Doc 变更
        │
        ▼
     actions.view.xxx()           ← 通过现有 actions 层重放到本地 Scene
```

**Awareness（实时感知）** 独立于主文档同步：

光标位置、当前选中视图、用户头像/颜色等实时状态不需要持久化，Yjs 的 Awareness 协议单独处理，延迟更低，不走主文档的 CRDT 通道。

```
本地鼠标/选中变化
  └─▶ awareness.setLocalStateField(...)
        └─▶ 其他客户端的 awareness.on('change', ...)
              └─▶ 渲染其他用户的光标/选区覆盖层（React 覆盖层，不进 Scene）
```

**关键约束：**

- YjsAdapter 只通过 `actions` 层操作 Scene，不绕过 TransactionManager
- 协作触发的操作需标记来源（`{ source: 'remote' }`），避免触发二次同步
- 撤销/重做需升级为 Yjs 的 `UndoManager`，以支持协作场景下的 per-user 撤销

---

## 引入时机建议

### 不建议现在引入的理由

**前提条件未就绪：**

- Action 层的操作描述尚未标准化为可序列化的 Command 对象。协作需要每个操作能被精确描述、反序列化、远端重放，这需要操作模型先打磨稳定。
- 撤销/重做的语义在协作场景下会变复杂（我的撤销不能撤掉别人的操作），需要专门处理。
- 服务端尚未有 WebSocket 长连接基础设施。

**产品阶段未到：**

在核心单人编辑体验稳定之前投入协作的工程成本（保守估计 2-3 个人月的专注开发），ROI 不高。Figma 也是先完善了单人编辑再引入协作。

### 建议的引入节点

**第一阶段（现在可以做的铺垫）：**

把 `IBanvasActions` 的操作描述升级为可序列化的 Command 对象。这既服务于协作，也让操作历史、录制/回放、AI 操作追踪等功能有了基础。这个投入不会浪费。

```typescript
// 当前
actions.view.setProperty('x', 100)

// 目标：Command 对象可序列化、可重放
const cmd: SetPropertyCommand = {
    type: 'view.setProperty',
    viewId: 'xxx',
    prop: 'x',
    value: 100,
    prevValue: 80,    // 用于撤销
    timestamp: ...,
    userId: ...,
}
```

**第二阶段（引入时机）：**

满足以下条件后正式引入协作：
- 核心编辑功能稳定，无重大 bug 积压
- 有 2 个以上团队用户明确表达了协作需求
- Command 对象序列化已落地
- 服务端具备 WebSocket 基础设施（或接入第三方 Yjs 托管服务如 Hocuspocus）

预计在产品找到稳定用户群、核心功能打磨完善之后，即可启动。工程实现的核心工作量集中在 YjsAdapter 的双向同步逻辑和撤销语义升级。

---

## 收益分析

| 维度 | 收益 |
|------|------|
| **用户体验** | 团队成员可同时编辑同一页面，消除"最后保存者覆盖"问题 |
| **离线能力** | 断网继续编辑，重连自动合并，桌面客户端体验大幅提升 |
| **AI 协作** | AI Agent（XiangDi）的操作可与人类操作在同一 CRDT 文档中并发，无需加锁 |
| **历史记录** | Yjs 天然记录操作序列，操作历史、版本对比可复用此基础设施 |
| **竞争力** | 实时协作是设计工具的标配能力（Figma、MasterGo 均已具备），缺失会成为团队采购的阻碍 |

---

## 后果

- 协作方向锁定为 CRDT（Yjs），不走 OT 路线，不走纯服务器定序路线
- 现阶段不开始开发，但 Action 层的 Command 序列化是当前值得推进的铺垫工作
- 引入时新增 `banvas-collab` 包，不修改 banvasgl 核心和 banvas-design 的现有代码
- 协作触发的操作必须通过 actions 层，保持 TransactionManager 为唯一写入通道的约束
- AI Agent（XiangDi）的操作天然可以接入同一协作通道，AI 与人类协同编辑是长期方向
