# 内置物料 JSON（ADR-027 Step 8）

此目录用于存放内置物料的 IMaterial JSON 快照文件。

## 迁移说明

当自定义物料链路（serialize / instantiate / 面板拖拽 / 参数填充）验证稳定后，
通过迁移脚本将 `viewCreateStrategies.ts` 中的 13 个内置策略函数转换为 IMaterial JSON：

```bash
# 迁移脚本（待开发）
pnpm --filter @banyuan/banvasgl run migrate:materials
```

## 文件规划

每个内置物料对应一个 JSON 文件：

- `line.json`
- `circle.json`
- `rounded-rect.json`
- `text.json`
- `image.json`
- `cubic-bezier.json`
- `quadratic-bezier.json`
- `triangle.json`
- `regular-polygon.json`
- `arc.json`
- `flex.json`
- `video.json`

## 前置条件

- [ ] Step 4 serialize/instantiate 经过运行时验证
- [ ] Step 6 前端面板拖拽创建验证通过
- [ ] 迁移脚本编写并生成所有 JSON
- [ ] 回归测试：13 个内置物料创建结果与旧策略一致
