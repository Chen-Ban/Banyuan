# 渲染器 (Renderer)

## 概述

渲染器是BanvasGL的核心组件，负责将场景渲染到画布上。它提供了高性能的渲染功能，包括脏区渲染优化。

## 主要功能

### 1. 基础渲染
- 场景渲染
- 画布管理
- 上下文控制

### 2. 脏区渲染优化
脏区渲染是一种性能优化技术，只重绘发生变化的区域，而不是整个画布。

#### 工作原理
1. **场景快照**: 记录上一次渲染的场景状态
2. **变化检测**: 比较当前场景与上次场景的差异
3. **脏区计算**: 计算需要重绘的区域
4. **区域合并**: 合并重叠的脏区以提高效率
5. **选择性渲染**: 只渲染脏区区域

#### 配置选项
```typescript
interface RendererOptions {
    enableDirtyRendering?: boolean        // 启用脏区渲染
    dirtyRenderingThreshold?: number      // 脏区面积阈值 (0-1)
}
```

#### 使用示例
```typescript
// 创建启用脏区渲染的渲染器
const renderer = new Renderer(canvas, {
    enableDirtyRendering: true,
    dirtyRenderingThreshold: 0.5  // 当脏区面积超过50%时全屏重绘
})

// 渲染场景
renderer.render(scene)

// 动态控制脏区渲染
renderer.setDirtyRenderingEnabled(false)  // 禁用
renderer.setDirtyRenderingThreshold(0.3)  // 设置阈值为30%
```

### 3. 性能监控
渲染器提供详细的性能统计信息：

```typescript
const stats = renderer.getStats()
console.log({
    fps: stats.fps,                    // 帧率
    dirtyRegionsCount: stats.dirtyRegionsCount,  // 脏区数量
    enableDirtyRendering: stats.enableDirtyRendering  // 脏区渲染状态
})
```

### 4. 脏区渲染信息
获取脏区渲染的详细状态：

```typescript
const info = renderer.getDirtyRenderingInfo()
console.log({
    enabled: info.enabled,              // 是否启用
    threshold: info.threshold,          // 当前阈值
    lastSceneId: info.lastSceneId,      // 上次场景ID
    dirtyRegionsCount: info.dirtyRegionsCount  // 脏区数量
})
```

## 性能优化建议

### 1. 阈值设置
- **低阈值 (0.1-0.3)**: 适合静态场景，少量元素变化
- **中等阈值 (0.3-0.6)**: 适合一般动态场景
- **高阈值 (0.6-0.9)**: 适合频繁变化的场景

### 2. 使用场景
- **启用脏区渲染**: 场景中有大量静态元素，只有少量元素变化
- **禁用脏区渲染**: 场景变化频繁，大部分区域都需要重绘

### 3. 最佳实践
1. 根据场景特点调整阈值
2. 监控FPS和脏区数量
3. 在性能测试中对比启用/禁用脏区渲染的效果
4. 对于简单场景，可以禁用脏区渲染以减少计算开销

## API 参考

### 构造函数
```typescript
constructor(canvas: HTMLCanvasElement, options?: RendererOptions)
```

### 主要方法
- `render(scene: Scene): void` - 渲染场景
- `setDirtyRenderingEnabled(enabled: boolean): void` - 启用/禁用脏区渲染
- `setDirtyRenderingThreshold(threshold: number): void` - 设置脏区阈值
- `getDirtyRenderingInfo()` - 获取脏区渲染信息
- `getStats()` - 获取渲染统计信息

### 其他方法
- `clear(): void` - 清空画布
- `resize(width: number, height: number): void` - 调整画布大小
- `destroy(): void` - 销毁渲染器
