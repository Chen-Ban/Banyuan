/**
 * @lunlunglass/printer 共享类型定义
 *
 * 这些类型从原 lunlunglass/backend 的 Template model 中提取，
 * 作为打印包的独立类型，不依赖 mongoose。
 */

/** 字段类型 */
export type PrintFieldType = 'text' | 'barcode' | 'qrcode'

/** 文本溢出处理方式 */
export type TextOverflow = 'clip' | 'ellipsis' | 'shrink'

/** 文本对齐方式 */
export type TextAlign = 'left' | 'center' | 'right'

/** 字段边界（像素坐标） */
export interface FieldBounds {
  x: number
  y: number
  width: number
  height: number
}

/** 文本样式 */
export interface TextStyle {
  fontSize: number
  fontWeight: string
  align: TextAlign
  overflow: TextOverflow
}

/** 条码/二维码样式 */
export interface CodeStyle {
  /** 条码格式，如 CODE128、EAN13 */
  format?: string
  /** 二维码纠错级别 */
  errorLevel?: 'L' | 'M' | 'Q' | 'H'
}

/** 打印字段描述 */
export interface PrintField {
  key: string
  label: string
  type: PrintFieldType
  bounds: FieldBounds
  textStyle?: TextStyle
  codeStyle?: CodeStyle
  defaultValue?: string
}

/** 背景图尺寸 */
export interface BackgroundSize {
  width: number
  height: number
}

/** 打印配置（模板快照中的打印参数） */
export interface PrintConfig {
  /** 纸宽（mm） */
  paperWidth: number
  /** DPI */
  dpi: number
  /** 背景图（Base64 data URL 或 http URL） */
  backgroundImage: string
  /** 背景图尺寸（像素） */
  backgroundSize: BackgroundSize
  /** 动态字段列表 */
  fields: PrintField[]
}

/** 传输方式 */
export type TransportType = 'tcp' | 'usb' | 'file'

/** 传输配置 */
export interface TransportConfig {
  type: TransportType
  /** TCP: host:port 格式，如 "192.168.1.100:9100" */
  /** USB: 串口路径，如 "/dev/ttyUSB0" 或 "COM3" */
  /** File: 输出文件路径 */
  address: string
  /** TCP 连接超时（毫秒），默认 5000 */
  timeout?: number
}
