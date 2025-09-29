# ImageElement 类

ImageElement 类用于在画布中绘制图片，继承自 Graph 基类。

## 功能特性

- 支持多种图片格式（PNG、JPG、GIF、WebP 等）
- 支持跨域图片加载
- 支持图片变换（旋转、缩放、透明度）
- 支持图片裁剪
- 支持占位符显示（图片未加载时）
- 支持像素数据获取

## 基本用法

```typescript
import { ImageElement, Style, Color, FillStyle, StrokeStyle } from 'banvasgl'

// 创建图片元素
const imageElement = new ImageElement(
  100, 100,        // x, y 位置
  200, 150,        // width, height 尺寸
  'path/to/image.jpg',  // 图片源
  new Style(
    new FillStyle('color', Color.TRANSPARENT),
    new StrokeStyle('color', Color.BLUE, null, null, 2),
    ShadowStyle.NONE
  )
)

// 设置变换
imageElement.setRotation(Math.PI / 4)  // 旋转45度
imageElement.setScale(1.2, 0.8)        // 缩放
imageElement.setOpacity(0.8)           // 透明度

// 渲染到画布
const ctx = canvas.getContext('2d')
imageElement.render(ctx)
```

## 高级用法

### 图片裁剪

```typescript
// 裁剪图片的特定区域
imageElement.setCrop(50, 50, 100, 100)  // 从(50,50)开始裁剪100x100的区域
```

### 从现有图片创建

```typescript
const img = new Image()
img.src = 'path/to/image.jpg'
img.onload = () => {
  const imageElement = ImageElement.fromImageElement(img, 0, 0, 200, 150)
}
```

### 获取像素数据

```typescript
const imageData = imageElement.getImageData()
if (imageData) {
  // 处理像素数据
  console.log('图片尺寸:', imageData.width, 'x', imageData.height)
}
```

## API 参考

### 构造函数

```typescript
constructor(
  x: number,
  y: number,
  width: number,
  height: number,
  imageSrc: string,
  style?: Style
)
```

### 主要方法

- `setPosition(x: number, y: number)`: 设置位置
- `setSize(width: number, height: number)`: 设置尺寸
- `setRotation(rotation: number)`: 设置旋转角度（弧度）
- `setScale(scaleX: number, scaleY?: number)`: 设置缩放
- `setOpacity(opacity: number)`: 设置透明度
- `setCrop(sourceX: number, sourceY: number, sourceWidth: number, sourceHeight: number)`: 设置裁剪区域
- `containsPoint(point: Point3)`: 检查点是否在图片内
- `getImageData()`: 获取图片的像素数据
- `copy()`: 复制图片元素

### 静态工厂方法

- `ImageElement.fromImageElement(image: HTMLImageElement, x: number, y: number, width: number, height: number, style?: Style)`
- `ImageElement.fromCanvas(canvas: HTMLCanvasElement, x: number, y: number, width: number, height: number, style?: Style)`
