# 序列化工具 (Serializer)

序列化工具为BanvasGL提供了完整的对象序列化和反序列化功能，支持核心对象、可实例化图形和可实例化容器的序列化操作。

## 功能特性

### 支持的对象类型

#### 核心对象
- `Scene` - 场景对象
- `Matrix4` - 4x4变换矩阵
- `Point3` - 3D点
- `Vector3` - 3D向量
- `Style` - 样式对象
- `Graph` - 基础图形对象

#### 可实例化图形
- `CombinedGraph` - 组合图形
- `ComplexGraph` - 复杂图形
- `Line` - 线条
- `Circle` - 圆形
- `Arc` - 弧形
- `QuadraticBezier` - 二次贝塞尔曲线
- `CubicBezier` - 三次贝塞尔曲线

#### 可实例化容器
- `CombinedView` - 组合视图
- `GraphView` - 图形视图
- `TextView` - 文本视图
- `ImageView` - 图像视图
- `VideoView` - 视频视图

## 基本用法

### 通用序列化/反序列化

```typescript
import Serializer from './Serializer'

// 序列化任意对象
const json = Serializer.serialize(myObject)

// 反序列化
const obj = Serializer.deserialize(json)
```

### 特定类型的序列化

```typescript
// 序列化组合图形
const graphJson = Serializer.serializeCombinedGraph(combinedGraph)

// 反序列化组合图形
const graph = Serializer.deserializeCombinedGraph(graphJson)

// 序列化组合视图
const viewJson = Serializer.serializeCombinedView(combinedView)

// 反序列化组合视图
const view = Serializer.deserializeCombinedView(viewJson)
```

## 配置选项

```typescript
interface SerializerOptions {
  includeFunctions?: boolean    // 是否包含函数
  includePrivate?: boolean      // 是否包含私有属性
  handleCircularRefs?: boolean  // 是否处理循环引用
  maxDepth?: number            // 最大序列化深度
  customSerializers?: Map<string, (obj: any) => any>     // 自定义序列化器
  customDeserializers?: Map<string, (data: any) => any>  // 自定义反序列化器
}
```

## 使用示例

### 序列化组合图形

```typescript
import { Point3 } from '../math'
import { Style } from '../style'
import CombinedGraph from '../graph/combined/CombinedGraph'
import Line from '../graph/analytic/Line'
import Circle from '../graph/analytic/Circle'

// 创建图形
const line = new Line(new Point3(0, 0, 0), new Point3(100, 100, 0), Style.DEFAULT)
const circle = new Circle(new Point3(50, 50, 0), 25, Style.DEFAULT)

// 创建组合图形
const combinedGraph = new CombinedGraph([line, circle], Style.DEFAULT)

// 序列化
const json = Serializer.serializeCombinedGraph(combinedGraph)

// 反序列化
const restoredGraph = Serializer.deserializeCombinedGraph(json)
```

### 序列化组合视图

```typescript
import CombinedView from '../views/CombinedView'
import GraphView from '../views/GraphView'

// 创建视图
const graphView1 = new GraphView(line)
const graphView2 = new GraphView(circle)
const combinedView = new CombinedView([graphView1, graphView2])

// 序列化
const json = Serializer.serializeCombinedView(combinedView)

// 反序列化
const restoredView = Serializer.deserializeCombinedView(json)
```

### 复杂嵌套结构

```typescript
// 创建嵌套的组合图形
const innerCombined = new CombinedGraph([innerLine, innerCircle], Style.DEFAULT)
const outerCombined = new CombinedGraph([innerCombined, outerLine], Style.DEFAULT)

// 创建包含嵌套图形的视图
const graphView = new GraphView(outerCombined)
const combinedView = new CombinedView([graphView])

// 序列化整个结构
const json = Serializer.serialize(combinedView)

// 反序列化整个结构
const restored = Serializer.deserialize(json)
```

## 高级功能

### 自定义序列化器

```typescript
const serializer = Serializer.getInstance()

// 注册自定义类型
serializer.registerType('MyCustomType', MyCustomClass, {
  serialize: (obj) => ({ /* 自定义序列化逻辑 */ }),
  deserialize: (data) => { /* 自定义反序列化逻辑 */ }
})
```

### 生命周期回调支持

序列化工具支持View对象的生命周期回调函数的序列化：

- `onCreate` - 创建时回调
- `onAttach` - 附加时回调  
- `onDestroy` - 销毁时回调

### 循环引用处理

序列化工具能够自动检测和处理循环引用，避免无限递归。

## 注意事项

1. **抽象类处理**: `Bezier`是抽象类，不能直接序列化，请使用其具体子类如`QuadraticBezier`或`CubicBezier`。

2. **函数序列化**: 默认情况下不序列化函数，如需序列化函数请设置`includeFunctions: true`。

3. **私有属性**: 默认情况下不序列化以`_`开头的私有属性，如需包含请设置`includePrivate: true`。

4. **性能考虑**: 对于大型复杂对象，建议设置合适的`maxDepth`以避免过深的递归。

## 完整示例

查看 `SerializerExample.ts` 文件获取完整的使用示例。