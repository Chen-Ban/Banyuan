# VideoElement 类

VideoElement 类用于在画布中绘制视频，继承自 Graph 基类。

## 功能特性

- 支持多种视频格式（MP4、WebM、OGV 等）
- 支持跨域视频加载
- 支持视频播放控制（播放、暂停、停止）
- 支持视频变换（旋转、缩放、透明度）
- 支持视频裁剪
- 支持播放选项设置（自动播放、循环、静音）
- 支持音量控制
- 支持占位符显示（视频未加载时）

## 基本用法

```typescript
import { VideoElement, Style, Color, FillStyle, StrokeStyle } from 'banvasgl'

// 创建视频元素
const videoElement = new VideoElement(
  100, 100,        // x, y 位置
  200, 150,        // width, height 尺寸
  'path/to/video.mp4',  // 视频源
  new Style(
    new FillStyle('color', Color.TRANSPARENT),
    new StrokeStyle('color', Color.GREEN, null, null, 2),
    ShadowStyle.NONE
  )
)

// 设置播放选项
videoElement.setPlayOptions({
  autoplay: false,
  loop: true,
  muted: true
})

// 设置变换
videoElement.setRotation(-Math.PI / 6)  // 旋转-30度
videoElement.setScale(0.9, 1.1)         // 缩放
videoElement.setOpacity(0.9)             // 透明度

// 播放视频
videoElement.play()

// 渲染到画布
const ctx = canvas.getContext('2d')
videoElement.render(ctx)
```

## 高级用法

### 视频播放控制

```typescript
// 播放控制
videoElement.play()           // 播放
videoElement.pause()          // 暂停
videoElement.stop()           // 停止

// 时间控制
videoElement.setCurrentTime(30)  // 跳转到30秒
const currentTime = videoElement.getCurrentTime()  // 获取当前时间
const duration = videoElement.getDuration()        // 获取总时长

// 音量控制
videoElement.setVolume(0.5)   // 设置音量为50%
const volume = videoElement.getVolume()  // 获取当前音量
```

### 视频裁剪

```typescript
// 裁剪视频的特定区域
videoElement.setCrop(100, 100, 200, 150)  // 从(100,100)开始裁剪200x150的区域
```

### 从现有视频创建

```typescript
const video = document.createElement('video')
video.src = 'path/to/video.mp4'
video.onloadedmetadata = () => {
  const videoElement = VideoElement.fromVideoElement(video, 0, 0, 200, 150)
}
```

### 获取视频帧数据

```typescript
const imageData = videoElement.getImageData()
if (imageData) {
  // 处理当前帧的像素数据
  console.log('视频帧尺寸:', imageData.width, 'x', imageData.height)
}
```

## 动画循环

由于视频需要持续渲染，建议在动画循环中渲染：

```typescript
function animate() {
  // 清空画布
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  
  // 渲染视频元素
  videoElement.render(ctx)
  
  // 继续动画循环
  requestAnimationFrame(animate)
}

animate()
```

## API 参考

### 构造函数

```typescript
constructor(
  x: number,
  y: number,
  width: number,
  height: number,
  videoSrc: string,
  style?: Style
)
```

### 主要方法

#### 位置和变换
- `setPosition(x: number, y: number)`: 设置位置
- `setSize(width: number, height: number)`: 设置尺寸
- `setRotation(rotation: number)`: 设置旋转角度（弧度）
- `setScale(scaleX: number, scaleY?: number)`: 设置缩放
- `setOpacity(opacity: number)`: 设置透明度
- `setCrop(sourceX: number, sourceY: number, sourceWidth: number, sourceHeight: number)`: 设置裁剪区域

#### 播放控制
- `play()`: 播放视频
- `pause()`: 暂停视频
- `stop()`: 停止视频
- `setCurrentTime(time: number)`: 设置播放时间
- `getCurrentTime()`: 获取当前播放时间
- `getDuration()`: 获取视频总时长
- `setVolume(volume: number)`: 设置音量
- `getVolume()`: 获取音量

#### 播放选项
- `setPlayOptions(options: {autoplay?: boolean, loop?: boolean, muted?: boolean})`: 设置播放选项

#### 其他方法
- `containsPoint(point: Point3)`: 检查点是否在视频内
- `getImageData()`: 获取当前帧的像素数据
- `copy()`: 复制视频元素

### 静态工厂方法

- `VideoElement.fromVideoElement(video: HTMLVideoElement, x: number, y: number, width: number, height: number, style?: Style)`
- `VideoElement.fromCanvas(canvas: HTMLCanvasElement, x: number, y: number, width: number, height: number, style?: Style)`

## 注意事项

1. 视频元素需要在动画循环中持续渲染才能显示动态内容
2. 某些浏览器可能对视频播放有自动播放限制
3. 跨域视频可能需要服务器配置 CORS 头
4. 建议在视频加载完成后再进行播放操作
