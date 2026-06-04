# ADR-039：会话模型作为唯一权威状态机 —— SSE 是投影，事务与写回是阶段产物

**状态**：已采纳（原则、统一单分支 graph、状态机定义、SSE 投影、存储分层、打断即新对话模型、意图驱动上下文组装、summarize/extractMemory 合并、中断归因、chat 边界正交化、物理存储重构、事务概念退役均已确立，剩余为实施落地项）
**决策日期**：2026-06-16（2026-06-17 修订：基于"执行态/暂存态/持久态"三层重构对话归属模型，废弃 paused 正交态与 resume 恢复机制；2026-06-18 修订：chat 与 task 统一为单一 graph 单分支，chat 退化为 task 的子路径，由 intent 节点决定动不动画布，废弃独立的 chatGraph 4-phase 状态机；2026-06-19 修订：① chat 边界正交化——把 chat 的硬边界收窄为唯一两条「不改画布（无副作用）+ 以应用为默认上下文但不封顶的智能」，将"联网"与"副作用"拆为两条正交轴，chat 允许挂只读联网/感知外部工具（ReAct 回边，设硬上限）但绝不写应用；② Snapshot 与 Dialogue 同构——Snapshot 是 Dialogue 在特定 phase 的冻结副本，二者同结构，删除 Snapshot 独立 status 改由 phase 派生；2026-06-20 修订：物理存储重构——Dialogue 从 Conversation 子文档提升为独立顶层集合，Snapshot 表退役（Dialogue 自身即快照），PlanningArtifact 表退役（规划产物作为用户可见消息融入 Dialogue.messages），Conversation 退化为轻量索引容器，PendingStore 退役并入 Dialogue；补充锁定三项决策：① summary 锁定为结构化对象；② awaiting_confirm 不允许自动确认（autoRun 移除）；③ respond 子路径工具范围扩展为任意只读工具均可注册）
**决策者**：陈班

---

## 背景

当前 Banyan 的 AI 对话链路存在一个结构性问题：同一次"用户提问 → AI 改应用"的过程，被四套彼此独立的状态机分别描述，但没有任何一个是其余的权威来源。

第一套是 SSE 契约，用 `text` / `tool_call` / `tool_result` / `app_snapshot` / `schema_update` / `disambiguation` / `done` / `error` 描述"此刻正在传输什么"，这是传输时序的语言。第二套是对话事务（Snapshot），用 `pending` / `done` / `confirmed` / `discarded` 描述"这次副作用认不认账"，这是事务提交的语言。第三套是多智能体写回（PlanningArtifact），用 `running` / `completed` / `partial` / `failed` / `interrupted` / `abandoned` 加上 PlanningSnapshot 的 `interruptedAt` / `completedAgents` 描述"规划进度"。第四套是 Dialogue 自身的 `threadStatus`，取值 `running` / `completed` / `interrupted` / `failed`。

这四套状态机描述的是同一件事的不同侧面，却各自独立维护。结果是 SSE 流过来的一个 `app_snapshot` 事件，既要平铺进 `messages[].assistantContent[]`（它把自己当历史记录），又要更新 Snapshot 集合（它把自己当事务暂存），多智能体路径下还要写 PlanningArtifact。三处写入、三套生命周期，全靠 `AiService` 的十步 SSE 代理用胶水代码硬对齐。

根因在于：`Dialogue` 目前只是一个"消息容器 + 若干外键挂件"，它没有承担"会话状态机"这个职责。`planningArtifactId` 是挂件，Snapshot 靠 `dialogueId` 反向关联是挂件，SSE 事件直接平铺进 `assistantContent[]` 是把传输层格式当存储层格式用。会话模型本应是这条链路的主线，却被架空了。

这种"各干各的、没有主线约束"的复杂度，不是 Agent 数量造成的，而是缺少一个统一概念去约束 SSE、事务、写回这三套机制。

---

## 决策

**让会话模型（Dialogue）成为整条 AI 对话链路的唯一权威状态机。SSE 契约是会话模型的实时投影（projection），副作用写回与多智能体写回是会话模型在特定阶段（phase）的产物（derived）。三者不再平行存在，全部从会话模型的阶段流转中派生。不存在独立的"事务"概念——phase 本身就是副作用的边界。**

这条原则可以拆成三个相互支撑的论断：

第一，**会话模型是唯一真相来源**。一次 task 型对话的生命周期是一条带明确阶段（phase）的主线，这条主线是所有其他机制读取状态的唯一依据。Dialogue 从"消息容器"升格为"阶段状态机"。

第二，**SSE 是这条主线的实时投影，不是一组平铺的独立事件**。每个 SSE 事件都必须能映射到"当前处于哪个 phase + 该 phase 内的增量"。前端不再自行拼装"现在是规划还是执行"，它只读 phase。新增任何 SSE 事件之前，必须先回答"它属于哪个 phase"——答不上来，就说明这个事件不该存在。SSE 契约被会话模型约束。

第三，**副作用写回与多智能体写回是会话模型的阶段产物，不是平级的并行层**。副作用的"认不认账"完全由 phase 决定——`executing` 期间副作用写入 Dialogue 文档，`committing` 时同步写入应用态三张表，`discarded` 则丢弃；不存在独立的"事务"概念，phase 本身就是边界。多智能体写回是"规划"这个 phase 的内部展开，对外只暴露 phase，不暴露内部是单节点还是多 Agent。它们的状态不再自行维护，而是会话模型 phase 在各自维度上的切片。

---

## 这条原则解决了什么

### 消除四套并行状态机

一旦确立"phase 是唯一真相"，另外三套状态要么删除、要么降级为内部实现细节：

- `Dialogue.threadStatus` 升级为权威的 phase 字段（词汇从"线程视角"改为"会话视角"）。
- Snapshot 表整体退役（Dialogue 独立成表后自身即快照，不再需要独立的暂存集合）。
- PlanningArtifact 表整体退役（规划产物融入 Dialogue.messages 作为用户可见内容）。

"各干各的"的根源——四套平行状态机靠胶水代码对齐——被从结构上消除。

### 把多智能体的复杂度收进 phase 内部

之前几轮讨论中令人困扰的多智能体复杂度（`planning_progress` 事件要不要携带完整 output、PlanningArtifact 与 Snapshot 是否需要事务化双写、ResumeClassifier 的产物失效传播），其根源都是多智能体写回与 SSE、事务处于平级地位，平行地往会话里塞数据。

一旦"规划"成为一个 phase、其内部展开对外不可见，多智能体要不要上、上几个 Agent，就彻底变成该 phase 的私事，不再触碰会话模型与数据表。ADR-032 / ADR-033 / ADR-034 描述的多智能体管线、命名空间记忆、中断续接，全部退化为"规划 phase 的可选内部实现"，与对外契约解耦。

### SSE 契约的可演进性被约束住

把 SSE 事件定义为"phase + 该 phase 的增量"后，契约的扩展有了明确的准入标准：任何新事件都必须归属于某个 phase。这避免了 SSE 契约随需求无序膨胀。

---

## 状态机定义

### 先厘清：在本项目里"对话"意味着什么

状态机怎么设计，取决于"对话"在本项目里到底是什么。对本项目的 chat，只立**两条边界**，此外不设限：

1. **不改画布（无副作用）**：chat 这一轮绝不产生需要确认或落库的副作用——不动画布、不写应用态、不进 `executing`/`committing`。这是它与 task 的唯一硬性分界。
2. **以应用为默认上下文，但不封顶的智能**：chat 默认以当前应用为上下文（pages 快照、ProjectSpec、表结构、云函数等只读信息），回答用户"这个按钮点了会发生什么"、"我这个表单少了哪个字段"、"刚才那次改动改了哪些组件"这类应用相关问题；但其智能**不封顶**——用户问通用知识（"防抖和节流的区别"）直接答，问需要实时信息的问题（"最新的 X 是什么"）则允许**联网/感知外部**取信息后回答。chat 要真正"懂"，就需要感知外部世界的能力。

