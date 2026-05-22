# 为什么你写的 1px 不是 1 个像素？从一块屏幕到八种单位的故事

> 物理像素、pt、dp、CSS px、DPR、rpx、rem、vw……为什么"像素"这个词衍生出了如此多的变体？为什么同样写 `width: 100px`，在不同设备上表现却不同？本文从屏幕硬件的发展脉络出发，逐层拆解前端/客户端尺寸体系的来龙去脉，帮助开发者建立完整的心智模型。

---

## 一、起点：一个像素就是一个像素的年代

上世纪 90 年代到 2000 年代中期，显示器的世界很简单。CRT 显示器和早期 LCD 基本锁定在 72～96 DPI（Dots Per Inch，每英寸点数，表示每英寸长度内排列多少个像素点，数值越大画面越精细），无论是 15 英寸还是 17 英寸，像素密度相差无几。在这个时期：

- 1 个物理发光点 = 1 个操作系统像素 = 1 个 CSS 像素
- Windows 假设屏幕是 96 DPI，macOS 假设 72 DPI
- 开发者写 `font-size: 12px`，在所有人的屏幕上看到的物理大小几乎一致

那时没有"逻辑像素"的概念，因为不需要。所有坐标系是统一的，所见即所得。Web 页面流行固定宽度布局（960px 栅格），桌面应用直接用像素坐标定位控件，一切都工作得很好。

这个阶段的隐含假设是：**像素密度是常量。**

---

## 二、第一次碎片化：密度爆炸与第一层抽象的诞生

### 2.1 Retina 的冲击

2010 年，iPhone 4 发布，带来了 Retina 显示屏。同样 3.5 英寸的屏幕，物理分辨率从 320×480 翻倍到 640×960，PPI（Pixels Per Inch，每英寸像素数）从 163 跃升至 326。PPI 和 DPI 在描述屏幕时含义基本相同，都表示像素密度。区别在于 DPI 最初来自印刷领域（描述打印墨点密度），后来被 Windows 等系统沿用来描述屏幕；而 PPI 更严谨地专指屏幕像素密度。在本文中两者可视为等价。

> **关于"分辨率"一词的说明：** "分辨率"在日常中常被混用。严格来说，它指的是屏幕在水平和垂直方向上各有多少个像素（即像素总数，如 640×960）。本文中我们区分两个概念：**物理分辨率**指屏幕实际拥有的硬件发光点数量（如 640×960 个物理像素）；**逻辑分辨率**指操作系统向上层报告的坐标系尺寸（如 320×480 pt）。两者的比值就是缩放因子。另外需要注意，"分辨率"有时也被误用来指代像素密度（PPI），但这是两个独立的概念——一块 5 英寸 1080×1920 的屏幕和一块 6.5 英寸 1080×1920 的屏幕，物理分辨率相同（都有 1080×1920 个物理像素），但由于物理尺寸不同，PPI（密度）也不同——5 英寸的那块像素排列更紧密，PPI 更高。

苹果面临一个现实问题：App Store 里已有几十万个 App，它们都基于 320×480 的坐标系开发（在 1:1 的旧时代，这既是物理分辨率也是逻辑分辨率）。如果直接让 App 面对 640×960 的新坐标系，所有现有 UI 会缩成原来的四分之一面积——按钮小到无法点击，文字小到无法阅读。

苹果的解决方案是引入 **Scale Factor（缩放因子）** 和 **pt（point）** 作为逻辑单位：

- 屏幕逻辑分辨率仍然报告为 320×480 pt
- 每个 pt 背后由 2×2 = 4 个物理像素渲染
- Scale Factor = 2（即 @2x）
- 现有 App 代码不改一行，布局完全不变，只是每个逻辑像素渲染得更精细

这就是 **第一层抽象** 的起源：

> **物理像素 ÷ 缩放因子 = 逻辑像素**

### 2.2 Android 的 dp 体系

Android 阵营面临更严峻的碎片化。不像苹果可以控制硬件，Android 设备从 120 DPI 的廉价机到 640 DPI 的旗舰机什么都有。Google 的方案是定义 **dp（density-independent pixel，密度无关像素）**——一种与屏幕物理密度解耦的逻辑长度单位。以 160 DPI 为基准密度（在 160 DPI 的屏幕上，1dp 恰好等于 1 个物理像素），并划定密度档位：

