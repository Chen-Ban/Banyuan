import { TemplateData } from './TemplateData.type'
//点
export type Point = {
  x: number
  y: number
  w: 1
}
export const origin: Point = {
  x: 0,
  y: 0,
  w: 1,
}

//向量
export type Vector = {
  x: number
  y: number
  w: 0
}
export const zeroVector: Vector = {
  x: 0,
  y: 0,
  w: 0,
}
export const unitXVector: Vector = {
  x: 1,
  y: 0,
  w: 0,
}
export const unitYVector: Vector = {
  x: 0,
  y: 1,
  w: 0,
}
//路径
export type Path = Point[]
//尺寸
export type Size = {
  height: number
  width: number
}
//盒模型
export type Box = {
  location: Point
  size: Size
  path: Path
}
//节点类型
export enum NodeType {
  TEXT = 'text',
  POLYGON = 'polygon',
  PICTURE = 'picture',
  TABLE = 'table',
  BARCODE = 'barCode',
}
//文字索引区间
export type Selection = `${number}-${number}`

export function isSelection(str: string): str is Selection {
  const parts = str.split('-')

  return parts.length === 2 && !isNaN(parseInt(parts[0], 10)) && !isNaN(parseInt(parts[1], 10))
}

export enum VerAlign {
  TOP = 'top',
  MIDDLE = 'middle',
  BOTTOM = 'bottom',
}
export enum HorAlign {
  LEFT = 'left',
  CENTER = 'center',
  RIGHT = 'right',
  JUSTIFY = 'justify',
}
//对齐方式
export type Align = {
  vertical: VerAlign
  horizontal: HorAlign
}

export type FontOptions = {
  fontFamily: string
  fontWeight: number | 'bold' | 'bolder' | 'normal'
  fontSize: number
  italicly: boolean
  underLine: boolean
  color: number[] | number
  characterWidth: number[]
  letterSpace: number
}

export type Range<T> = Record<Selection, T>

export type RowOptions = {
  font: Range<FontOptions>
  //每一行的文本区域
  contentBox: Omit<Box, 'path'>
  rowIndex: number
}

export type ParagrahOption = {
  rows: Range<RowOptions>
  paragrahIndex: number
  contentBox: Omit<Box, 'path'>
  preGap: number
  postGap: number
}

//文字样式表（TODO：将Range的键链接到paragrahsIndex，rowsIndex这两个区间列表上,保证这两个区间的顺序即可）
export type RenderTextOptions = {
  rowsIndex: Selection[] //行区间列表
  paragrahsIndex: Selection[] //段落区间列表
  paragrahs: Range<ParagrahOption>
  isAdoptiveHeight: boolean
  textDecorate?: CanvasNode // 预留给编号（不同的层级不同的固定宽高）（组合节点）
  //整个文本区域
  contentBox: Omit<Box, 'path'>
  minContentWidth: number
  //控制光标和选择
  selection: Selection
  selectionBoxes: Box[]
  //对齐方式
  align: Align
  //行距（只支持倍数行距）:和fontsize配合计算行高和character位置的
  //1.5倍行距表示行与行之间间隔0.5行
  //1.5倍行距表示每一行行高等于1.5倍(最大字符高度 == 单倍行高)
  Leading: 1 | 1.5 | 2 | 2.5 | 3
}

export type RenderPolygonOptions = { contentBox: Omit<Box, 'path'>; minContentWidth: number }
export type RenderPictureOptions = { contentBox: Omit<Box, 'path'>; minContentWidth: number }
export type RenderTableOptions = { contentBox: Omit<Box, 'path'>; minContentWidth: number }
export type RenderBarcodeOptions = { contentBox: Omit<Box, 'path'>; minContentWidth: number }

export type RenderOptions =
  | RenderTextOptions
  | RenderPictureOptions
  | RenderPolygonOptions
  | RenderTableOptions
  | RenderBarcodeOptions

//模板中的节点类型

//TODO: fix: 给节点添加renderoptions泛型

export type CanvasNode = {
  componentId: string //对应的母版id
  instanceId: string //模板中的实例id
  type: NodeType

  //节点的结构
  structure: {
    contentBox: Box
    borderPath?: Path //预留给以后每个节点都有内外边距时使用
    responsePath?: Path //预留给以后每个节点都有内外边距时使用
  }

  //节点的样式表
  options: RenderOptions

  layer: number
  isActive: boolean
  //可以选择用string做索引，这种数据在小票中呈固定数据，不会和顾客数据冲突
  propName: keyof TemplateData | string //渲染时要替换content的变量名
}
export enum ResizeDirection {
  VERTICAL_N = 'vertical_n',
  VERTICAL_S = 'vertical_s',

  HORIZONTAL_W = 'horizontal_w',
  HORIZONTAL_E = 'horizontal_e',

  SLASH_NE = 'slash_ne',
  SLASH_SW = 'slash_sw',

  BACKSLASH_NW = 'backslash_nw',
  BACKSLASH_SE = 'backslash_se',

  NONE = 'NONE',
}

export type CanvasNodeList = CanvasNode[]
//模板种类
export enum TemplateType {
  CUSTOMER = 'customer',
  OPTOMETRY = 'optometry',
}
//模板类型
export type Template = {
  templateId: string
  type: TemplateType
  nodeList: CanvasNodeList
  templateData: TemplateData
}

export const initialTemplates: Template[] = []