**关键：把"联网"与"副作用"拆成两条正交的轴（2026-06-19 修订）。** 早期版本（第 65 行原文）把"不联网、无工具、不做知识检索"与"无副作用"捆成同一条边界，默认"联网必然伴随副作用"——这是一个建模错误。联网只读搜索本身就是无副作用的（查到信息、组织成回答，一个字都没写进应用）。两条轴正交后，chat 精确落在「**无副作用 + 可联网**」这一格：

| | 不联网 | 联网 |
|---|---|---|
| **无副作用（只读只答）** | 纯 LLM 问答 | **chat 的位置**（联网/查应用只读信息 → 回答，但绝不改应用） |
| **有副作用（改应用）** | （理论存在，少见） | task（可联网调研 → 改应用） |

由此 chat 与 task 的真正区别，不在"能不能调工具"或"要不要联网"，而在**这一轮要不要动画布**——要不要产生 pending 副作用、要不要走确认与提交。chat 是"只读（含联网只读工具）、只答"的，task 是"读写、要落库"的。这个区别是一个**二元开关**，不是两类性质不同的对话。chat **不是一个无所不能的通用 Agent**（它不写应用、不调有副作用的工具），但它**也不是一个被阉割的应用内问答框**（它可以联网、可以感知外部、智能不封顶）。

### 统一为单一 graph 单分支（2026-06-18 修订）

既然 chat 与 task 的区别只是"动不动画布"这个二元开关，就**不需要两套独立的 graph、不需要两套 phase 状态机**。早期版本设计了独立的 `createChatGraph`（4-phase）与 `masterGraph`（8-phase），由 `ai.ts` 按前端传入的 `mode` 物理分流到两张图。本轮重构推翻该设计，统一为**单一 graph、由 `intent` 节点决定走哪条子路径**：

```
START → intent ──┬── (不动画布) ──▶ respond ⇄ search_tool ───────────┐
                 └── (要动画布) ──▶ plan → humanGate → execute → ...  ─┤
                                                                       ▼
                                                                   summarize → END
```

`intent` 节点的核心元决策从"延续/微调/全新"扩展为同时决定一件更基本的事：**这一轮要不要动画布**。不动画布 → 走 `respond` 子路径（等价原 chat，跳过 plan/humanGate/execute/commit）；要动画布 → 走完整 task 管线。chat 由此从"另一套图"退化为"**task 管线的退化子路径**"——它只是一条跳过了规划、执行、确认、提交的最短路径，复用同一套 phase 词汇（`start → responding → done`，是 task phase 集合的子集），不再有独立的 4-phase 状态机。

**respond 子路径可挂任意只读工具，但仍是退化子路径（2026-06-19 修订，2026-06-20 扩展工具范围）。** 随"chat 边界正交化"，`respond` 不再是纯单节点，而是挂了只读工具节点 + 一条回边（ReAct 式"查了再答"：LLM 自判需要信息时调只读工具，拿到结果再组织回答）。**工具注册范围（2026-06-20 锁定）：任何只读工具均可注册到 respond 子路径，LLM 按需选用**——包括但不限于 `web_search`（联网检索）、`read_app_state`（查当前应用组件/页面/样式）、`read_collection_schema`（查数据表结构）、`read_cloud_function`（查云函数代码）等。唯一硬约束是**只读**：不写应用、不进 `executing`/`committing`、不产生 `app_snapshot`。**但这不破坏退化路径的结论**，因为：其一，所有注册工具都是**只读的**（只取信息，不写应用、不进 `humanGate/execute/commit`），所以 chat 依然落在"不动画布"分支里；其二，phase 复用依然成立，工具调用发生在 `responding` phase 内部（就像 task 的工具调用发生在 `executing` 内部），不需要新 phase；其三，intent 免费分流依然成立，前端 `type` 决定的还是"动不动画布"这个二元开关，只读工具在 chat 内部由 LLM 按需触发，不需 intent 多分一路。

> **一个必须的工程约束（呼应 ADR-035 成本意识）**：给 chat 的只读工具 ReAct 循环**设硬上限**（例如最多 2 轮工具调用，或 LLM 判定不需要额外信息就直接答），避免 chat 从"廉价单次回答"退化成"昂贵的多轮工具循环"。这是程序化卡死，不消耗额外决策 token。

**为什么不用 LLM 做 chat/task 分流。** 前端在发起请求时已明确携带 `type: 'chat' | 'task'`（用户是点了"问一问"还是"改一改"），这是一个**强先验**。默认直接采信前端 `type` 决定 `intent` 走哪条子路径，**不额外起一次 LLM 调用做分类**——理由有三：其一，成本，每轮多一次 LLM 调用纯属浪费，而前端信号是免费且确定的；其二，准确性，LLM 分类存在误判风险（把"帮我看看"误判成要改画布），而前端 `type` 来自用户的显式操作，零误判；其三，职责单一，`intent` 节点本就要做"延续/微调/全新"的意图判别，"动不动画布"作为同一次轻量判别的一个输出维度即可，但其**默认值由前端 `type` 钉死**，LLM 只在前端信号缺失或与上下文明显矛盾时作兜底纠偏（例如 `type=chat` 但用户说"把标题改成蓝色"这种明确的写操作），而非每轮重判。

> **一句话**：前端 `type` 是权威分流信号，`intent` 节点采信它决定走 `respond` 还是 task 管线，不为分流多花一次 LLM。

### task 型对话：8 个 phase（无 paused，打断即终态）

```
                            ┌──────── 用户发新反馈（重规划）────────┐
                            ▼                                      │
  start ──上下文就绪──▶ planning ───方案产出──▶ awaiting_confirm ───┤
    │                     │                         │   │          │
  准备出错              （副作用区段起点）         确认   放弃      （回到上一行）
    │                                              │     │
    │                                              │     ▼
    │                                              ▼  discarded（终态，回滚）
    │                                        executing ──全部task完成──▶ committing ──落库成功──▶ done（终态）
    │                                             │                          │
    │                                           出错                        出错
    └───────────────────────────────▶ failed ◀──────┘（终态）
```

| phase | 含义 | 进入条件 | 退出去向 |
|---|---|---|---|
| `start` | 准备中（**确定性非 LLM 区段**：建/取 Conversation、查历史 Dialogue、组装上下文——pages 快照/memory 召回/ProjectSpec、转发到 XiangDi） | 收到 task 请求 | 上下文就绪 → `planning`；准备出错（DB 不可用/appId 不存在） → `failed` |
| `planning` | 规划中（内部单节点 `planNode` 或多 Agent 管线，外部不感知） | `start` 上下文就绪 / `awaiting_confirm` 重规划 | 方案产出 → `awaiting_confirm` |
| `awaiting_confirm` | 待确认（**副作用区段起点**，确认后进入可产生副作用的 phase；**不允许自动确认**，必须经用户显式操作） | 方案产出 | 三分支：用户确认 → `executing`；放弃 → `discarded`；用户发新反馈 → `planning`（重规划） |
| `executing` | 执行中（产生 pending 副作用） | 确认通过 | 全部 task 完成 → `committing`；出错 → `failed` |
| `committing` | 提交中（将 Dialogue 中的应用快照写入 Application 三张持久化表） | 执行完成 | 落库成功 → `done`；出错 → `failed` |
| `done` | 完成（终态） | 落库成功 | — |
| `discarded` | 已放弃/被打断，回滚（终态） | 用户在 `awaiting_confirm` 放弃；或 `planning` / `executing` 进行中被中断（主动 stop / 被动断连，统一收口） | — |
| `failed` | 失败（终态） | `start`、`executing` 或 `committing` 出错 | — |