| 密度档位 | DPI 范围 | 缩放因子 | 1dp 对应物理像素 |
|---------|---------|---------|---------------|
| ldpi | ~120 | 0.75 | 0.75 |
| mdpi | ~160 | 1.0 | 1 |
| hdpi | ~240 | 1.5 | 1.5 |
| xhdpi | ~320 | 2.0 | 2 |
| xxhdpi | ~480 | 3.0 | 3 |
| xxxhdpi | ~640 | 4.0 | 4 |

开发者用 dp 写布局，系统根据当前设备的 density 自动换算到物理像素。图片资源按密度档位提供多套（drawable-mdpi、drawable-xxhdpi...）。

### 2.3 Windows 与 macOS 的跟进

Windows 从 XP 时代就有基本的 DPI 设置（可手动调整系统 DPI 来放大字体和 UI），但真正的系统级自动缩放是从 Vista 开始的——Vista 引入了 DPI 虚拟化（DPI Virtualization），由桌面窗口管理器（DWM）对不支持 DPI 感知的应用进行自动位图缩放。基准仍然是 96 DPI（1x），用户可以在设置中选择 125%、150%、200% 等缩放级别。Windows 称其逻辑单位为 **DIP（Device Independent Pixel，设备无关像素）**，含义与 Android 的 dp 相同——都是经过缩放因子换算后、与物理密度解耦的逻辑坐标单位。

macOS 在 2012 年引入 Retina MacBook Pro 时采用了固定 2x 的策略，逻辑坐标系用 pt 表示。

### 2.4 小结：第一层抽象解决了什么

这一层抽象的本质是：**屏幕密度对开发者透明化。** 无论设备 PPI 是 160 还是 460，开发者面对的逻辑画布大小稳定，一个 44pt/44dp 的按钮在任何设备上的物理尺寸（毫米数）大致相同，保证了可点击性和可读性。

操作系统做了"翻译"的工作：向下对接硬件的物理像素，向上暴露统一的逻辑像素。

---

## 三、第二次碎片化：尺寸分裂与第二层抽象的诞生

### 3.1 新的矛盾

第一层抽象解决了密度问题，但很快新的碎片化出现了——**设备物理尺寸和逻辑分辨率的多样化。**

以 iOS 为例，逻辑宽度经历了这样的演变：

| 年份 | 设备 | 逻辑宽度(pt) |
|------|------|-------------|
| 2007 | iPhone 初代 | 320 |
| 2014 | iPhone 6 | 375 |
| 2014 | iPhone 6 Plus | 414 |
| 2020 | iPhone 12 mini | 375 |
| 2022 | iPhone 14 Pro | 393 |
| 2024 | iPhone 16 Pro Max | 440 |

Android 更加碎片化，逻辑宽度从 320dp 到 480dp 甚至更宽的平板，数十种规格并存。

这意味着：**即使你用逻辑像素（dp/pt）写布局，同样写 `width: 375pt` 的元素在 320pt 宽的设备上会溢出，在 440pt 宽的设备上又留白过多。** 第一层抽象保证了"元素物理大小一致"，但无法保证"布局比例在不同尺寸设备上一致"。

### 3.2 适配方案的涌现

这个矛盾催生了第二层抽象——各种"设计稿归一化"方案。它们的核心思想一致：**把不同的逻辑分辨率映射到一个固定的设计基准宽度，用比例代替绝对值。**

#### 微信小程序的 rpx

小程序定义了 **rpx（responsive pixel，响应式像素）** 作为布局单位，规定：**任何设备的屏幕宽度 = 750rpx。** 在 iPhone SE（逻辑宽度 375pt）上，1rpx = 0.5px；在 iPhone 15 Pro Max（逻辑宽度 393pt）上，1rpx = 0.524px。

换算公式：`1rpx = 设备逻辑宽度 / 750 CSS px`

设计师按 750px 宽出图，开发者直接量标注写 rpx，框架在运行时动态换算。开发者不需要知道当前设备的逻辑宽度是多少。

#### rem 适配方案

**rem（root em）** 是 CSS 中的相对长度单位，表示相对于根元素（`<html>`）的 `font-size` 的倍数。以淘宝的 flexible 方案为代表，核心操作是在运行时将 html 的 `font-size` 设为 `屏幕逻辑宽度 / 10`：

