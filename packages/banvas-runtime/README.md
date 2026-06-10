# @banyuan/banvas-runtime

> 机制由引擎提供，策略由运行时注入。

`@banyuan/banvas-runtime` 是 Banyuan 的**运行策略层**。它构建在 [`@banyuan/banvasgl`](../banvasgl/README.md) 之上，把「高层交互策略」从图形引擎里分离出来——引擎只提供原子事件机制，运行时负责把这些原子事件识别成点击、拖拽等有语义的交互，并适配到具体宿主环境（Web / Electron）。

这个包会随构建产物进入用户最终部署的 ECS 应用，因此它的职责是保证**设计态与运行态的交互行为完全一致**。它不进入 Banyan 编辑器自身的交互逻辑。

---

## 为什么需要单独一层

BanvasGL 作为运行时，遵循「机制与策略分离」原则（见 [ADR engine/architecture A0](../../docs/adr/README.md)）：

- **机制（BanvasGL 提供）**：原子事件（pointerdown/move/up 等）、几何变换、命中测试、FlowSchema 执行。
- **策略（banvas-runtime 提供）**：把原子事件序列识别成 `click` / `dragstart` / `drag` / `dragend` 等高层交互，并映射到 View 的 `events` 事件键，最终触发对应 FlowSchema。

把策略层独立出来，使得引擎核心保持纯净、可测试，而交互策略可以按宿主环境、按业务需要灵活替换或扩展。

---

## 公共 API

### Hook（React 集成）

| 导出 | 说明 |
|------|------|
| `useRuntimeBanvas` | 在 React 中初始化运行态 BanvasGL App，绑定宿主事件适配与交互识别 |
| `useRuntimeInteraction` | 单独接入交互识别逻辑（已有 App 实例时使用） |

类型：`UseRuntimeOptions`、`UseRuntimeBanvasResult`、`UseRuntimeInteractionOptions`。

### 事件适配器（adapters）

跨平台事件适配：把平台原生事件转换为统一的 `InteractionInput`。

| 导出 | 说明 |
|------|------|
| `WebEventAdapter` / `createWebEventAdapter` | Web/DOM 环境的事件适配器 |
| `EventAdapter`（类型） | 适配器接口契约，可实现其它宿主（如 Electron 原生层） |
| `CoordinateTransform`、`EventAdapterOptions`、`WebEventAdapterOptions`（类型） | 坐标变换与配置 |

### 交互识别器（interaction）

把 `InteractionInput` 序列识别成有语义的交互事件键。

| 导出 | 说明 |
|------|------|
| `InteractionRecognizer` | 交互识别器总入口，聚合各子识别器 |
| `ClickRecognizer` | 点击识别 |
| `DragRecognizer` | 拖拽识别（`DragRecognizerOptions` 可配阈值等） |
| `RecognizedInteraction`、`RuntimeEventKey`（类型） | 识别结果与事件键 |

---

## 依赖关系

```
@banyuan/banvas-runtime ──peerDep──▶ @banyuan/banvasgl
                        ──peerDep──▶ react (>=18)
```

`@banyuan/banvasgl` 与 `react` 均为 **peerDependency**，由宿主应用提供，避免重复打包与实例不一致。

---

## 构建

```bash
pnpm --filter @banyuan/banvas-runtime build   # tsup，ESM + CJS 双出
pnpm --filter @banyuan/banvas-runtime dev     # watch 模式
```

入口统一从 `src/index.ts` 导出，单一公共导出路径 `.`。

---

## 许可证

[AGPL-3.0](../../LICENSE) / 商业授权，详见仓库根目录。