> **关于 `start` 与执行期的区分**：`start` 是后端查库拼上下文的确定性区段，agent 尚未启动，无 token 消耗；`planning` 起才是 agent 在跑。二者 failed 复用同一终态取值，但失败原因需在 payload 上可区分（准备失败 vs 执行失败），以便前端对"正在准备"与"agent 正在想"给出不同反馈。

**没有 paused 正交维度——打断即终态（2026-06-17 修订）**

早期版本曾设计 `paused` 布尔标志叠加在 `planning` / `executing` 上，配合 `resume` 从断点续接。本轮重构废弃该设计，改为"**打断即新对话**"模型：

- 用户中断（主动 stop 或被动断连）时，当前 Dialogue 直接流转到 **`discarded` 终态**，把暂存态固化为持久态（仅归档最后一个完整节点的产出，正在执行的节点产物丢弃），执行态（checkpoint）一并持久化封存。中断不再保留"可恢复的悬挂中间态"。
- 用户中断后的下一条输入，**一律新建 Dialogue**（从 `start` 重新进入），不再尝试恢复上一轮的 `thread_id`。
- 因此 `discarded` 是所有"进行中被打断"的统一收口终态（详见后文"中断归因"与"对话归属"小节）。原 paused → start(判断) → executing 的恢复路径不再存在。

这条修订消除了"中间挂起态"这一最复杂的状态分支，phase 状态机退化为"要么走到终态、要么被打断进 discarded"的单向流。

### chat 子路径：task 管线的退化路径（不是独立状态机）

chat **不再是另一套独立的 phase 状态机**，而是 task 管线在"不动画布"分支下的退化路径：`intent` 判定不动画布后，直接走 `respond` 子路径，只经历 task phase 集合的一个子集，跳过 `planning` / `awaiting_confirm` / `executing` / `committing`：

```
start ──上下文就绪──▶ responding ──回答完成──▶ done（终态）
  │                    │
准备出错               出错
  └────────────────┴──▶ failed（终态）
```

| phase | 含义 | 进入条件 | 退出去向 |
|---|---|---|---|
| `start` | 准备中（确定性非 LLM：查历史、组装上下文、跑 `intent` 判定不动画布、转发 LLM） | 收到请求且 `intent` 判定不动画布 | 上下文就绪 → `responding`；准备出错 → `failed` |
| `responding` | 回答中（`respond` 节点回答；可能内含若干轮**只读工具**调用——web_search / read_app_state 等任意只读工具，ReAct 式按需触发，设硬上限；无副作用） | `start` 上下文就绪 | 回答完成 → `done`；出错 → `failed` |
| `done` | 完成（终态） | 回答完成 | — |
| `failed` | 失败（终态，如 LLM 超时） | `start` 或 `responding` 出错 | — |

这四个 phase 取值全部是 task 8-phase 的**子集**（`start` / `responding` / `done` / `failed` 中，`responding` 是 task 在不动画布分支下复用的取值，其余三个 task 也有）。chat 子路径无副作用、无 paused、无确认——因为它根本不进 `executing` / `committing`，自然没有这些阶段；它与 task 共享同一张 graph、同一套 phase 词汇、同一个 `start` 准备区段，只是路由到了更短的那条边。

> **注意："无工具"不再成立（2026-06-19 修订，2026-06-20 扩展）**。随 chat 边界正交化，`responding` 期间 chat 可以调**任意只读工具**（web_search / read_app_state / read_collection_schema / read_cloud_function 等，LLM 按需选用）。但这不改变"chat 无副作用"这条硬边界——只读工具只取信息，不写应用、不进 `executing`/`committing`。"无工具"是早期表述，现修正为"无**有副作用**的工具，任何只读工具均可注册"。

### 对话归属：打断即新对话（2026-06-17 重构）

用户中断后再发消息，这条新消息归属"上一轮 Dialogue"还是"新开 Dialogue"，是整个模型的基础。早期 A 方案试图用意图分类决定是否"复用 checkpoint 原地恢复"（continue 原地 resume / refine 失效传播 fork / restart 新开），但落地时存在结构性问题：`ResumeClassifier` 的恢复分支依赖把 `planningSnapshot` 注入回 graph，而 banyan 后端 / xiangdi-server 从未实现这条注入链路，该分支实为死代码；同时"可恢复的 paused 悬挂态"是整个状态机里最复杂的分支。

本轮决策推翻 A 方案，改为**打断即新对话**——边界规则极简且无歧义：

**一条铁律：一次中断 = 老对话进 `discarded` 终态固化 + 下一条输入开新 Dialogue。永不原地恢复 checkpoint。**

具体两步：

1. **中断时（封存老对话）**：当前 Dialogue 流转到 `discarded`，把在途产物（Dialogue 文档中已写入的增量副作用 + 已完成节点输出）固化为终态归档。归档粒度是"**最后一个完整节点的产出**"——正在执行、尚未产出完整结果的节点直接丢弃，不做断点续跑准备。对应的执行态（checkpoint）随之持久化封存，仅作历史留痕，不再用于恢复。
2. **下一条输入时（开新对话）**：直接新建一个 Dialogue 进入 `start` 暂存态，正常组装上下文，统一走到 `intent`（意图识别）节点。新 Dialogue 用全新 `thread_id`，老 checkpoint 不复用。

由此"复用上一轮成果"不再是"恢复 checkpoint"，而是**上下文组装问题**：新对话的 `intent` 节点把最新一轮输入与最近几轮 / 语义相似召回的历史 Dialogue（按其 `summary`）一起做意图识别，需要时再懒加载对应 Dialogue 的完整内容（messages + appJSON）取详细产物。这部分召回机制复用 banyan 后端现有的 `ContextBuilder` 混合检索（详见后文"意图识别的上下文组装"）。

两条边界因此自然成立：

- **`discarded` 是终态，不可恢复**。无论主动放弃、主动 stop 还是被动断连，被打断的对话一律封存为 `discarded`，下一条输入当新需求处理，不注入老 checkpoint、不拼接到上一轮消息末尾。
- **不存在"可恢复的中间态"**。原 A 方案的 `paused → 判断 → 恢复` 路径整体移除；`continue` / `refine` / `restart` 不再是"恢复指令"，而降级为 `intent` 节点判断"新对话该组装哪些历史上下文"的**上下文策略**。

> **ResumeClassifier 的归宿**：不再做执行恢复，降级为 `intent` 节点内的**意图分类器**——判断"这条新输入与历史对话是延续、微调还是全新需求"，据此决定上下文召回范围，而非决定是否 resume checkpoint。ADR-034 中"snapshot 注入 graph 做断点续接"的三条 TODO 随之作废（不再需要）。

### intent 节点提为一等公民

"打断即新对话"模型下，每一轮 task 输入都是一个全新 Dialogue，因此每轮都需要先做一次**元决策**：这条新输入与历史对话是什么关系（全新需求 / 延续上一轮 / 在上一轮基础上微调），据此决定组装哪些历史上下文、从哪个起点进规划。这个决策在语义上独立于"已决定规划后产出方案"的 `planNode`，现状把它埋在 `planNode` 内部并依赖 `planningSnapshot`，处理不了"新对话该召回哪些历史"这个进 plan **之前**的问题。

因此统一 graph 把意图理解提为独立首节点，作为 chat/task 共享的唯一入口：

```
START → intent ──┬── respond（不动画布，等价原 chat）──────────────────────────┐
                 └── plan → humanGate → execute → assemble → audit ───────────┤
                                                                              ▼
                                                                          summarize → END
（现状：chat 走独立 createChatGraph；task 走 START → plan↔humanGate → ... → summarize → extractMemory → END，
  ResumeClassifier 内嵌于 plan、无 intent 首节点、两图物理分离）
```