```javascript
document.documentElement.style.fontSize = window.innerWidth / 10 + 'px';
```

在 375px 宽的设备上，`1rem = 37.5px`；在 414px 宽的设备上，`1rem = 41.4px`。设计稿 750px 宽，一个标注为 200px 的元素写成 `width: 2.667rem`（200 / 75），在任何宽度的设备上都占据屏幕宽度的 26.67%。

#### vw 方案

**vw（viewport width）** 是 CSS 原生提供的视口单位，其中 viewport（视口）指的是浏览器中实际显示网页内容的区域。`1vw = 视口宽度的 1%`，`100vw = 满屏宽`。配合 PostCSS 插件（如 postcss-px-to-viewport），可以在构建时自动将设计稿的 px 值转换为 vw：

```css
/* 设计稿 750px 宽，元素 200px */
/* 转换后 */
width: 26.667vw; /* 200 / 750 * 100 */
```

#### Flutter 的 MediaQuery 与自适配

Flutter 的 logical pixel 类似于 iOS 的 pt。面对不同逻辑宽度，Flutter 提供 `MediaQuery.of(context).size.width` 获取当前逻辑宽度，开发者可以基于此做比例计算，或使用 `LayoutBuilder`、`FractionallySizedBox` 等组件做响应式布局。社区也有 `flutter_screenutil` 等库提供类似 rpx 的适配能力。

### 3.3 小结：第二层抽象解决了什么

这一层本质上是一个线性映射：

> **适配单位值 = 逻辑像素值 × (设计基准宽度 / 当前设备逻辑宽度)**

它解决的是"不同逻辑分辨率之间的布局一致性"问题。设计师只需要在一个固定画布（如 750px）上工作，开发者按标注写代码，运行时框架自动做等比缩放。

---

## 四、Web 的特殊性：DPR 是最终合成比值

前两章讲完了两层抽象的诞生（物理→逻辑→适配单位），这套模型在原生开发中已经足够清晰。但如果你是 Web 开发者，还需要理解一个额外的复杂性：浏览器暴露的 DPR 并不直接等于操作系统的缩放因子。

### 4.1 CSS 像素的定义

CSS 规范对 px 的定义是：**一个"参考像素"，等于在 96 DPI 屏幕上、一臂距离（约 71cm）观看时，1 个物理像素所对应的视角。** 这是一个基于视觉感知的定义，与物理像素没有固定比例关系。

实际上，在 `<meta name="viewport" content="width=device-width">` 设置下，移动端的 CSS px 与操作系统的逻辑像素（pt/dp）数值上是一致的。但这个等式在桌面端会被打破。

### 4.2 devicePixelRatio 的真实含义

浏览器暴露的 `window.devicePixelRatio`（简称 **DPR**，设备像素比）是一个**最终的合成比值**，它直接回答一个问题：**1 个 CSS 像素对应多少个物理像素？**

DPR 的值由系统缩放因子和浏览器页面缩放级别共同决定：

> **DPR = 系统缩放因子 × 浏览器页面缩放级别**

但对开发者来说，不需要分别感知这两个因子——DPR 本身就是最终结果，是唯一需要关心的比值。它不是"叠加在系统缩放之上的额外缩放"，而是**替代**了系统缩放因子的角色，直接告诉你 CSS 像素到物理像素的换算关系。

举例：一台 Windows 笔记本，系统缩放 150%（Scale Factor = 1.5），浏览器默认 100% 缩放时 DPR = 1.5。用户按 Ctrl+ 放大到 125%，DPR 变为 1.875。对开发者而言，只需要用这个最终的 DPR 值——Canvas 缓冲区大小 = CSS 尺寸 × DPR，不需要额外再乘系统缩放因子，因为 DPR 已经包含了它。

这也意味着 DPR 是"动态"的，会随用户的浏览器缩放实时变化。如果你用它来决定 Canvas 缓冲区大小或图片资源选择，需要监听其变化。

### 4.3 移动端为何可以混淆

