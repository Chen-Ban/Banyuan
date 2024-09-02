import { TemplateData } from './TemplateData.type'

//TODO：几何类型和工具函数合并成类

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

export const unreachablePoint: Point = {
  x: -Infinity,
  y: -Infinity,
  w: 1,
}

export const isUnreachable = (point: Point) => {
  return point.x === -Infinity || point.y === -Infinity
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
  EMPTY = 'empty',
}
//文字索引区间
export type Selection = `${number}-${number}`

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

//TODO: 优化掉这一层级，行的属性合并到段中，比如行间距等
//深层次的层级难以操作，并且这相当于一个中间结果
//尽量设计一个扁平的数据结构
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

//文字样式表
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
export interface CanvasNode {
  componentId: string //对应的母版id
  instanceId: string //模板中的实例id
  type: NodeType

  //节点的结构
  structure: {
    contentBox: Box
    borderPath?: Path //预留给以后每个节点都有内外边距时使用
    responsePath?: Path //预留给以后每个节点都有内外边距时使用
  }
  layer: number
  isActive: boolean
  //可以选择用string做索引，这种数据在小票中呈固定数据，不会和顾客数据冲突
  propName: keyof TemplateData | string //渲染时要替换content的变量名
}

export interface TextNode extends CanvasNode {
  //节点的样式表
  options: RenderTextOptions
  isInputing: boolean
}

export interface EmptyNode extends CanvasNode {
  backgroundColor: number | number[]
  borderColor: number | number[]
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

export const isTextNode = (node: CanvasNode | null | undefined): node is TextNode => {
  return !!node && node.type === NodeType.TEXT
}

export const isEmptyNode = (node: CanvasNode | null | undefined): node is EmptyNode => {
  return !!node && node.type === NodeType.EMPTY
}

export const initialTemplates: Template[] = []