> 上图为聚焦 `intent` 职责的简化视图，`respond` 节点实际还挂只读 `search_tool` 与 `respond ⇄ search_tool` ReAct 回边（见前文"统一为单一 graph 单分支"的权威图），此处省略不画。

`intent` 节点承担四件事：① **决定动不动画布**（chat/task 分流的核心元决策）——默认采信前端 `type` 强先验，不为分流多起 LLM 调用，仅在前端信号缺失或与上下文明显矛盾时兜底纠偏；判定不动画布 → 走 `respond`，判定要动画布 → 走 `plan`；② **每轮都跑**意图分类（不再限定"有 snapshot 才跑"），把当前输入与召回的历史 Dialogue summary 一起判断意图——成本极低（一次轻量 LLM 调用，输入是若干 summary 而非全量上下文），且用户对话天然累积，值得每轮做；③ 据意图决定上下文召回范围与路由起点（延续上一轮→带历史产物进 `plan`；局部微调→带受影响范围进 `plan`；全新需求→`plan` 从头不注入历史；模棱两可→`interrupt` 等确认）；④ **首轮对话（无任何历史 Dialogue）判空直通**——没有可比较的历史，0 LLM 调用直接放行（动不动画布仍采信前端 `type`）。`START → intent` 出来的是 `addConditionalEdges`，把"走 respond 还是 plan + 从哪开始 + 带什么上下文"全部从内部解放为图拓扑的一部分。注意「动不动画布」与「延续/微调/全新」是同一次轻量判别的两个输出维度，不需要两次 LLM 调用。

三条约束：

1. **humanGate 与 audit 保留**：`humanGate` 是 task `awaiting_confirm` phase 的来源，`audit` 是 `committing` 前的质量闸门，二者不可省。
2. **intent 节点归属 `start` phase**：意图分类是"准备阶段"的一部分（决定带什么上下文、动不动画布），归在 `start` 区段；首轮判空直通时 0 LLM，与"`start` 是确定性非 LLM 区段"一致；非首轮的意图分类是轻量 LLM 调用，仍属准备语义，进 `plan`（或 `respond`）才算正式进入执行。
3. **intent 节点是 chat/task 共享的唯一入口**：不再有"task 专属"一说——独立的 `createChatGraph` 废弃，`ai.ts` 不再按 `mode` 物理分流到两张图，而是把前端 `type` 作为 `intent` 节点的输入，由 `intent` 在同一张图内路由到 `respond`（不动画布）或 `plan`（动画布）。chat 不再"不经过 intent"，恰恰相反，chat 是 `intent` 判定"不动画布"后的退化子路径。

### 意图识别的上下文组装（复用 ContextBuilder）

"打断即新对话"把"复用上一轮成果"从 checkpoint 恢复问题转化为上下文组装问题，因此 `intent` 节点的输入怎么组装是关键。结论是：**直接复用 banyan 后端现有的 `ContextBuilder` 混合检索，以 Dialogue 的 `summary` 作为检索与判别单元，无需引入新机制**。

banyan 后端的 `ContextBuilder`（`apps/banyan/backend/src/services/ContextBuilder.ts`）已是一套成熟的双层混合召回：检索单元是 Dialogue（携带 `summary` 与 embedding），打分 `mixedScore = 0.6 × 语义相似度 + 0.4 × 时间衰减`，强制保留最近 N 轮（`MIN_RECENT_DIALOGUES = 3`）+ 语义 top-k（`SEMANTIC_TOP_K = 5`）；命中的 Dialogue 取其完整消息（L4），未命中的只取 `summary`（L3）。这正是"最近几轮 + 语义相似召回"的混合上下文。

由此 `intent` 节点的上下文组装策略：

- **输入 = 当前 prompt + `ContextBuilder` 召回的历史 Dialogue 的 `summary` 集合**。意图识别在 summary 粒度上判别"延续 / 微调 / 全新"，不需要喂全量历史。
- **summary 粒度的语义足够用**。三点理由：其一，意图判别本就是 Dialogue 级别的粗粒度决策（这一整轮想干什么），summary 恰好是 Dialogue 级别的概要，粒度天然匹配；其二，embedding 召回已经在"挑哪些历史相关"这一步做了筛选，summary 只承担"判别意图"，不承担"召回"；其三，判别命中后，要取详细产物时再**懒加载**对应 Dialogue 的完整内容（messages + appJSON），按需放大，不必前置喂全量。
- **summary 是结构化数据（2026-06-20 锁定）**：纯文本 summary 浪费 token 且信息量低，无法支撑"局部微调"等精确意图判别（例如识别"上一轮改了哪几个具体组件"）。因此 `Dialogue.summary` 锁定为**结构化对象**——至少包含：本轮意图摘要（自然语言）、涉及的页面 ID 列表、变更的 View ID 列表、变更类型标签（create/update/delete/style/bindFlow 等）。结构化 summary 同时作为 embedding 的输入源（序列化为文本后向量化）和 intent 节点的判别输入。具体字段定义在实施阶段确定。

### summarize 与 extractMemory 合并为单一总结节点（2026-06-18 修订）

现状 task 管线尾部有两个相邻节点 `summarize → extractMemory`，语义上它们**都是总结**，只是产出对象不同：`summarize` 总结"这一轮干了什么"（产出 `roundSummary`），`extractMemory` 总结"从这一轮该沉淀什么经验与事实"（产出 Episode 经验与 Fact 事实，含用户偏好）。二者不仅语义同类，而且是**生产者-消费者串联**——`extractMemory` 的输入恰恰是 `summarize` 产出的 `roundSummary`（`extractMemoryNode` 消费 `state.roundSummary`，提示词写明"分析以下任务执行摘要"）。两个相邻、同类、且后者吃前者输出的节点，各起一次 LLM 调用，是可以合并的。

本轮决策：**合并为单一 `summarize` 节点，一次 LLM 调用同时产出 `{ roundSummary, episodes, facts }`**。具体边界：

- **保留零 token 的结构化抽取阶段（Phase 1 不动）**。现状 `summarizeNode` 的 Phase 1 是确定性的 `extractChangeSummaryInput`（从 state 里结构化抽取改动摘要，无 LLM 调用），这部分保留，作为合并后节点的输入预处理。
- **只合并两次 LLM 调用（Phase 2）**。现状 `summarize` 的 Phase 2 一次 LLM 产出 `roundSummary`，`extractMemory` 再一次 LLM 消费 `roundSummary` 产出记忆。合并后改为**一次 LLM 调用**，提示词同时要求模型产出本轮概要、经验条目、事实条目三部分结构化结果。
- **合并后节点数 8 → 7**。task 管线尾部从 `... → audit → summarize → extractMemory → END` 收敛为 `... → audit → summarize → END`，`extractMemory` 节点退役、其职责并入 `summarize`。

这次合并有先例可循：`extractMemory` 本身就是早前合并 `extractPreferences`（偏好提取）的产物——偏好提取并入记忆提取已验证过"同类总结合一"的路径，这次只是把链条上游的 `summarize` 一并收进来。

合并的额外收益：**记忆质量可能更好**。现状 `extractMemory` 只能看到上游产出的 512-token `roundSummary`（有损压缩），合并后同一次 LLM 调用能同时看到原始 state（改动详情）与正在生成的概要，提取经验/事实时信息更全，不再受"先压缩再提取"的二次信息损失。

> **不合并 Phase 1 的原因**：Phase 1 是零 token 的确定性结构化抽取，把它塞进 LLM 调用反而是退步（让模型做本可代码完成的事）。合并只针对两次冗余的 LLM 调用，不动确定性区段。