在移动端，viewport meta 标签通常配合 `user-scalable=no` 锁住了用户缩放，浏览器缩放级别始终为 1，所以 DPR 恒等于系统 Scale Factor。这就是为什么大量文章把 DPR 和缩放因子当成同一个东西——在移动端确实如此，但这是一个巧合而非定义。在桌面端，两者会因为浏览器缩放而分离，DPR 成为真正的"最终比值"。

---

## 五、需要"穿透"抽象层的场景

日常开发中，只关心逻辑像素/适配单位确实够用。但有几个场景你必须"穿透"抽象层，感知底层的物理像素或 DPR：

### 5.1 位图资源

位图（PNG、JPG）的每个像素是固定的。一张 100×100 的图片在 CSS 中显示为 100×100 px，在 DPR=3 的设备上实际要填充 300×300 个物理像素。图片会被拉伸 3 倍，产生模糊。解决方案是提供多倍图（@2x、@3x）或使用矢量格式（SVG）。

### 5.2 Canvas 渲染

理解 Canvas 尺寸的关键是：**把 Canvas 看作一块独立的"虚拟屏幕"。** 它有自己固有的像素网格（由 `canvas.width`/`canvas.height` 定义），跟真实屏幕的物理像素没有任何自动关联。`canvas.width` 定义的不是物理像素，也不是逻辑像素，而是这块虚拟屏幕的**缓冲区像素数**——你可以把它设为任意值。

CSS 的 `style.width`/`style.height` 则决定了"把这块虚拟屏幕摆在页面上占多大的区域"。浏览器会把缓冲区内容拉伸或压缩到这块 CSS 区域中。所以这条链路上有两次缩放是你手动控制的：

1. **缓冲区 → CSS 区域**：由 `canvas.width` 与 `style.width` 的比值决定
2. **绘制坐标 → 缓冲区**：由 `ctx.scale()` 决定

操作系统再帮你完成最后一步：CSS 像素 → 物理像素。

如果 `canvas.width` 等于 CSS 宽度的像素数（如都是 200），在 DPR=2 的屏幕上，200 个缓冲区像素会被映射到 400 个物理像素——每个缓冲区像素撑两个物理像素，画面就糊了。正确做法是让缓冲区像素数 = CSS 尺寸 × DPR，使缓冲区像素与物理像素 1:1 对应：

```javascript
const dpr = window.devicePixelRatio;
canvas.width = displayWidth * dpr;
canvas.height = displayHeight * dpr;
canvas.style.width = displayWidth + 'px';
canvas.style.height = displayHeight + 'px';
ctx.scale(dpr, dpr);
```

最后的 `ctx.scale(dpr, dpr)` 是为了让绘制指令仍然使用逻辑坐标（比如画一条从 0 到 100 的线，不需要因为缓冲区变大而改成 0 到 200），相当于在虚拟屏幕内部又建了一套逻辑坐标系——跟操作系统对真实屏幕做的事情是完全一样的思路。

### 5.3 1px 边框问题

设计师要求的"1像素细线"往往指的是 1 个物理像素。但 CSS 的 `border: 1px` 在 DPR=2 的设备上会渲染为 2 个物理像素宽，视觉上偏粗。常见解法包括：

- `border: 0.5px`（部分浏览器支持）
- `transform: scaleY(0.5)` 配合伪元素
- 使用 SVG 或 box-shadow 模拟

### 5.4 亚像素渲染与非整数 DPR

Windows 常见的 125%、150% 缩放导致 DPR 为 1.25、1.5。此时 1 个 CSS px 的边界无法精确对齐到物理像素网格。比如 DPR=1.5 时，一个 1px 宽的元素占 1.5 个物理像素，渲染引擎只能做抗锯齿处理，视觉上呈现为一条略微模糊的线。文字渲染也会受影响。

---

## 六、完整的映射链路

从最底层的硬件到开发者写下的代码，完整的转换链路如下：

