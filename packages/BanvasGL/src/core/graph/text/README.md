# 文字类系统

本模块实现了三层级的文字类系统，用于在BanvasGL中处理文字渲染和布局。

## 类结构

### 1. Texts（文字集合类）
- **层级**: 最高层级
- **功能**: 管理多个段落，提供整体文字集合的布局和样式控制
- **主要属性**:
  - `paragraphs: TextParagraph[]` - 段落数组
  - `options: TextsOptions` - 文字集合选项
  - `position: Point3` - 位置

### 2. TextParagraph（文字段落类）
- **层级**: 中间层级
- **功能**: 管理段落内的多个文字元素，处理段落级别的布局
- **主要属性**:
  - `texts: TextElement[]` - 文字元素数组
  - `options: ParagraphOptions` - 段落选项
  - `position: Point3` - 位置

### 3. TextElement（文字元素类）
- **层级**: 最低层级
- **功能**: 表示单个文字元素，是最小的文字单位
- **主要属性**:
  - `content: string` - 文字内容
  - `options: TextOptions` - 文字选项
  - `position: Point3` - 位置

## 选项类

### TextsOptions
- `verticalAlign: VERTICALALIGN` - 垂直对齐方式

### ParagraphOptions
- `verticalAlign: HORIZONTALALIGN` - 水平对齐方式
- `leading: number` - 行高
- `letterSpacing: number` - 字母间距
- `preHeight: number` - 段落前高度
- `postHeight: number` - 段落后高度
- `listItemDecoration: Graph | TextElement[] | undefined` - 列表项装饰
- `indentation: number` - 缩进
- `preWidth: number` - 段落前宽度

### TextOptions
- `color: Color` - 文字颜色
- `family: string` - 字体族
- `size: number` - 字体大小
- `style: FontStyle` - 字体样式
- `weight: FontWeight` - 字体粗细

## 使用示例

### 创建简单文字
```typescript
import { Texts, TextElement } from '@/core/element/text'
import { Point3 } from '@/core/math'

// 创建单个文字元素
const textElement = new TextElement(
    "Hello World",
    new Point3(100, 100, 0)
)

// 创建文字集合
const texts = Texts.simple("Hello World", 100, 100)
```

### 创建多段落文字
```typescript
import { Texts, TextParagraph } from '@/core/element/text'

// 创建多行文字
const texts = Texts.multiline(
    "第一行\n第二行\n第三行",
    100, 100, 30
)

// 手动创建段落
const paragraph1 = TextParagraph.simple("第一段", 100, 100)
const paragraph2 = TextParagraph.simple("第二段", 100, 150)
const texts = new Texts(new Point3(100, 100, 0))
texts.addParagraph(paragraph1)
texts.addParagraph(paragraph2)
```

### 设置样式
```typescript
import { TextOptions, ParagraphOptions, TextsOptions } from '@/core/element/text'
import { Color, FontStyle, FontWeight } from '@/constants'

// 设置文字样式
const textOptions = new TextOptions()
    .setColor(Color.RED)
    .setSize(20)
    .setWeight(FontWeight.BOLD)

// 设置段落样式
const paragraphOptions = new ParagraphOptions()
    .setLeading(1.5)
    .setLetterSpacing(2)

// 设置文字集合样式
const textsOptions = new TextsOptions()
    .setVerticalAlign(VERTICALALIGN.CENTER)
```

## 渲染

所有文字类都继承自Graph基类，支持标准的渲染方法：

```typescript
// 渲染文字集合
texts.render(ctx)

// 渲染段落
paragraph.render(ctx)

// 渲染文字元素
textElement.render(ctx)
```

## 工厂方法

每个类都提供了便捷的静态工厂方法：

### Texts
- `Texts.simple(content, x, y, options?)` - 创建简单文字集合
- `Texts.multiline(content, x, y, lineHeight?, options?)` - 创建多行文字集合
- `Texts.center(content, x, y)` - 创建居中对齐文字集合
- `Texts.title(content, x, y, size?)` - 创建标题文字集合
- `Texts.list(items, x, y, itemHeight?)` - 创建列表文字集合

### TextParagraph
- `TextParagraph.simple(content, x, y, options?)` - 创建简单段落
- `TextParagraph.title(content, x, y, size?)` - 创建标题段落
- `TextParagraph.center(content, x, y)` - 创建居中对齐段落
- `TextParagraph.listItem(content, x, y, decoration?)` - 创建列表项段落

### TextElement
- `TextElement.simple(content, x, y, size?, color?)` - 创建简单文字元素
- `TextElement.title(content, x, y, size?)` - 创建标题文字元素
- `TextElement.bold(content, x, y, size?)` - 创建粗体文字元素
- `TextElement.italic(content, x, y, size?)` - 创建斜体文字元素