### 派生关系

```
                  会话模型 Dialogue.phase（唯一权威状态机）
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
   SSE = 主线的           副作用写回 =             多智能体 = planning
   实时投影              executing/committing       phase 的内部展开
                         区段的 phase 产物          （对外只暴露 phase，
                         （副作用写 Dialogue）       产物融入 messages）
```

---

## SSE 投影与三层职责

### 三层链路定位

SSE 事件的链路是「XiangDi 发射 → banyan 后端做 phase 权威推进 → 前端纯投影消费」。关键不是"中转转换过滤"，而是 **banyan 后端在这条链路上承担会话模型的权威落库**，不只是翻译层。

**第一层 · XiangDi 服务（:3002）—— 原始执行事件发射源，不懂 phase**

只发它知道的 LangGraph 节点流转事件：`started`（新增，见下）、`text_delta`、`tool_call`、`tool_result`、`app_snapshot`、`planning_progress`、`disambiguation`、`round_summary`、`memory_update`、`interrupt`、`resumed`、`done`、`error`。它**不发 `phase` 事件**——`awaiting_confirm` / `committing` / `discarded` 是会话状态机语义，无状态 agent 服务没有这些概念。它发的 `done` 仅表示「LangGraph 图跑到 END」，不等于「应用态已落库」。

**第二层 · banyan 后端（:3001）—— phase 权威机 + 投影器（核心改造层）**

取代现有 `AiService.dispatchEvent` 混在一起的逻辑，拆为三个清晰职责：

1. **phase 状态机推进**：后端持有当前 Dialogue 的 phase，根据收到的 XiangDi 原始事件做转移判定，每次转移向前端发权威 `phase` 事件。
2. **投影落库（由 phase 驱动，非由 `done` 驱动）**：`executing` 期间累积副作用写当前 Dialogue 文档（appJSON / collections / cloudFunctions）；`committing` 时将 Dialogue 中的应用快照同步写入 Application 三张持久化表。副作用的生命周期完全由 phase 决定，不存在独立的"事务"概念。
3. **二次投影**：XiangDi 原始事件不直接透传，翻译成「`phase` 事件 + 归属该 phase 的增量事件」再发前端；`memory_update` / `checkpoint` 等纯内部事件在此过滤。

**第三层 · 前端（:5174）—— phase 的纯投影消费方**

先消费 `phase` 事件切 UI 大状态，再按当前 phase 消费归属其下的增量事件渲染细节。**前端永不自己推导 phase**，废弃 `currentTypeRef.current === 'task'` 这类硬猜。

### 前端状态全景：phase 是唯一的"大状态"

前端的渲染模型只有一个维度：**当前 phase 是什么**。phase 决定 UI 框架（展示什么区域、启用什么交互），phase 内的增量 SSE 事件决定细节渲染（流式文字、工具调用卡片、画布刷新等）。前端不维护任何独立于 phase 的状态变量。

**phase 取值全集（9 个，task 8 + chat 独有 responding 1）：**

| phase | 路径 | 前端语义 | UI 表现 |
|---|---|---|---|
| `start` | 共享 | 准备中（后端查库拼上下文，agent 未启动） | loading/spinner，"正在准备…" |
| `planning` | task | 规划中（agent 在思考/产出方案） | 流式文字 + 规划进度卡片 |
| `awaiting_confirm` | task | 待确认（方案已出，等用户操作） | 方案展示 + 确认/放弃/反馈三操作 |
| `executing` | task | 执行中（产生副作用，改画布） | 工具调用面板 + 画布实时更新 |
| `committing` | task | 提交中（落库） | 短暂过渡态，"正在保存…" |
| `responding` | chat | 回答中（可能含只读工具调用） | 流式文字 + 可能的"正在查询…"标签 |
| `done` | 共享 | 完成（终态） | 成功标记，展示最终结果 |
| `discarded` | task | 已放弃/被打断（终态） | 取消标记 + 归因提示 |
| `failed` | 共享 | 失败（终态） | 错误提示，展示失败原因 |

**每个 phase 下前端可收到的增量 SSE 事件：**

| phase | 增量事件 | 渲染形式 |
|---|---|---|
| `start` | 无 | 纯等待，骨架屏 |
| `planning` | `text_delta`、`planning_progress` | 流式文字渲染 + 规划步骤卡片（多 Agent 内部展开） |
| `awaiting_confirm` | 无 | 静态方案展示 + 操作按钮（确认/放弃/发新反馈） |
| `executing` | `tool_call`、`tool_result`、`app_snapshot`、`schema_update` | 工具调用折叠面板 + `app_snapshot` 触发画布实时刷新 |
| `committing` | 无（`memory_update` 等内部事件不投影前端） | 短暂 loading |
| `responding` | `text_delta`、`tool_call`（只读）、`tool_result`（只读） | 流式文字 + "正在搜索/查询…"过程标签 |
| `done` | 无（终态 payload 携带最终 appJSON） | 完成标记 |
| `discarded` | 无（终态 payload 携带 `reason`） | 归因区分：`user_aborted` → "已取消"；`connection_lost` → "因网络中断未完成" |
| `failed` | 无（终态 payload 携带失败原因） | 错误提示 |

**关键渲染区分规则（前端靠 phase 而非事件类型区分语义）：**

- **同为 `text_delta`**：`planning` 阶段的文字是规划方案（可能伴随 `planning_progress` 步骤卡片），`responding` 阶段的文字是最终回答。前端按当前 phase 选择渲染容器。
- **同为 `tool_call` / `tool_result`**：`executing` 阶段的工具调用有副作用（伴随 `app_snapshot` 画布更新），`responding` 阶段的工具调用是只读的（不伴随 `app_snapshot`，不触发画布更新或确认 UI）。前端按当前 phase 决定是否刷新画布。
- **终态三分**：`done`（成功）、`discarded`（取消/中断）、`failed`（错误）是三个互斥终态，前端据此展示不同的结束 UI。`discarded` 额外按 `reason` 区分用户主动取消与网络断连。

> **数字总结**：9 个 phase 取值（前端状态机全部状态）、6 种增量事件类型（`text_delta` / `planning_progress` / `tool_call` / `tool_result` / `app_snapshot` / `schema_update`）、3 个终态、1 个需要用户操作的 phase（`awaiting_confirm`）。

### `phase` 事件

新增贯穿性 `phase` 事件作为 SSE 主干，每次 phase 转移发一个：

```
event: phase
data: { "phase": "executing", "dialogueType": "task" }
```

进入 `discarded` 终态时，payload 额外携带中断归因（见下文"中断归因"）：`{ "phase": "discarded", "reason": "user_aborted" | "connection_lost", "dialogueType": "task" }`。`paused` 字段已随 paused 正交态一并废除。其余 13 个事件全部降级为「某 phase 内部的增量」。

### SSE 事件 → phase 映射表

| phase | 该 phase 内的增量事件 | 转移信号 |
|---|---|---|
| `start` | （后端发 `phase: start`） | XiangDi 发 `started`（上下文就绪、agent 已开跑）→ 后端转 `planning`；准备失败 → `phase: failed` |
| `planning` | `text_delta`、`planning_progress`（多 Agent 内部展开）、`round_summary` | 收到 `interrupt(humanGate)` → 转 `awaiting_confirm` |
| `awaiting_confirm` | `phase: awaiting_confirm` 本身即「请确认」信号，payload 携带待确认方案（取代 `interrupt`+humanGate 的解包） | 三分支：confirm 接口 → `executing`；放弃 → `discarded`；新反馈 → `planning` |
| `executing` | `tool_call`、`tool_result`、`app_snapshot`、`schema_update` | XiangDi `done` 到达 → 转 `committing` |
| `committing` | `memory_update`（落地副作用，不投影前端）、最终 `app_snapshot` | 落库成功 → `phase: done`；失败 → `phase: failed` |
| `done` / `discarded` / `failed` | 终态 `phase` 事件，payload 携带最终 appJSON / 失败原因 | — |