```
┌─────────────────────────────────────────────────────────┐
│ 第零层：物理世界                                          │
│ 屏幕面板的发光单元、PPI、对角线英寸                         │
│ 关注方：屏幕制造商                                        │
└─────────────────────┬───────────────────────────────────┘
                      │  ÷ Scale Factor (@2x, density, DPI/96)
                      ▼
┌─────────────────────────────────────────────────────────┐
│ 第一层：操作系统逻辑像素                                   │
│ iOS pt / Android dp / Windows DIP / macOS pt / CSS px    │
│ 关注方：操作系统、浏览器、应用框架                          │
│ 解决的问题：密度碎片化                                     │
└─────────────────────┬───────────────────────────────────┘
                      │  × (设备逻辑宽度 / 设计基准宽度)
                      ▼
┌─────────────────────────────────────────────────────────┐
│ 第二层：适配单位                                          │
│ rpx / rem / vw / flutter_screenutil                      │
│ 关注方：前端框架、小程序运行时、设计师                      │
│ 解决的问题：尺寸碎片化                                     │
└─────────────────────────────────────────────────────────┘
```

每一层抽象都是被下一轮硬件碎片化"逼"出来的。第一层因密度碎片化而生，第二层因尺寸碎片化而生。

---

## 七、实践指南

### 7.1 如何选择适配方案

**移动端 H5 / 小程序**：如果设计稿是固定宽度（如 750px）且以等比缩放为主要策略，vw 方案或 rpx 是最直接的选择。rem 方案由于需要运行时设置 font-size，在某些边界场景（iframe 嵌套、第三方组件库）下可能有冲突。

**响应式 Web（兼顾桌面和移动）**：不适合纯等比缩放（桌面上文字放太大），应该用 CSS px + 媒体查询断点 + 弹性布局（Flexbox/Grid）+ clamp() 函数做分段适配。

**原生 App**：直接使用 dp/pt 即可，配合 Auto Layout（iOS）或 ConstraintLayout（Android）做弹性布局。只在需要严格等比还原设计稿时才引入 screenutil 类方案。

**Canvas / 图形引擎**：坐标系用逻辑像素，缓冲区乘以 DPR，渲染前 `ctx.scale(dpr, dpr)`。监听 DPR 变化（用户拖动窗口到不同缩放率的显示器时会变）并重新初始化。

### 7.2 常见陷阱

- **不要把 DPR 当常量缓存。** 用户可能随时调整浏览器缩放或把窗口拖到外接显示器。用 `matchMedia('(resolution: Xdppx)')` 监听变化。
- **不要在 rem 方案中给 html 设置 `overflow: hidden`。** 部分安卓浏览器地址栏收缩时会触发 resize，导致 font-size 重算和页面闪烁。
- **注意 viewport 的 `initial-scale`。** 如果设为 0.5，等于把布局视口放大了 2 倍，DPR 也会跟着变。这是早期 rem 方案利用的 trick，但会导致第三方组件（如地图 SDK）渲染异常。
- **图片优先用 `srcset` 和 `sizes` 属性。** 让浏览器根据 DPR 和视口宽度自动选择最合适的资源，而不是用 JS 手动判断。

---

## 八、结语

尺寸体系的演进反映了一个朴素的工程规律：**当底层多样性不可控时，就在上层建立抽象来屏蔽差异。** 从物理像素到 pt/dp，是对密度差异的屏蔽；从 pt/dp 到 rpx/vw，是对尺寸差异的屏蔽。每一层抽象都让开发者能在一个"理想化"的坐标系中工作，而把复杂性下沉给系统或框架。

理解这个分层结构之后，面对任何尺寸问题，你只需要问自己两个问题：

1. **我当前在哪一层？** 是在处理 Canvas 缓冲区（需要感知 DPR 来决定缓冲区大小），还是在写页面布局（逻辑像素够用），还是在做多设备适配（需要适配单位）？
2. **我需要穿透到下一层吗？** 大部分时候不需要，但涉及位图清晰度、精细绘制、亚像素对齐时，你必须感知底层。

想清楚这两个问题，尺寸适配就从一团乱麻变成了一条清晰的链路。

---

## 九、实战：BanvasGL 画布引擎的样式尺寸独立化

> 以下记录了 BanvasGL 画布引擎在引入"CSS 样式尺寸与逻辑尺寸分离"过程中遇到的真实问题、决策和解决方案。

### 9.1 背景：为什么要独立设置样式尺寸

BanvasGL 是一个 2D 画布引擎，此前 Canvas 的逻辑尺寸（`canvas.width/height`，决定绘制坐标系）和 CSS 样式尺寸（`canvas.style.width/height`，决定 DOM 中的显示大小）始终保持 `1:DPR` 的固定比例。这意味着画布在页面上的显示大小完全由逻辑尺寸决定，无法独立缩放。

