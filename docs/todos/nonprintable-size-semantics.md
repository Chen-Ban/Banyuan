# TODO: NonPrintableTextElement 尺寸语义优化

> 创建时间：2025-07-18
>
> 背景：NonPrintableTextElement 是段落末尾的守卫节点，不参与渲染，主要用于空段落时的光标定位。当前实现中 `height` 始终为 0，位置信息（position.y）由布局引擎写入，包围盒通过 `updateBounds()` 以 `controlPoints[0].y - lineHeight` 为起点、lineHeight 为高度计算。逻辑上能自洽，但"不渲染的元素却有包围盒尺寸"这一语义比较别扭。

---

## 现状分析

NonPrintableTextElement 当前的尺寸相关行为：

- `height`：始终为 0（applyLayout 中不再赋值）
- `width`：始终为 0
- `position.y`：由布局引擎按 `currentY + lineHeight - height` 计算，因 height=0 实际等于 `currentY + lineHeight`
- `updateBounds()`：计算出一个 lineHeight 高度的包围盒，用于段落整体包围盒的合并计算
- Worker 端 `computeParagraphBounds`：对 NonPrintable 使用 `minY = el.y - el.lineHeight + el.height`，因 height=0 等价于 `el.y - el.lineHeight`

这套实现能正确工作，但存在语义上的不一致：一个"不可见"的元素贡献了段落包围盒的高度。

## 可能的优化方向

- [ ] **方案 A：让 NonPrintable 不参与包围盒计算**
  - 段落包围盒只由 Printable 元素决定
  - 空段落（只有 NonPrintable）时，包围盒退化为零高度或使用 lineHeight 作为最小高度的特殊逻辑
  - 优点：语义清晰，"不渲染 = 不占空间"
  - 缺点：空段落需要特殊处理，逻辑分支增多

- [ ] **方案 B：给 NonPrintable 一个明确的"占位高度"语义**
  - 引入 `occupiedHeight` 或类似概念，与渲染尺寸 `height` 区分
  - NonPrintable 的 `height` 保持 0（不渲染），但 `occupiedHeight = lineHeight`（参与布局计算）
  - 优点：语义明确，职责分离
  - 缺点：增加概念复杂度，需要同步修改主线程和 Worker 端

- [ ] **方案 C：维持现状，补充注释说明**
  - 在关键位置添加注释，解释为什么 NonPrintable 参与包围盒计算
  - 优点：零改动，零风险
  - 缺点：语义别扭依然存在

## 决策

暂不修改。当前实现虽然语义上不够优雅，但逻辑自洽、行为正确。等后续有更强的驱动力（如空段落交互需求变更、布局性能优化）时再重新评估。

## 关联文件

- `packages/BanvasGL/src/core/graph/text/TextElement.ts`（NonPrintableTextElement 类）
- `packages/BanvasGL/src/workers/handlers/text/TextLayoutEngine.ts`（Worker 端布局引擎）