中断维度（取代原 paused）：进行中的 `planning` / `executing` 被中断（主动 stop 或被动断连）→ 后端发 `phase: discarded` 携带 `reason`，不再有 `paused: true` / `resumed` 这对事件。**被取消的是"中断恢复式 resume"**（断连后重连原 thread 续跑那一套），随 paused 正交态一并废除；这与 humanGate 的 `resume` 是**两个不同概念**，后者保留（见下文"两个 resume 不要混淆"）。`checkpoint` 为内部调试信息，移出对外 SSE 契约。

chat 映射极简：`phase: start` → XiangDi `started` → `phase: responding`（其间 `text_delta`，**以及若 LLM 触发只读工具则有 `tool_call` / `tool_result`**）→ `phase: done`。chat 仍**无 `app_snapshot` / `schema_update`**——它出现的 `tool_call` / `tool_result` 必为**只读工具**（web_search / read_app_state / read_collection_schema 等，不携带应用副作用），前端据此渲染"正在查询…"的过程态，但不触发任何画布更新或确认 UI。这是 chat 与 task 在工具事件上的唯一区别：同样有 `tool_*`，但 chat 的是只读的、不伴随 `app_snapshot`。

### 三条关键约定

1. **XiangDi 显式发 `started` 事件**：标志「收到上下文、开始执行」，作为 `start → planning`（task）/ `start → responding`（chat）的权威触发点。避免靠「首个事件到达」推断（agent 首步可能是调工具而非吐字，事件类型不固定）。
2. **XiangDi 的 `done` 不直接透传前端**：它只是触发后端从 `executing/committing` 走向落库的内部信号。前端看到的「完成」是后端落库成功后发的权威 `phase: done`，杜绝「XiangDi 说完成但后端落库失败、前端已显示成功」的不一致。
3. **confirm 保持独立 HTTP 接口，但结果统一表达为 phase 转移**：confirm 不直接返回业务数据，而是触发后端发 `phase: executing` 并复用同一条 SSE 通道继续推。前端只有一个 phase 事件入口，不区分「SSE 来的」与「confirm 响应来的」。

### task 一次完整对话的时序

```
前端              banyan 后端（phase 权威）           XiangDi 服务
 │  POST /ai/chat       │                                 │
 │ ───────────────────▶ │ 置 phase=start                  │
 │ ◀── phase:start ──── │ 建/取 Conversation、查历史       │
 │                      │ 组装上下文（pages/memory/spec）  │
 │                      │ ─── POST /run（含上下文）──────▶ │ LangGraph 启动
 │                      │ ◀────── started ─────────────── │ 收到上下文、开跑
 │ ◀── phase:planning ─ │ 转 planning                     │ planNode 跑
 │ ◀── text_delta ───── │ 投影转发                         │
 │                      │ ◀── interrupt(humanGate) ────── │ 图中断等确认
 │ ◀── phase:           │ 转 awaiting_confirm              │
 │     awaiting_confirm │ 【副作用区段起点】确认后可写应用  │
 │ ── confirm（独立接口）▶│ 转 executing                    │
 │ ◀── phase:executing  │ ── POST /resume(humanGate确认) ─▶ │ 图恢复执行
 │ ◀── tool_call ────── │ 投影 + 累积 buffer               │ 工具执行
 │ ◀── app_snapshot ─── │ 投影 + 累积                      │
 │                      │ ◀──────── done ──────────────── │ 图到 END（内部信号）
 │ ◀── phase:committing │ 转 committing                    │
 │                      │ 【落库】写入 Application 三张表   │
 │                      │ 写 Conversation                  │
 │ ◀── phase:done ───── │ 转 done（落库成功后才发）         │
```

> 上图中 `POST /resume` 是 confirm 之后后端调 XiangDi 让在 humanGate 处中断的图继续跑下去，走的是 LangGraph 的 interrupt/resume 原语。它与被废弃的"中断恢复式 resume"（断连后重连原 thread 续跑）同名但是两回事，详见下一小节。

### 两个 resume 不要混淆

本项目里有两个都叫"resume"的东西，语义完全不同，不区分会造成误解：

| | humanGate 确认 resume（**保留**） | 中断恢复 resume（**已废弃**） |
|---|---|---|
| 是什么 | LangGraph `interrupt`/`resume` 原语：图在 `awaiting_confirm` 处主动中断等用户确认，确认后 resume 让图继续 | 早期 paused 设计：用户中断/断连后，下一转恢复老 thread 从断点续跑 |
| 触发点 | confirm 接口 → 后端 `POST /resume` | 无（已取消） |
| 存在原因 | humanGate 是设计上故意的人工闸门，task 确认部分的基石 | 为"可恢复的挂起态"服务 |
| 现状 | `apps/xiangdi-server/src/routes/ai.ts` 的 `POST /ai/resume` 就是这个，与本轮重构无关，不动 | 随"打断即新对话"整体移除 |

一句话：**humanGate 的 resume 是"用户确认后接着跑"，被废弃的 resume 是"中断后恢复老进度接着跑"**。前者是正常流程的一部分（每次 task 确认都走），后者是被"打断即新对话"取消的恢复机制。本 ADR 的一切"取消 resume"表述，指的都是后者。

---

## 派生数据的物理存储形态

### 存储分层（执行态 / 对话态 / 应用态）（2026-06-20 重构）

> 本节取代早期版本的"执行态/暂存态/持久态"三层模型。核心变更：**Dialogue 从 Conversation 子文档提升为独立顶层集合，Snapshot 表退役，暂存态与持久态合一为"对话态"**。

早期版本把运行期状态分为三层：执行态（checkpoint）、暂存态（Snapshot）、持久态（Application 三张表）。其中 Snapshot 的存在理由是"Dialogue 作为 Conversation 子文档，不能在未确认时就写进去"。但这个前提本身有问题——Conversation 嵌套所有 Dialogue 子文档会导致文档无限膨胀（MongoDB 16MB 上限），且 Snapshot 与 Dialogue 同构意味着维护两份相同结构的数据纯属冗余。

**本轮决策：Dialogue 独立为顶层集合，自身即快照，Snapshot 表退役。**

| 层 | 物理载体 | 位置 | 存的是 | 权威性 |
|---|---|---|---|---|
| **执行态** | `SqliteCheckpointStore`（LangGraph checkpointer） | XiangDi 服务（:3002） | LangGraph thread 的节点快照，按 `thread_id` 索引 | agent 执行进度的真相；仅留痕不恢复 |
| **对话态** | `Dialogue` 独立集合 | banyan 后端（:3001） | 一轮对话的完整记录：phase + 消息 + 规划产物 + 应用快照 | 本轮副作用"认不认账"的真相（由 phase 决定）**+** 历史回滚点 |
| **应用态** | `Application.appJSON` + `CloudFunction` + `CollectionSchema` | banyan 后端（:3001） | 已 confirmed 落库的应用真相 | "上次已提交"的真相 |

**为什么 Snapshot 不再需要：**

Snapshot 原来承担两个职责：① 暂存态（AI 执行中的在途产物）；② 回滚点（confirmed 后的历史版本）。Dialogue 独立成表后，这两个职责被 Dialogue 自身吸收：