但我们需要实现一个常见需求：**Cmd/Ctrl + 滚轮缩放画布视图**——用户滚动滚轮时，画布在页面中"变大"或"变小"，但逻辑坐标系不变（JSON IR 中的坐标不受影响）。这本质上就是：**逻辑尺寸不变，只改变 CSS 样式尺寸。**

于是我们做了第一个决策：

> **决策 1：CSS 样式尺寸由独立的缩放系统控制，逻辑尺寸始终等于用户配置的页面尺寸 × DPR。**

### 9.2 useCanvasZoom：contain 适配 + 滚轮缩放

我们实现了一个 `useCanvasZoom` hook，核心逻辑：

- **初始化**：按 contain 策略（长边适配容器）计算 `initialScale`，使画布刚好完整显示在容器内
- **交互**：Cmd/Ctrl + Wheel 驱动 `scale` 变化，范围约束在 `[0.1, 5]`
- **输出**：`styleWidth = pageWidth × scale`，`styleHeight = pageHeight × scale`

```ts
function calcContainScale(pageWidth, pageHeight, containerWidth, containerHeight) {
    return Math.min(containerWidth / pageWidth, containerHeight / pageHeight);
}
```

这里需要容器的宽高来计算 contain 适配，引出了下一个问题。

### 9.3 问题一：容器尺寸从哪里来？

最初的方案是让**消费端**（如 `ApplicationDetail` 页面组件）通过 ResizeObserver 测量容器尺寸，然后作为 `containerWidth/containerHeight` 参数传给 hook。

这带来了几个问题：

1. 消费端需要写一堆与画布逻辑无关的测量代码（callback ref + ResizeObserver + state）
2. hook 内部已经有一个 wrapper div，消费端又在外面套了一层用于测量的 div，层级冗余
3. hook 的 API 变得更复杂——消费端本不应该关心"容器尺寸"这种内部实现细节

> **决策 2：容器尺寸由 hook 内部自测量，消费端不需要传 `containerWidth/containerHeight`。**

实现方式：hook 内部的 wrapper div 设为 `width: 100%; height: 100%`，通过 callback ref 在 DOM 挂载时立即测量一次，并用 ResizeObserver 持续监听尺寸变化：

```tsx
const mergedContainerRef = useCallback((node: HTMLDivElement | null) => {
    if (roRef.current) { roRef.current.disconnect(); roRef.current = null; }
    zoomContainerRef(node);
    if (!node) return;

    // 立即测量
    const { width, height } = node.getBoundingClientRect();
    if (width > 0 && height > 0) {
        setContainerSize({ width: Math.floor(width), height: Math.floor(height) });
    }

    // 持续监听
    const ro = new ResizeObserver((entries) => { /* 更新 containerSize */ });
    ro.observe(node);
    roRef.current = ro;
}, [zoomContainerRef]);
```

**为什么用 callback ref 而不是 `useRef` + `useEffect`？** 因为 `useEffect` 的执行时机是 commit 阶段之后，如果 DOM 结构复杂或存在条件渲染，`useRef.current` 在 effect 运行时可能仍为 null。Callback ref 在 React 将 DOM 节点挂载（或卸载）时**同步**调用，保证拿到的是真实的 DOM 节点，立即测量不会拿到 0。

### 9.4 问题二：wrapper 的职责归属

之前消费端（`ApplicationDetail`）有一个 `.canvasArea` 的 div，负责：

- `flex: 1` 撑满剩余空间
- `display: flex; align-items: center; justify-content: center` 居中画布
- `overflow: auto` 缩放超出时可滚动

而 hook 内部也有自己的 wrapper div。两层 div 功能重叠。

> **决策 3：hook 内部的 wrapper 承担全部容器职责（撑满、居中、滚动），消费端不再需要额外的画布容器 div。**

hook 的 wrapper 样式最终为：

```tsx
style={{
    position: 'relative',
    overflow: 'auto',
    width: '100%',
    height: '100%',
    flex: 1,
    minHeight: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
}}
```

