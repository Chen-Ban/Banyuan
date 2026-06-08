# App · 机制级决策

> 某个机制怎么工作——Banyan 应用层的关键运行机制。

---

## 决策依赖图

```
┌───────────────────────────────────┐
│  M1 AI 请求代理机制（SSE 转发）    │
└───────────────────────────────────┘

┌───────────────────────────────────┐
│  M2 构建与预览服务                 │
└───────────────────────────────────┘

┌───────────────────────────────────┐
│  M3 Bridge 层平台能力抽象          │
└───────────────────────────────────┘

        M1 ←complements→ M2
        M2 ←complements→ M3
```

关系说明：

- M1⇄M2：AI 请求代理和构建预览都是 banyan 后端对外提供的核心服务机制，互补构成后端完整能力
- M2⇄M3：构建预览产出桌面产物，Bridge 抽象解决产物在不同平台运行时的能力适配，二者互补覆盖从构建到运行的全链路

---

## 后端服务机制

### M1. AI 请求代理机制（SSE 转发）

**✅ 已实施**

前端 AI 请求不直达 xiangdi-server，由 banyan 后端作为代理：前端 -> banyan 后端（读 pages from MongoDB，组装请求）-> xiangdi-server（执行 AI）-> banyan 后端（写 pages to MongoDB）-> 前端（SSE 流式转发）。

**决策链：** xiangdi-server 无状态不访问 DB -> 需要有人负责读写 pages -> banyan 后端已掌握 MongoDB 连接 -> 自然成为代理层 -> 代理层还能做鉴权、限流、日志 -> SSE 转发保持流式体验。

**约束：**

- banyan 后端 AiService 负责 SSE 代理逻辑
- 代理层不修改 AI 返回内容（透传），仅在 done 事件后写入 MongoDB
- 超时、重试、错误处理在代理层统一处理

---

### M2. 构建与预览服务

**✅ 已实施**

banyan 后端提供 build 和 preview 服务：preview 启动临时 Vite dev server 渲染应用，build 执行完整构建流程生成可部署产物。

**决策链：** 低代码平台需要实时预览 -> Vite dev server 提供 HMR -> 构建需要完整打包 + Electron 包装 -> 两个场景共享应用数据但执行流程不同 -> 分为 preview service 和 build service。

**约束：**

- preview 是临时进程，关闭预览即销毁
- build 产物输出到用户指定目录
- 两者共享应用 pages JSON 作为数据源

---

## 平台适配机制

### M3. Bridge 层平台能力抽象

**未实施**

前端通过统一 Bridge 接口调用平台能力（文件系统、对话框、剪贴板等）。Bridge 有多个实现：ElectronBridge（通过 preload 暴露的 contextBridge）和 WebBridge（降级为浏览器 API）。

**决策链：** 前端代码需要平台无关 -> 不能直接调用 Electron API -> Bridge 抽象层屏蔽差异 -> Electron 环境走 IPC，Web 环境走浏览器 API -> 运行时自动选择实现。

**约束：**

- Bridge 接口定义在前端代码中，实现按环境注入
- Bridge 不承载业务逻辑，只做平台能力映射
- 新增平台能力时先定义 Bridge 接口，再分别实现

**反例：**

- 前端直接 window.electron.xxx——Web 环境报错，平台耦合
- 所有平台能力走 HTTP 调后端——增加网络延迟，离线不可用
