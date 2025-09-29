# View Addons

View Addons 是View类的扩展插件系统，用于为View提供特定的功能和行为。

## 插件类型

### 1. ViewportAddon (视口插件)

视口插件定义视图的视口区域，始终基于当前view的本地矩阵下的(0,0)点。

```typescript
interface ViewportAddon {
    width: number
    height: number
    [key: string]: any
}
```

**特点：**
- 不包含x, y坐标，始终基于(0,0)
- 只定义视口的宽度和高度
- 支持额外的自定义属性

**使用示例：**
```typescript
const viewport = new ViewportAddonImpl(800, 600)
view.setViewport(viewport)
```

### 2. BoundingBoxAddon (边界框插件)

边界框插件定义视图的边界框，包含padding和margin属性。

```typescript
interface BoundingBoxAddon {
    width: number
    height: number
    padding: {
        top: number
        right: number
        bottom: number
        left: number
    }
    margin: {
        top: number
        right: number
        bottom: number
        left: number
    }
    [key: string]: any
}
```

**特点：**
- 不包含x, y坐标
- 包含padding和margin属性
- 提供内容区域和总尺寸的计算方法

**使用示例：**
```typescript
const boundingBox = new BoundingBoxAddonImpl(
    200, 100,  // width, height
    { top: 10, right: 10, bottom: 10, left: 10 },  // padding
    { top: 5, right: 5, bottom: 5, left: 5 }       // margin
)
view.setBoundingBox(boundingBox)
```

### 3. VertexAddon (顶点插件)

顶点插件定义视图的顶点集合，使用Point3数组。

```typescript
interface VertexAddon {
    vertices: Point3[]
    [key: string]: any
}
```

**特点：**
- vertices属性使用Point3[]类型
- 提供顶点的增删改查方法
- 支持边界框计算

**使用示例：**
```typescript
const vertices = [
    new Point3(0, 0, 0),
    new Point3(100, 0, 0),
    new Point3(100, 100, 0),
    new Point3(0, 100, 0)
]
const vertexAddon = new VertexAddonImpl(vertices)
view.setControlPoints(vertexAddon)
```

## 插件实现类

每个插件都有对应的实现类：

- `ViewportAddonImpl` - 视口插件实现
- `BoundingBoxAddonImpl` - 边界框插件实现  
- `VertexAddonImpl` - 顶点插件实现

## 主要方法

### ViewportAddonImpl
- `setSize(width, height)` - 设置视口尺寸
- `getSize()` - 获取视口尺寸
- `containsPoint(x, y)` - 检查点是否在视口内
- `copy()` - 复制插件

### BoundingBoxAddonImpl
- `setSize(width, height)` - 设置边界框尺寸
- `setPadding(top, right, bottom, left)` - 设置padding
- `setMargin(top, right, bottom, left)` - 设置margin
- `getContentSize()` - 获取内容区域尺寸（减去padding）
- `getTotalSize()` - 获取总尺寸（包含margin）
- `containsPoint(x, y)` - 检查点是否在边界框内
- `containsPointInContent(x, y)` - 检查点是否在内容区域内
- `copy()` - 复制插件

### VertexAddonImpl
- `addVertex(vertex)` - 添加顶点
- `addVertices(vertices)` - 添加多个顶点
- `removeVertex(index)` - 移除顶点
- `getVertexCount()` - 获取顶点数量
- `getVertex(index)` - 获取指定索引的顶点
- `setVertex(index, vertex)` - 设置指定索引的顶点
- `clear()` - 清空所有顶点
- `getVertices()` - 获取顶点数组的副本
- `getBounds()` - 计算边界框
- `copy()` - 复制插件

## 使用建议

1. **视口插件** - 用于定义View的渲染区域
2. **边界框插件** - 用于定义View的布局和间距
3. **顶点插件** - 用于定义View的控制点或路径

所有插件都支持额外的自定义属性，可以根据具体需求进行扩展。