- `width: 100%; height: 100%`：初始撑满父容器，作为 ResizeObserver 的测量基准
- `flex: 1; minHeight: 0`：在 flex column 父容器中正确撑满（`minHeight: 0` 防止 flex 子项被内容撑大）
- `display: flex; align-items: center; justify-content: center`：画布居中
- `overflow: auto`：缩放放大超出容器时出现滚动条

消费端只需把 `{Banvas}` 直接放在布局中，不再套额外的 wrapper。

### 9.5 问题三：点击坐标偏移——event2Point 的失效

引入独立样式尺寸后，出现了一个 bug：**点击画布时，实际命中的位置和期望的位置不一致。**

原因分析：原来的坐标转换函数是这样的：

```ts
const event2Point = (e: MouseEvent): Point3 => {
    const ratio = window.devicePixelRatio;
    return new Point3(e.offsetX * ratio, e.offsetY * ratio, 0);
};
```

它假设 `canvas.style.width = canvas.width / DPR`，即 CSS 样式尺寸与逻辑尺寸之间只存在 DPR 这一个比例关系。所以 `offsetX × DPR` 就能从 CSS 坐标正确换算到缓冲区像素坐标。

但现在 CSS 样式尺寸 = `pageWidth × scale`，而缓冲区像素 = `pageWidth × DPR`。两者之间的比值不再是 DPR，而是 `DPR / scale`。用硬编码的 DPR 做换算自然会偏。

具体数学推导：

```
offsetX 的范围是 [0, canvas.style.width] = [0, pageWidth × scale]
缓冲区坐标的范围是 [0, canvas.width] = [0, pageWidth × DPR]

正确换算：bufferX = offsetX × (canvas.width / canvas.clientWidth)
                   = offsetX × (pageWidth × DPR) / (pageWidth × scale)
                   = offsetX × DPR / scale

旧代码：  bufferX = offsetX × DPR    ← 只在 scale=1 时正确
```

> **决策 4：`event2Point` 从 canvas 元素本身动态获取换算比，不再硬编码 DPR。**

修复后：

```ts
const event2Point = (e: MouseEvent): Point3 => {
    const canvas = e.target as HTMLCanvasElement;
    const scaleX = canvas.width / canvas.clientWidth;
    const scaleY = canvas.height / canvas.clientHeight;
    return new Point3(e.offsetX * scaleX, e.offsetY * scaleY, 0);
};
```

`canvas.width / canvas.clientWidth` 这个比值天然包含了 DPR 和 CSS 缩放两个因素，无论样式如何变化都能正确换算。同理，拖拽创建元素时用 `getBoundingClientRect` + `(clientX - rect.left) × (canvas.width / rect.width)` 替代了原来的硬编码 DPR 方案。

### 9.6 总结：三层尺寸的分离

经过这次重构，BanvasGL 的画布尺寸体系清晰地分为三层：

```
┌────────────────────────────────────────────────┐
│ 缓冲区像素 (canvas.width × canvas.height)        │
│ = pageWidth × DPR  ×  pageHeight × DPR          │
│ 决定：绘制精度，与物理像素 1:1 对应               │
├────────────────────────────────────────────────┤
│ 逻辑坐标系 (ctx.scale(dpr, dpr) 后的坐标)        │
│ = pageWidth × pageHeight                         │
│ 决定：JSON IR 坐标、图形基元位置、碰撞检测        │
├────────────────────────────────────────────────┤
│ CSS 样式尺寸 (canvas.style.width/height)         │
│ = pageWidth × scale  ×  pageHeight × scale       │
│ 决定：画布在页面中的视觉大小                      │
│ 由 useCanvasZoom 的 contain 适配 + 滚轮控制       │
└────────────────────────────────────────────────┘
```

坐标转换的正确公式：

```
CSS 坐标 → 缓冲区坐标：  offsetX × (canvas.width / canvas.clientWidth)
缓冲区坐标 → 逻辑坐标：  bufferX / DPR  （由 ctx.scale(dpr,dpr) 隐式完成）
```

关键收获：当你将 CSS 样式尺寸从逻辑尺寸中解耦出来独立控制时，所有依赖"样式尺寸/逻辑尺寸 = 1/DPR"这个隐含假设的代码都会失效。**解法是用 `canvas.width / canvas.clientWidth` 这个运行时动态比值替代硬编码的 DPR，它在任何缩放状态下都是正确的。**
