/**
 * @lunlunglass/printer 共享打印服务包
 *
 * 提供热敏打印机所需的三个核心模块：
 * - ImageComposer：将背景图 + 动态字段数据合成为打印位图
 * - EscPosEncoder：将 PNG 位图转换为 ESC/POS 打印指令
 * - PrinterTransport：将 ESC/POS 指令发送到打印机（TCP/USB/文件）
 */

export * as ImageComposer from './ImageComposer.js'
export * as EscPosEncoder from './EscPosEncoder.js'
export * as PrinterTransport from './PrinterTransport.js'
export type {
  PrintConfig,
  PrintField,
  PrintFieldType,
  TextStyle,
  TextOverflow,
  TextAlign,
  CodeStyle,
  FieldBounds,
  BackgroundSize,
  TransportConfig,
  TransportType,
} from './types.js'
