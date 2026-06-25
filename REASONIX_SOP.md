# Reasonix 安装与使用 SOP

> Reasonix 是一款以 DeepSeek 为原生后端的终端编程 Agent，围绕 DeepSeek 的字节稳定前缀缓存（prefix-cache）机制设计，长会话输入 token 成本可压缩至原价 1/5。
>
> GitHub: https://github.com/esengine/DeepSeek-Reasonix
> npm: https://www.npmjs.com/package/reasonix

---

## 一、环境准备

### 1.1 Node.js

Reasonix 基于 Node.js 运行，要求 Node.js >= 22（DeepSeek 官方文档标注最低 20.10，但 npm 包要求 >= 22，建议以 22 为准）。

从 Node.js 官网下载最新 LTS 版本：https://nodejs.org

验证安装：

```bash
node --version   # 应输出 v22.x.x 或更高
npm --version
```

### 1.2 Git（仅 Windows）

Windows 用户需要额外安装 Git for Windows，否则终端可能无法正常运行。macOS / Linux 用户通常已自带 git，无需额外操作。

### 1.3 DeepSeek API Key

访问 DeepSeek 开放平台获取 API Key：https://platform.deepseek.com

新用户注册后会赠送免费额度，足够日常试用。

---

## 二、安装

### 方式一：npx 免安装运行（推荐尝鲜）

```bash
cd /path/to/my-project
npx reasonix code
```

无需全局安装，每次运行自动拉取最新版本。适合想快速试用的场景。

### 方式二：全局安装（推荐日常使用）

```bash
npm install -g reasonix
```

安装后 `reasonix` 命令会在 PATH 中全局可用。直接在任意目录运行：

```bash
reasonix code
```

> 注：全局安装同时会注册一个 `dsnix` 别名，两者等价。

### 方式三：Homebrew（macOS / Linux）

```bash
brew install reasonix
```

---

## 三、首次配置

首次运行 Reasonix 会弹出内置配置向导，引导你完成 API Key 设置：

```bash
reasonix setup
```

或者直接运行 `reasonix code`，首次启动时会自动触发向导。

配置完成后，Key 会持久化保存到 `~/.reasonix/config.json`（或 macOS 下 `~/Library/Application Support/reasonix/config.toml`），后续无需重复输入。

### 环境健康检查

```bash
reasonix doctor
```

检查 Node 版本、网络连通性、API Key 有效性等，排查常见问题。

---

## 四、核心使用模式

### 4.1 项目级编程模式（code）

```bash
cd /path/to/my-project
reasonix code
```

或直接 `reasonix`（无子命令等同于 `reasonix code`）。

进入交互式 TUI 界面后，直接用自然语言描述需求。Reasonix 会自动读取项目文件、执行 Shell 命令、编辑代码。每一步改动都会展示预览（SEARCH/REPLACE 格式），确认后才写入文件。

### 4.2 纯聊天模式（chat）

```bash
reasonix chat
```

不加载项目上下文，适合问技术问题、分析代码片段。类似 ChatGPT 但走你自己的 DeepSeek API，数据不经第三方。

### 4.3 单次任务执行（非交互式）

```bash
reasonix code -p "帮我把所有 console.log 替换为 logger.info"
```

使用 `-p` 参数传入提示词，执行完自动退出。适合 CI/CD 集成或脚本化调用。

---

## 五、TUI 内 Slash 命令

在交互式会话中，输入以 `/` 开头的命令可以切换模式或查看信息：

| 命令          | 说明                                         |
| ------------- | -------------------------------------------- |
| `/help`       | 查看完整 slash 命令参考                      |
| `/pro`        | 下一轮切换到 DeepSeek-V4-Pro（处理复杂任务） |
| `/flash`      | 切换回 DeepSeek-V4-Flash（日常迭代，默认）   |
| `/preset max` | 整个 session 都走 Pro 模型                   |
| `/compact`    | 手动触发上下文压缩（节省 token）             |
| `/cost`       | 查看 token 用量和费用统计                    |
| `/new`        | 开启新会话                                   |
| `/tree`       | 显示项目文件树                               |
| `/branch`     | 显示/切换 Git 分支                           |
| `/switch`     | 切换会话                                     |
| `/skill new`  | 创建自定义技能                               |
| `/keys`       | 查看快捷键绑定                               |

---

## 六、配置文件 reasonix.toml

Reasonix 支持 TOML 格式的配置文件，优先级为：

```
CLI flag > ./reasonix.toml（项目级）> ~/.config/reasonix/config.toml（全局）> 内置默认值
```

macOS 下全局配置位于 `~/Library/Application Support/reasonix/config.toml`。

### 配置文件示例

