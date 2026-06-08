/**
 * generate-schema-seeds.ts
 *
 * [ui] Primitive 知识种子生成器
 *
 * 基于 AI Projection 类型体系自动生成 schema 层知识种子 JSON 文件。
 * 输出到 packages/xiangdi-agent/src/knowledge/seeds/schema/ 目录。
 *
 * 运行方式：npx tsx scripts/knowledge/generate-schema-seeds.ts
 *
 * 设计原则：
 *   - 独立于 banvasgl 构建流程，按需执行
 *   - 版本号从 banvasgl/package.json 读取
 *   - 生成后尝试写入 knowledge-server（不可达时优雅降级）
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { upsertToKnowledgeServer } from "./utils/upsert.js";

// ─── 路径解析（从仓库根 scripts/knowledge/ 出发） ──────────────────────────────

const __scriptDir = typeof __dirname !== "undefined"
  ? __dirname
  : path.dirname(fileURLToPath(import.meta.url));

const REPO_ROOT = path.resolve(__scriptDir, "../..");

const BANVASGL_PKG = JSON.parse(
  fs.readFileSync(path.resolve(REPO_ROOT, "packages/banvasgl/package.json"), "utf-8")
);
const VERSION: string = BANVASGL_PKG.version;

const OUTPUT_DIR = path.resolve(
  REPO_ROOT,
  "packages/xiangdi-agent/src/knowledge/seeds/schema"
);

// ─── 种子类型定义 ─────────────────────────────────────────────────────────────

interface SeedFile {
  id: string;
  content: string;
  source: string;
  metadata: {
    category: "schema";
    nodeType: string;
    version: string;
    [key: string]: unknown;
  };
}

// ─── 种子内容定义 ─────────────────────────────────────────────────────────────

interface SeedConfig {
  id: string;
  fileName: string;
  nodeType: string;
  content: string;
}

function buildSeeds(): SeedConfig[] {
  return [
    buildCommonSeed(),
    buildSceneSeed(),
    buildGraphViewSeed(),
    buildTextViewSeed(),
    buildImageViewSeed(),
    buildVideoViewSeed(),
    buildCombinedViewSeed(),
    buildNodeViewSeed(),
    buildEdgeViewSeed(),
    buildPortViewSeed(),
  ];
}

// ─── schema-common ────────────────────────────────────────────────────────────

function buildCommonSeed(): SeedConfig {
  const content = `# 公共字段与样式类型

## 描述

所有 AI Projection 节点共享的基础字段和样式类型定义。创建或修改任何节点时都需要遵循这些规范。

## 公共基础字段（AIProjectionNodeBase）

所有节点都包含以下字段：

- **type** (string) [必填] — 视图类型标识，如 "GRAPHVIEW"、"TEXTVIEW" 等
- **id** (string) [必填] — 唯一标识符
- **transform** (AITransform) [必填] — 语义化坐标：{ x: number, y: number, rotation?: number(默认0), scaleX?: number(默认1), scaleY?: number(默认1) }
- **size** (AISize) [必填] — 尺寸：{ width: number, height: number }，单位 px
- **visible** (boolean) [可选] — 可见性，省略表示 true
- **freezed** (boolean) [可选] — 冻结状态（不可编辑），省略表示 false
- **decoration** (AIDecoration) [可选] — 装饰样式，省略表示无装饰
- **events** (AIEvents) [可选] — 事件处理器，省略表示无事件
- **lifetimes** (AILifetimes) [可选] — 生命周期钩子，省略表示无钩子
- **data** (AIDataModel) [可选] — 数据模型，省略表示无数据绑定
- **flexLayout** (AIFlexLayout) [可选] — 子元素级 flex 参数（仅含 flex/alignSelf），当父容器为 flex 模式时生效

## 坐标系

- 原点在页面左上角，X 轴向右，Y 轴向下
- 所有尺寸单位为逻辑像素（px）
- 移动端默认页面尺寸：375 × 812 px

## 装饰类型（AIDecoration）

\`\`\`json
{
  "fill": { "color": "#ffffff", "opacity": 1 },
  "stroke": { "color": "#000000", "width": 1, "style": "solid", "opacity": 1 },
  "shadow": { "color": "#00000033", "blur": 4, "offsetX": 0, "offsetY": 2 },
  "cornerRadius": 8,
  "overflow": "hidden"
}
\`\`\`

各字段说明：
- **fill.color** — 颜色值：hex 字符串（如 "#FF5733"）或渐变对象 { type: "linear"|"radial"|"conic", stops: [{ offset: 0-1, color: "#hex" }], params?: {} }
- **fill.opacity** — 填充透明度 0-1
- **stroke.style** — "solid" | "dashed" | "dotted"
- **cornerRadius** — 圆角半径，number 或 [左上, 右上, 右下, 左下] 四值元组
- **overflow** — "visible" | "hidden" | "scroll"

## 事件处理器（AIEvents）

支持 12 种事件，值为 FlowSchema（流程图声明式定义）或 null：
onClick, onDoubleClick, onLongPress, onMouseEnter, onMouseLeave, onMouseDown, onMouseUp, onMouseMove, onFocus, onBlur, onChange, onScroll

## 生命周期钩子（AILifetimes）

- **onCreated** — 视图创建时
- **onAttach** — 视图挂载到场景时
- **onDestroy** — 视图销毁时

## 数据模型（AIDataModel）

键值对格式，每个字段：{ type: string, defaultValue?: unknown, label?: string }

\`\`\`json
{
  "title": { "type": "string", "defaultValue": "标题", "label": "标题" },
  "count": { "type": "number", "defaultValue": 0 }
}
\`\`\``;

  return { id: "schema-common", fileName: "common.json", nodeType: "Common", content };
}

// ─── schema-scene ─────────────────────────────────────────────────────────────

function buildSceneSeed(): SeedConfig {
  const content = `# Scene（页面/场景）

## 描述

Scene 是应用的页面级容器，对应 AI Projection 中的 AIProjectionScene。每个应用包含一个或多个 Scene，每个 Scene 拥有独立的尺寸、背景色和子节点列表。

## 属性结构

- **id** (string) [必填] — 页面唯一标识
- **name** (string) [可选] — 页面名称，默认 "页面"
- **size** ({ width: number, height: number }) [必填] — 页面尺寸，移动端默认 375×812
- **backgroundColor** (string) [可选] — 背景色，hex 格式，默认 "#ffffff"
- **cameraType** (string) [可选] — 相机类型，省略表示 "ORTHOGRAPHIC"
- **lifetimes** (object) [可选] — 场景生命周期：{ onLoad?, onUnload?, onShow?, onHide? }，值为 FlowSchema
- **children** (AIProjectionNode[]) [必填] — 顶层视图列表

## 最小示例

\`\`\`json
{
  "id": "scene-001",
  "name": "首页",
  "size": { "width": 375, "height": 812 },
  "backgroundColor": "#ffffff",
  "children": []
}
\`\`\`

## 使用场景

- 使用 banvas_create_page 工具创建新页面时，生成的就是 Scene 结构
- 一个应用通常包含多个 Scene（如首页、详情页、设置页）
- Scene.lifetimes.onLoad 常用于页面加载时的数据初始化`;

  return { id: "schema-scene", fileName: "scene.json", nodeType: "Scene", content };
}

// ─── schema-graphview ─────────────────────────────────────────────────────────

function buildGraphViewSeed(): SeedConfig {
  const content = `# GRAPHVIEW（图形视图）

## 描述

GraphView 是最基础的叶子节点，用于渲染单个图形基元。通过 content.graphType 区分不同图形类型（矩形、圆形、线段、贝塞尔曲线等）。常用于背景色块、按钮底板、装饰图形、分割线等。

## 特有属性

继承 AIProjectionNodeBase 全部公共字段，额外有：

- **type** — 固定为 "GRAPHVIEW"
- **content** (object | null) [必填] — 图形内容
  - **content.graphType** (string) — 图形类型标识
  - **content.data** (object) — 图形特有数据

## 常用 graphType 及其 data 结构

### RECTANGLE（矩形）
最常用的图形，用于色块、背景、按钮底板。
\`\`\`json
{ "graphType": "RECTANGLE", "data": {} }
\`\`\`
矩形的填充色和圆角通过外层 decoration 控制，而非 data 内部。

### ROUNDED_RECT（圆角矩形）
带独立圆角控制的矩形，圆角同样走 decoration.cornerRadius。
\`\`\`json
{ "graphType": "ROUNDED_RECT", "data": {} }
\`\`\`

### CIRCLE（圆形）
\`\`\`json
{ "graphType": "CIRCLE", "data": {} }
\`\`\`

### LINE（线段）
\`\`\`json
{ "graphType": "LINE", "data": { "x1": 0, "y1": 0, "x2": 100, "y2": 0 } }
\`\`\`

### CUBIC_BEZIER（三次贝塞尔曲线）
4 个控制点定义：起点、控制点1、控制点2、终点。
\`\`\`json
{
  "graphType": "CUBIC_BEZIER",
  "data": {
    "points": [
      { "x": 0, "y": 0 },
      { "x": 50, "y": -30 },
      { "x": 150, "y": -30 },
      { "x": 200, "y": 0 }
    ]
  }
}
\`\`\`

### QUADRATIC_BEZIER（二次贝塞尔曲线）
3 个控制点：起点、控制点、终点。
\`\`\`json
{
  "graphType": "QUADRATIC_BEZIER",
  "data": {
    "points": [
      { "x": 0, "y": 0 },
      { "x": 100, "y": -50 },
      { "x": 200, "y": 0 }
    ]
  }
}
\`\`\`

### POLYGON（多边形）
\`\`\`json
{ "graphType": "POLYGON", "data": { "vertices": [{ "x": 0, "y": 0 }, { "x": 50, "y": -30 }, { "x": 100, "y": 0 }] } }
\`\`\`

### TRIANGLE（三角形）
\`\`\`json
{ "graphType": "TRIANGLE", "data": {} }
\`\`\`

### REGULAR_POLYGON（正多边形）
\`\`\`json
{ "graphType": "REGULAR_POLYGON", "data": { "sides": 6 } }
\`\`\`

## 最小示例（矩形色块）

\`\`\`json
{
  "type": "GRAPHVIEW",
  "id": "rect-001",
  "transform": { "x": 16, "y": 100 },
  "size": { "width": 343, "height": 60 },
  "decoration": {
    "fill": { "color": "#f5f5f5" },
    "cornerRadius": 8
  },
  "content": { "graphType": "RECTANGLE", "data": {} }
}
\`\`\`

## 使用场景

- 纯色矩形背景/卡片底板 → RECTANGLE + decoration.fill
- 分割线 → LINE + decoration.stroke
- 装饰曲线 → CUBIC_BEZIER / QUADRATIC_BEZIER
- 图标底板（圆形） → CIRCLE + decoration.fill
- 复杂形状 → POLYGON + vertices`;

  return { id: "schema-graphview", fileName: "graphview.json", nodeType: "GRAPHVIEW", content };
}

// ─── schema-textview ──────────────────────────────────────────────────────────

function buildTextViewSeed(): SeedConfig {
  const content = `# TEXTVIEW（文本视图）

## 描述

TextView 用于显示富文本内容。支持多段落、段内多样式片段（字号、颜色、粗体、斜体、下划线）、段落对齐和行高控制。适用于标题、正文、标签、按钮文字等。

## 特有属性

继承 AIProjectionNodeBase 全部公共字段，额外有：

- **type** — 固定为 "TEXTVIEW"
- **content** (object | null) [必填] — 文本内容
  - **content.paragraphs** (array) — 段落数组，每段包含：
    - **elements** (array) — 文本片段数组
      - **text** (string) — 文本内容
      - **style** (object) [可选] — 片段样式 { fontSize?: number, fontWeight?: string, color?: string, italic?: boolean, underline?: boolean }
    - **align** ("left" | "center" | "right") [可选] — 段落对齐，默认 "left"
    - **lineHeight** (number) [可选] — 行高倍数

## 最小示例

\`\`\`json
{
  "type": "TEXTVIEW",
  "id": "text-001",
  "transform": { "x": 16, "y": 20 },
  "size": { "width": 200, "height": 30 },
  "content": {
    "paragraphs": [
      {
        "elements": [{ "text": "Hello World" }],
        "align": "left"
      }
    ]
  }
}
\`\`\`

## 富文本示例（多样式）

\`\`\`json
{
  "type": "TEXTVIEW",
  "id": "text-rich",
  "transform": { "x": 16, "y": 60 },
  "size": { "width": 343, "height": 80 },
  "content": {
    "paragraphs": [
      {
        "elements": [
          { "text": "重要提示：", "style": { "fontWeight": "bold", "color": "#FF0000" } },
          { "text": "请在 24 小时内完成操作", "style": { "fontSize": 14, "color": "#333333" } }
        ],
        "lineHeight": 1.6
      }
    ]
  }
}
\`\`\`

## 使用场景

- 页面标题 → 单段落、大字号、bold
- 正文内容 → 多段落、常规样式
- 按钮文字 → 单段落、center 对齐、配合 GRAPHVIEW 矩形底板
- 价格标签 → 多片段（¥ 小字 + 金额大字 + 原价删除线）
- 链接文字 → underline + 蓝色`;

  return { id: "schema-textview", fileName: "textview.json", nodeType: "TEXTVIEW", content };
}

// ─── schema-imageview ─────────────────────────────────────────────────────────

function buildImageViewSeed(): SeedConfig {
  const content = `# IMAGEVIEW（图片视图）

## 描述

ImageView 用于显示图片资源。通过 URL 引用外部图片，支持三种填充适配模式。适用于头像、封面图、商品图、背景图等。

## 特有属性

继承 AIProjectionNodeBase 全部公共字段，额外有：

- **type** — 固定为 "IMAGEVIEW"
- **src** (string | null) [必填] — 图片 URL，null 表示空占位
- **objectFit** ("fill" | "contain" | "cover") [可选] — 填充模式，默认 "cover"
  - fill: 拉伸填满，可能变形
  - contain: 等比缩放完整显示，可能留白
  - cover: 等比缩放裁剪填满，可能裁切

## 最小示例

\`\`\`json
{
  "type": "IMAGEVIEW",
  "id": "img-001",
  "transform": { "x": 16, "y": 100 },
  "size": { "width": 343, "height": 200 },
  "src": "https://example.com/banner.png",
  "objectFit": "cover"
}
\`\`\`

## 圆形头像示例

\`\`\`json
{
  "type": "IMAGEVIEW",
  "id": "avatar-001",
  "transform": { "x": 16, "y": 16 },
  "size": { "width": 48, "height": 48 },
  "decoration": { "cornerRadius": 24, "overflow": "hidden" },
  "src": "https://example.com/avatar.png",
  "objectFit": "cover"
}
\`\`\`

## 使用场景

- 横幅/Banner → 宽图、cover 模式
- 商品封面 → 固定宽高比、cover 模式
- 圆形头像 → cornerRadius 为宽高一半 + overflow: hidden
- 图标 → 小尺寸、contain 模式
- 占位图 → src 为 null，配合 decoration.fill 灰色背景`;

  return { id: "schema-imageview", fileName: "imageview.json", nodeType: "IMAGEVIEW", content };
}

// ─── schema-videoview ─────────────────────────────────────────────────────────

function buildVideoViewSeed(): SeedConfig {
  const content = `# VIDEOVIEW（视频视图）

## 描述

VideoView 用于嵌入视频播放器。通过 URL 引用视频资源。

## 特有属性

继承 AIProjectionNodeBase 全部公共字段，额外有：

- **type** — 固定为 "VIDEOVIEW"
- **src** (string | null) [必填] — 视频 URL，null 表示空占位

## 最小示例

\`\`\`json
{
  "type": "VIDEOVIEW",
  "id": "video-001",
  "transform": { "x": 0, "y": 0 },
  "size": { "width": 375, "height": 211 },
  "src": "https://example.com/intro.mp4"
}
\`\`\`

## 使用场景

- 产品介绍视频
- 教程/引导视频
- 背景视频（配合固定尺寸）`;

  return { id: "schema-videoview", fileName: "videoview.json", nodeType: "VIDEOVIEW", content };
}

// ─── schema-combinedview ──────────────────────────────────────────────────────

function buildCombinedViewSeed(): SeedConfig {
  const content = `# COMBINEDVIEW（容器视图）

## 描述

CombinedView 是统一的容器节点，通过 layoutMode 切换不同布局策略。可包含任意子节点，支持 free（自由定位）、flex（弹性布局）、list（列表）、grid（网格）、scroll（滚动）五种模式。是构建复杂 UI 布局的核心组件。

## 特有属性

继承 AIProjectionNodeBase 全部公共字段，额外有：

- **type** — 固定为 "COMBINEDVIEW"
- **layoutMode** ("free" | "flex" | "list" | "grid" | "scroll") [可选] — 布局模式，省略表示 "free"
- **flexLayout** (AIFlexLayout) [可选] — Flex 布局配置（layoutMode="flex" 时）
- **listLayout** (AIListLayout) [可选] — List 布局配置（layoutMode="list" 时）
- **gridLayout** (AIGridLayout) [可选] — Grid 布局配置（layoutMode="grid" 时）
- **children** (AIProjectionNode[]) [必填] — 子节点数组

## layoutMode = "free"（自由定位）

子节点通过各自的 transform.x/y 绝对定位。适合自由画布场景。

\`\`\`json
{
  "type": "COMBINEDVIEW",
  "id": "free-container",
  "transform": { "x": 0, "y": 0 },
  "size": { "width": 375, "height": 400 },
  "layoutMode": "free",
  "children": [
    { "type": "GRAPHVIEW", "id": "bg", "transform": { "x": 0, "y": 0 }, "size": { "width": 375, "height": 400 }, "content": { "graphType": "RECTANGLE", "data": {} }, "decoration": { "fill": { "color": "#f0f0f0" } } }
  ]
}
\`\`\`

## layoutMode = "flex"（弹性布局）

子节点位置由 flexLayout 自动计算。最常用的布局模式。

### AIFlexLayout 完整配置

容器级：
- **direction** — "row" | "column"，默认 "column"
- **wrap** — boolean，是否换行，默认 false
- **gap** — number，子元素间距（px）
- **mainAxisAlignment** — "start" | "center" | "end" | "space-between" | "space-around"
- **crossAxisAlignment** — "start" | "center" | "end" | "stretch"
- **padding** — number 或 [上, 右, 下, 左] 四值元组

子元素级（写在子节点的 flexLayout 字段中）：
- **flex** — number，弹性权重（0=固定尺寸，>0=弹性）
- **alignSelf** — "start" | "center" | "end" | "stretch"，覆盖容器的 crossAxisAlignment

\`\`\`json
{
  "type": "COMBINEDVIEW",
  "id": "flex-col",
  "transform": { "x": 0, "y": 0 },
  "size": { "width": 375, "height": 600 },
  "layoutMode": "flex",
  "flexLayout": {
    "direction": "column",
    "gap": 12,
    "padding": 16,
    "crossAxisAlignment": "stretch"
  },
  "children": [
    { "type": "TEXTVIEW", "id": "title", "transform": { "x": 0, "y": 0 }, "size": { "width": 343, "height": 30 }, "content": { "paragraphs": [{ "elements": [{ "text": "标题", "style": { "fontSize": 20, "fontWeight": "bold" } }] }] } },
    { "type": "GRAPHVIEW", "id": "card", "transform": { "x": 0, "y": 0 }, "size": { "width": 343, "height": 200 }, "content": { "graphType": "RECTANGLE", "data": {} }, "decoration": { "fill": { "color": "#ffffff" }, "cornerRadius": 12 }, "flexLayout": { "flex": 1 } }
  ]
}
\`\`\`

## layoutMode = "list"（列表布局）

简化的列表布局，子元素按方向依次排列。

### AIListLayout 配置
- **direction** — "vertical" | "horizontal"，默认 "vertical"
- **gap** — number，元素间距
- **padding** — number 或 [上, 右, 下, 左]

## layoutMode = "grid"（网格布局）

网格布局，子元素自动填充到列中。

### AIGridLayout 配置
- **columns** — number，列数
- **rowGap** — number，行间距
- **columnGap** — number，列间距
- **padding** — number 或 [上, 右, 下, 左]

\`\`\`json
{
  "type": "COMBINEDVIEW",
  "id": "grid-container",
  "transform": { "x": 0, "y": 0 },
  "size": { "width": 375, "height": 400 },
  "layoutMode": "grid",
  "gridLayout": { "columns": 2, "rowGap": 12, "columnGap": 12, "padding": 16 },
  "children": []
}
\`\`\`

## layoutMode = "scroll"（滚动容器）

内容可滚动的容器，子节点超出可视区域时自动产生滚动行为。

## 使用场景

- 页面主体布局 → flex + direction: column
- 导航栏/工具栏 → flex + direction: row + mainAxisAlignment: space-between
- 商品列表 → list + direction: vertical
- 商品网格/相册 → grid + columns: 2
- 长内容页 → scroll（外层滚动容器）
- 卡片容器 → free 或 flex（含 decoration.cornerRadius + shadow）`;

  return { id: "schema-combinedview", fileName: "combinedview.json", nodeType: "COMBINEDVIEW", content };
}

// ─── schema-nodeview ──────────────────────────────────────────────────────────

function buildNodeViewSeed(): SeedConfig {
  const content = `# NODEVIEW（流程图节点）

## 描述

NodeView 是流程图编辑器中的节点视图，继承 ContainerView 能力，可包含子节点（通常是 PortView 作为连接端口）。用于可视化流程设计场景。

## 特有属性

继承 AIProjectionNodeBase 全部公共字段，额外有：

- **type** — 固定为 "NODEVIEW"
- **schema** (object) [必填] — 节点的业务 Schema（自定义键值对，描述节点的业务逻辑配置）
- **nodeTitle** (string) [必填] — 节点显示标题
- **children** (AIProjectionNode[]) [必填] — 子节点（通常为 PortView）

## 最小示例

\`\`\`json
{
  "type": "NODEVIEW",
  "id": "node-001",
  "transform": { "x": 200, "y": 100 },
  "size": { "width": 180, "height": 80 },
  "schema": { "action": "httpRequest", "url": "" },
  "nodeTitle": "HTTP 请求",
  "children": [
    { "type": "PORTVIEW", "id": "port-in", "transform": { "x": 0, "y": 40 }, "size": { "width": 12, "height": 12 }, "portDirection": "input" },
    { "type": "PORTVIEW", "id": "port-out", "transform": { "x": 168, "y": 40 }, "size": { "width": 12, "height": 12 }, "portDirection": "output" }
  ]
}
\`\`\`

## 使用场景

- 流程编辑器中的逻辑节点
- 每个 NodeView 通常包含至少一个 input PortView 和一个 output PortView
- 节点之间通过 EdgeView 连接 PortView`;

  return { id: "schema-nodeview", fileName: "nodeview.json", nodeType: "NODEVIEW", content };
}

// ─── schema-edgeview ──────────────────────────────────────────────────────────

function buildEdgeViewSeed(): SeedConfig {
  const content = `# EDGEVIEW（流程图连线）

## 描述

EdgeView 表示流程图中两个 Port 之间的连线。通过 fromPortId 和 toPortId 关联起始和目标端口。

## 特有属性

继承 AIProjectionNodeBase 全部公共字段，额外有：

- **type** — 固定为 "EDGEVIEW"
- **fromPortId** (string | null) [必填] — 起始端口 ID
- **toPortId** (string | null) [必填] — 目标端口 ID

## 最小示例

\`\`\`json
{
  "type": "EDGEVIEW",
  "id": "edge-001",
  "transform": { "x": 0, "y": 0 },
  "size": { "width": 0, "height": 0 },
  "fromPortId": "port-out-1",
  "toPortId": "port-in-2"
}
\`\`\`

## 使用场景

- 连接两个 NodeView 的 PortView，表示数据流或控制流方向
- fromPortId 通常指向上游节点的 output port
- toPortId 通常指向下游节点的 input port`;

  return { id: "schema-edgeview", fileName: "edgeview.json", nodeType: "EDGEVIEW", content };
}

// ─── schema-portview ──────────────────────────────────────────────────────────

function buildPortViewSeed(): SeedConfig {
  const content = `# PORTVIEW（流程图端口）

## 描述

PortView 是 NodeView 上的连接端口，EdgeView 通过关联 PortView 的 ID 来建立节点间连线。端口有方向性（输入/输出/双向）和最大连线数限制。

## 特有属性

继承 AIProjectionNodeBase 全部公共字段，额外有：

- **type** — 固定为 "PORTVIEW"
- **portDirection** ("input" | "output" | "bidirectional") [必填] — 端口方向
- **maxConnections** (number) [可选] — 最大连线数，省略表示无限制

## 最小示例

\`\`\`json
{
  "type": "PORTVIEW",
  "id": "port-001",
  "transform": { "x": 0, "y": 34 },
  "size": { "width": 12, "height": 12 },
  "portDirection": "input",
  "maxConnections": 1
}
\`\`\`

## 使用场景

- 作为 NodeView 的子节点存在
- input port 通常放在节点左侧
- output port 通常放在节点右侧
- bidirectional 用于特殊场景（双向数据流）`;

  return { id: "schema-portview", fileName: "portview.json", nodeType: "PORTVIEW", content };
}

// ─── 主流程 ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`🌱 generate-schema-seeds: 开始生成 Schema 层知识种子 (v${VERSION})...`);
  console.log(`   基于 AI Projection 类型体系`);
  console.log("");

  // 确保输出目录存在
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const seeds = buildSeeds();
  const generatedFiles: string[] = [];

  for (const seed of seeds) {
    const seedFile: SeedFile = {
      id: seed.id,
      content: seed.content,
      source: "auto-generated:knowledge-tool",
      metadata: {
        category: "schema",
        nodeType: seed.nodeType,
        version: VERSION,
      },
    };

    const outputPath = path.join(OUTPUT_DIR, seed.fileName);
    fs.writeFileSync(outputPath, JSON.stringify(seedFile, null, 2) + "\n", "utf-8");
    generatedFiles.push(seed.fileName);
    console.log(`  ✅ ${seed.fileName} (${seed.nodeType})`);
  }

  console.log("");
  console.log(`🎉 generate-schema-seeds: 完成！共生成 ${generatedFiles.length} 个种子文件`);
  console.log(`   版本: ${VERSION}`);
  console.log(`   输出: ${OUTPUT_DIR}/`);

  // ─── 自动 upsert 到 knowledge-server ────────────────────────────────────────
  await upsertToKnowledgeServer(
    seeds.map((seed) => ({
      id: seed.id,
      content: seed.content,
      source: "auto-generated:knowledge-tool",
      metadata: {
        category: "schema",
        nodeType: seed.nodeType,
        version: VERSION,
      },
    }))
  );
}

main();