- **暂存态** = 一个 `phase ∈ {start, planning, awaiting_confirm, executing, committing}` 的 Dialogue 文档。它还没到终态，自然就是"暂存中"的。AI 执行期间的增量副作用直接写入这个 Dialogue 文档的 `appJSON` / `collections` / `cloudFunctions` 字段。
- **回滚点** = 每个 `phase = done` 的 Dialogue 天然就是一个历史版本。它携带了那一轮结束时的完整应用快照，回滚 = 取某个历史 Dialogue 的应用快照写回 Application 三张表。

Snapshot 的 `status: pending/done/confirmed/discarded` 完全被 `Dialogue.phase` 取代——`pending` = phase ∈ {executing, committing}；`done` = phase = awaiting_confirm；`confirmed` = phase = done；`discarded` = phase = discarded。这正是 ADR-039 早期修订说的"Snapshot 独立 status 删除，靠 phase 派生"的终极形态：**连 Snapshot 这个概念都不需要了，因为 Dialogue 本身就是那个快照。**

**Conversation 退化为轻量索引容器：**

Conversation 不再嵌套 Dialogue 子文档，退化为纯索引：

```typescript
interface IConversation {
  appId: string            // 1 App = 1 Conversation（唯一索引）
  dialogueIds: ObjectId[]  // 按时间顺序的 Dialogue 引用列表
}
```

保留 Conversation 集合（而非直接去掉）的理由：① "拿到一个 app 的对话列表"是高频操作，预排序的 `dialogueIds[]` 比每次查询排序更高效；② 可存放 app 级对话元数据（如 system prompt 定制、对话偏好等）。

**PendingStore 退役，并入 Dialogue：**

banyan 后端原有的 `PendingStore`（内存 `Map` + 仅 done 落盘）与 Snapshot 照的其实是同一个东西——同一个 `{appId, dialogueId}` 生命周期下的同一轮 Dialogue，只是被拆成两半。现在 Dialogue 独立成表且自身即快照，PendingStore 的所有字段（`assistantContent` / `roundSummary` / `memoryUpdates` / `planningEntries` / `finalAppJSON` / `schemaUpdates`）全部并入 Dialogue 文档，内存 `Map` + 磁盘双轨整体移除。

**PlanningArtifact 表退役，规划产物融入消息流：**

规划产物（featureList / techPlan / visualSpec / changeSpec）是用户可见的对话内容，不是隐藏的元数据。它们以 `assistantContent` 消息块的形式存在于 `Dialogue.messages[]` 中（新增 `planning_progress` 类型的内容块），随对话流自然呈现给用户。PlanningArtifact 独立集合退役，`Dialogue.planningArtifactId` 外键删除。

> **checkpointer 已是持久化的**（沿用早期核实结论）。`apps/xiangdi-server/src/checkpoint/index.ts` 工厂默认 `CHECKPOINT_BACKEND ?? "sqlite"`，`server.ts` 启动即实例化 `SqliteCheckpointStore`。当前阶段只考虑单机 server，Sqlite 的多实例局限推迟到商业化共享 server 时再处理。

### PlanningArtifact：整体退役（2026-06-20 修订）

> 本节取代早期版本的"status 废除、降级为纯归档"决策。更进一步：**PlanningArtifact 集合整体退役，不再作为独立表存在。**

早期版本（2026-06-19）的决策是"废除 status，PlanningArtifact 降级为纯规划归档"。但 2026-06-20 物理存储重构后，规划产物已作为用户可见消息融入 `Dialogue.messages[]`（`planning_progress` 类型内容块），Dialogue 自身即完整记录。PlanningArtifact 作为独立集合已无存在理由：

- **规划产物的呈现** → `Dialogue.messages[]` 中的 `planning_progress` 内容块（用户可见，随对话流展示）
- **规划进度** → `Dialogue.phase`（`planning` phase 期间，前端通过 SSE `planning_progress` 事件实时感知）
- **历史归档** → Dialogue 本身就是归档（`phase = done` 的 Dialogue 携带完整消息历史，含规划产物）

`IPlanningSnapshot`（interruptedAt / completedAgents / partialState）同步删除。"打断即新对话"取消了 resume 恢复路径，执行态归 checkpointer（仅留痕不恢复），进度归 phase，`IPlanningSnapshot` 纯属冗余。

`Dialogue.planningArtifactId` 外键删除——不再有独立的 PlanningArtifact 文档可关联。

### assistantContent[]：保留，去掉 `done` 类型

`assistantContent[]` 继续作为投影的落地存储（历史回放需要），但移除 `done` 类型——`done` 是 phase 终态信号，不是消息内容，混在内容块里属于把传输信号当存储。

### 实时更新流与初始化降级流

phase 权威下，前端读应用状态分两条流：

**实时更新流（executing 期间）**：XiangDi 每个写工具执行完发 `app_snapshot` → banyan 后端①投影转发前端 ②写当前 `Dialogue.appJSON`；前端经 `onAppSnapshot` 实时渲染画布。进行中的 Dialogue = "在途副作用真相"（phase 决定最终是落库还是丢弃）。

**初始化降级流（打开/刷新应用）**：优先查是否有 `phase ∈ {executing, committing, awaiting_confirm}` 的进行中 Dialogue → 命中则用其 `appJSON` + 按 `phase` 设 UI；缺失则**静默降级**到三张已落库表（`Application.appJSON` + `CloudFunction` + `CollectionSchema`），前端给一个轻量 notice（"已从上次保存的版本恢复"），不阻塞、不报错弹窗。三张落库表 = "上次已提交真相"。

---

## 中断归因（归因分流，状态收口）

中断有两个来源——用户主动停（点"停止"按钮）与环境被动断（网络掉线、标签页关闭、进程崩溃）。本 ADR 的决策是：**两个来源走两条触发路径，但统一收口到同一个 `discarded` 终态；归因只作为 metadata 记录，不影响终态本身**。

现状只有一条路径、无归因：后端靠 `res.on('close')` 触发 `abortController.abort()`（`ai.ts:310-312`），无法区分用户主动停还是网络断连，且没有显式的停止协议。要做归因，前提是让 server 能区分两种来源。

### 显式停止协议（第 6 条决策，归因的前置）

归因的关键在于区分信号来源，因此新增显式停止协议：

- **主动停**：前端调显式停止端点 `POST /api/ai/:appId/stop`。收到这个请求 = 用户主动意图 → 归因 `user_aborted`。
- **被动停**：未收到 stop 请求、仅 SSE 连接 `close`（`res.on('close')`）→ 归因 `connection_lost`。
- 二者都触发 `abortController.abort()` 终止 XiangDi 执行，差别仅在归因标记。

### 归因表

| 触发路径 | 归因 reason | 收口 phase | 性质 |
|---|---|---|---|
| `POST /stop` 显式停止 | `user_aborted` | `discarded` | 用户主动意图 |
| SSE 裸 `close`（无 stop 请求） | `connection_lost` | `discarded` | 环境被动故障 |
| 执行抛错 | `failed`（归 `failed` 终态，非中断） | `failed` | 执行失败 |

### 选 A：被动断连也收口 discarded，归因仅作 metadata

针对"被动断连要不要给短暂 TTL 恢复窗口"，有两个选项：

- **A（采纳）**：被动断连与主动停一视同仁，统一进 `discarded`，`reason` 仅作 metadata 记录，不开恢复窗口。
- B（不采纳）：被动断连给短 TTL pending 窗口，期内重连可恢复。

选 A 的理由是与"打断即新对话"模型一致——既然取消了 resume、不存在可恢复中间态，被动断连若开 TTL 恢复窗口就会重新引入"悬挂中间态"这一已被消除的复杂分支，自相矛盾。因此归因不改变"是什么终态"（都是 `discarded`），只影响两件事：**怎么归档**（归因写进 Dialogue 的 metadata，供后续分析与体验优化用）与**下一轮体验**（例如对 `connection_lost` 可在新对话里友好提示"上次因网络中断未完成"）。归档粒度仍是"最后一个完整节点产出"，与"对话归属"小节一致。