```toml
# Provider 配置
[provider.deepseek]
api_key = "sk-xxx"           # 也可通过向导设置，无需写在这里
base_url = "https://api.deepseek.com"

# Agent 配置
[agent]
default_model = "deepseek-v4-flash"   # 默认模型
planner_model = "deepseek-v4-pro"     # 规划器模型（双模型协同时使用）

# 权限配置
[permissions]
allow_file_write = true
allow_shell = true
sandbox = false              # 是否启用沙箱模式

# MCP 服务器（可选）
[[mcp_servers]]
name = "my-server"
command = "npx"
args = ["-y", "@my/mcp-server"]
```

---

## 七、内置工具

Reasonix 提供九个内置工具，Agent 会根据需求自动调用：

| 工具         | 说明                 |
| ------------ | -------------------- |
| `read_file`  | 读取文件内容         |
| `write_file` | 写入文件             |
| `edit_file`  | 编辑文件（单处替换） |
| `multi_edit` | 批量编辑文件         |
| `bash`       | 执行 Shell 命令      |
| `ls`         | 列出目录内容         |
| `glob`       | 文件模式匹配搜索     |
| `grep`       | 文本内容搜索         |
| `web_fetch`  | 获取网页内容         |

---

## 八、MCP 扩展

Reasonix 对 MCP（Model Context Protocol）提供一等公民支持，支持 stdio、SSE、Streamable HTTP 三种传输协议。

在 `reasonix.toml` 中声明 MCP 服务器即可扩展 Agent 能力（如数据库操作、Docker 管理等）。

MCP 连接模式（Connect mode）：

- `connect when this mcp is used`（默认）：按需连接
- `Connect in background after session starts`：会话开始后后台连接
- `Connect before chat starts`：聊天开始前连接

---

## 九、Skills 技能系统

Reasonix 支持自定义 Skills（纯文本 Markdown），可以提交到 git 仓库团队共享：

```bash
# 创建新 skill
/skill new

# 查看内置 skills
/skill list
```

Reasonix 还会自动加载 Claude Code 全局配置下的 skill（`~/.claude/skills`），实现跨工具复用。

---

## 十、AGENTS.md 支持

Reasonix 支持读取项目根目录的 `AGENTS.md` 文件作为项目级指令。这意味着本仓库的 `AGENTS.md` 在 Reasonix 中也会被自动加载，Agent 将遵守其中定义的编码规范和禁止事项。

---

## 十一、成本控制与缓存

Reasonix 的核心设计理念是利用 DeepSeek 的前缀缓存机制降低成本：

- 默认使用 DeepSeek-V4-Flash 模型，适合日常编码迭代
- 采用 append-only 对话循环，保持上下文前缀稳定，缓存命中率可达 99%+
- 长会话输入 token 成本约为原价的 1/5
- `/cost` 命令随时查看 token 用量、缓存命中率、花费金额

### 成本优化建议

1. 日常编码用 Flash（默认），只在复杂架构设计时 `/pro` 切换到 Pro
2. 保持长会话而非频繁开启新会话（长会话 = 高缓存命中率 = 低成本）
3. 只在上下文明显膨胀时手动 `/compact`

---

## 十二、其他常用子命令

```bash
reasonix --help          # 查看所有子命令
reasonix replay          # 回放历史会话
reasonix diff            # 查看本次会话产生的代码变更
reasonix events          # 查看事件日志
reasonix stats           # 查看统计信息
reasonix index           # 构建项目索引（CodeGraph 符号/调用图）
reasonix mcp             # MCP 服务器管理
reasonix prune-sessions  # 清理历史会话
```

---

## 十三、常见问题排查

| 问题                  | 解决方案                                     |
| --------------------- | -------------------------------------------- |
| 提示 Node.js 版本过低 | 升级到 Node.js >= 22                         |
| API Key 无效          | 检查 Key 是否过期，重新运行 `reasonix setup` |
| 网络连接失败          | 确认能访问 api.deepseek.com，必要时配置代理  |
| Windows 终端乱码      | 使用 Windows Terminal 或 Git Bash，避免 cmd  |
| 工具调用失败          | Reasonix 内置自动修复机制，通常会自动重试    |

运行 `reasonix doctor` 可以一键诊断大部分环境问题。

---

## 十四、快速上手 Checklist

1. [ ] 安装 Node.js >= 22
2. [ ] 获取 DeepSeek API Key
3. [ ] 运行 `npm install -g reasonix`（或使用 npx）
4. [ ] 运行 `reasonix setup` 完成首次配置
5. [ ] 运行 `reasonix doctor` 确认环境正常
6. [ ] 进入项目目录运行 `reasonix code` 开始编码
7. [ ] 输入 `/help` 了解所有可用命令

---

_文档最后更新：2026-06_
