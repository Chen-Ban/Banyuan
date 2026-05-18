/**
 * PrinterConfigService
 *
 * 管理打印机连接配置，存储在 ~/.lunlunglass-pos/printer.json
 * POS 打印时从此配置文件读取打印机连接信息。
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as net from 'net'
import type { TransportConfig } from '@lunlunglass/printer'

/** 打印机配置文件路径 */
const CONFIG_DIR = path.join(os.homedir(), '.lunlunglass-pos')
const CONFIG_FILE = path.join(CONFIG_DIR, 'printer.json')

/** 打印机配置（存储结构） */
export interface PrinterConfig {
  /** 连接方式 */
  type: 'tcp' | 'usb' | 'file'
  /** TCP: "IP:端口"，USB: 设备路径，File: 输出路径 */
  address: string
  /** TCP 连接超时（毫秒） */
  timeout?: number
}

/** 默认配置 */
const DEFAULT_CONFIG: PrinterConfig = {
  type: 'tcp',
  address: '192.168.1.100:9100',
  timeout: 5000,
}

/**
 * 确保配置目录存在
 */
function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

/**
 * 读取打印机配置
 * 如果配置文件不存在，返回默认配置
 */
export function getConfig(): PrinterConfig {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      return DEFAULT_CONFIG
    }
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8')
    const parsed = JSON.parse(raw) as PrinterConfig
    // 验证必要字段
    if (!parsed.type || !parsed.address) {
      return DEFAULT_CONFIG
    }
    return parsed
  } catch {
    return DEFAULT_CONFIG
  }
}

/**
 * 保存打印机配置
 */
export function saveConfig(config: PrinterConfig): void {
  ensureConfigDir()
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8')
}

/**
 * 将 PrinterConfig 转换为 @lunlunglass/printer 的 TransportConfig
 */
export function toTransportConfig(config: PrinterConfig): TransportConfig {
  return {
    type: config.type,
    address: config.address,
    timeout: config.timeout,
  }
}

/**
 * 测试打印机连接
 * 通过 TCP 尝试建立连接并关闭来验证打印机是否可达
 */
export async function testConnection(config: PrinterConfig): Promise<{ success: boolean; message: string }> {
  if (config.type === 'file') {
    // 文件模式只检查目录是否可写
    const dir = path.dirname(config.address)
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.accessSync(dir, fs.constants.W_OK)
      return { success: true, message: '文件输出目录可写' }
    } catch {
      return { success: false, message: `目录不可写: ${dir}` }
    }
  }

  if (config.type === 'tcp') {
    const [host, portStr] = config.address.split(':')
    const port = parseInt(portStr, 10) || 9100
    const timeout = config.timeout ?? 5000

    return new Promise((resolve) => {
      const socket = new net.Socket()
      const timer = setTimeout(() => {
        socket.destroy()
        resolve({ success: false, message: `连接超时 (${timeout}ms): ${config.address}` })
      }, timeout)

      socket.connect(port, host, () => {
        clearTimeout(timer)
        socket.destroy()
        resolve({ success: true, message: `连接成功: ${config.address}` })
      })

      socket.on('error', (err) => {
        clearTimeout(timer)
        socket.destroy()
        resolve({ success: false, message: `连接失败: ${err.message}` })
      })
    })
  }

  if (config.type === 'usb') {
    // USB 检查设备路径是否存在
    if (fs.existsSync(config.address)) {
      return { success: true, message: `USB 设备存在: ${config.address}` }
    }
    return { success: false, message: `USB 设备不存在: ${config.address}` }
  }

  return { success: false, message: `未知连接类型: ${config.type}` }
}