---

## 待后续讨论（本 ADR 不锁定）

本 ADR 已确立核心原则、统一单分支 graph、状态机定义、SSE 投影三层职责、存储分层（含 2026-06-20 物理存储重构）、打断即新对话模型、意图驱动上下文组装、summarize/extractMemory 合并、中断归因、chat 边界正交化。以下实施细节需在后续设计/迭代中逐项落地：

1. **会话数据结构设计（关键前置专题）**：定义 `Dialogue` 独立集合的完整 Mongoose Schema——phase 字段、`assistantContent` 新增 `planning_progress` 类型、应用快照字段（`appJSON` / `collections` / `cloudFunctions`）、结构化 `summary`（已锁定为结构化对象，含意图摘要/页面ID列表/变更View ID列表/变更类型标签，具体字段定义在此专题确定）、中断归因 metadata。同步定义退化后的 `Conversation` Schema（`appId` + `dialogueIds[]`）。本专题是后续多项落地的前置。
2. **模型文件改造与旧表退役**：① 新建 `Dialogue.ts` 独立模型（从 `Conversation.ts` 子文档提升）；② `Conversation.ts` 从嵌套 `dialogues[]` 改为引用 `dialogueIds[]`；③ 删除 `Snapshot.ts` 模型文件；④ 删除 `PlanningArtifact.ts` 模型文件；⑤ 删除 `PendingStore.ts`；⑥ 更新 `models/index.ts` barrel 导出。
3. **AiService 写回路径重构**：改造 `AiService` 的十步 SSE 代理，使其直接操作 `Dialogue` 文档（创建 → 增量写入 → phase 推进 → confirm 时写应用态三张表），移除对 Snapshot/PendingStore 的所有依赖。
4. **SnapshotService / PlanningArtifactService 退役**：删除 `SnapshotService.ts` 和 `PlanningArtifactService.ts`，其职责由 `DialogueService`（新建）承担。
5. **XiangDi 侧 `started` 事件的落地**：在 `apps/xiangdi-server` 的 SSE 发射点新增 `started` 事件，banyan 后端 `AiService` 据此推进 `start → planning/responding`。
6. **统一 graph 与 intent 节点提为一等公民的图改造**：① 把独立的 `createChatGraph` 并入 `masterGraph`，`ai.ts` 不再按 `mode` 物理分流两张图，前端 `type` 改为 `intent` 节点的输入；② `masterGraph` 将 `ResumeClassifier` 从 `planNode` 内部提取为独立首节点 `intent`（降级为意图分类器 + 动不动画布判定，每轮跑、首轮判空直通），`START → intent` 改为条件边，路由到 `respond`（不动画布，等价原 chat 的 think 节点）或 `plan`（动画布），并按意图决定上下文召回范围与起点；③ **respond 子路径注册任意只读工具并补 `respond ⇄ readonly_tools` 的 ReAct 条件边**——任何只读工具均可注册（web_search / read_app_state / read_collection_schema / read_cloud_function 等），LLM 按需选用，唯一硬约束是不写应用、不进 `executing`/`committing`、不产生 `app_snapshot`，且按 ADR-035 成本意识对 ReAct 轮次设硬上限（建议 max 2 轮）；④ 把 `summarize` 与 `extractMemory` 两节点合并为单一 `summarize` 节点（保留 Phase 1 零 token 抽取，合并 Phase 2 的两次 LLM 调用为一次，产出 `{ roundSummary, episodes, facts }`），`extractMemory` 节点退役，管线节点数 8 → 7；⑤ 删除依赖 `planningSnapshot` 的 resume 恢复分支与 `IPlanningSnapshot`。
7. **显式停止协议与中断归因落地**：新增 `POST /api/ai/:appId/stop` 端点（归因 `user_aborted`），`res.on('close')` 归因 `connection_lost`，二者收口 `discarded` 并把 `reason` 写入 Dialogue metadata；归档"最后一个完整节点产出"。
8. **数据迁移脚本**：为已有数据编写一次性迁移——① 把 `Conversation.dialogues[]` 子文档拆出为独立 `Dialogue` 文档；② 把 `Snapshot` 数据合并到对应 Dialogue；③ 把 `PlanningArtifact` 数据转为 Dialogue.messages 中的 `planning_progress` 内容块；④ Conversation 文档改为只存 `dialogueIds[]`。
9. **多实例/共享 server（推迟）**：当前只考虑单机 server，先把流程跑通。`SqliteCheckpointStore` 文件不跨实例共享的局限，留到商业化共享 server 阶段再处理（届时换 Redis/远端 checkpointer + Dialogue 已天然在 MongoDB 独立集合）。

---

## 后果

### 正面

- 一条主线约束三套机制，"各干各的"的结构性复杂度被消除。
- 多智能体的复杂度收进 `planning` phase 内部，要不要上、上几个 Agent 与对外契约、数据表解耦。
- SSE 契约获得明确的演进准入标准（必须归属某个 phase）。
- 副作用边界与会话阶段边界完全重合（phase 本身就是边界），不存在独立的"事务"概念需要对齐。
- **（2026-06-20 新增）** MongoDB 集合从 5 张（Conversation + Snapshot + PlanningArtifact + PendingStore 磁盘文件）收敛为 2 张（Conversation + Dialogue），概念数量减半，认知负担和维护成本显著降低。
- **（2026-06-20 新增）** Dialogue 独立成表后单文档不再膨胀（每个 Dialogue 是一轮对话，大小可控），彻底规避 MongoDB 16MB 文档上限风险。
- **（2026-06-20 新增）** 回滚操作从"查 Snapshot 表 → 写回 Application 三张表"简化为"查历史 Dialogue → 写回 Application 三张表"，链路更短、概念更少。

### 负面

- 现有 `Conversation.ts`、`Snapshot.ts`、`PlanningArtifact.ts`、`PendingStore.ts`、`AiService` 的十步 SSE 代理、`SnapshotService`、`PlanningArtifactService`、前端 `useXiangDi` hook 都需要围绕 phase + Dialogue 独立集合重构，是一次有影响面的改动。
- phase 状态机的取值需要审慎设计，过细会重新引入复杂度，过粗会丧失约束力。
- 已有数据需要一次性迁移（Conversation 子文档拆出 + Snapshot/PlanningArtifact 合并进 Dialogue）。

### 缓解

- 改造可分步：第一步新建 `Dialogue` 独立集合 + 改 Conversation 为引用，写双写兼容层；第二步切读路径到新表；第三步删旧表和旧 Service。灰度期间新旧并存。
- 数据迁移脚本可在灰度期间跑，不阻塞新功能开发。

---

## 相关决策

- [ADR-032](./032-multi-agent-planning-pipeline.md) — 多 Agent 规划管线（退化为 `planning` phase 的可选内部实现）
- [ADR-033](./033-memory-namespace-for-multi-agent.md) — 记忆命名空间（仅在多智能体内部实现启用时相关）
- [ADR-034](./034-interrupt-resume-strategy.md) — 中断续接（**已被本 ADR 的"打断即新对话"模型取代**：取消 resume 恢复，中断一律收口 `discarded`；ResumeClassifier 降级为意图分类器，不再做断点续接；ADR-034 中 snapshot 注入 graph 的三条 TODO 作废）
- [ADR-035](./035-engineering-over-subagent.md) — 工程化优先（与本 ADR 一致：约束复杂度，按需启用）
- [ADR-026](./026-context-assembly-architecture.md) — 上下文分层组装（本 ADR 的 `intent` 节点意图识别直接复用其 `ContextBuilder` 混合检索做历史召回）
