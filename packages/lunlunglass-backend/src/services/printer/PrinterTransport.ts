/**
 * PrinterTransport
 * 职责：将 ESC/POS 命令数据发送到热敏打印机
 *
 * 支持多种连接方式：
 * - TCP/IP（网络打印机）
 * - USB（通过 serialport 库，可选依赖）
 * - 文件输出（调试用，输出到文件）
 */

import * as net from 'net'
import * as fs from 'fs'
import * as path from 'path'

export type TransportType = 'tcp' | 'usb' | 'file'

export interface TransportConfig {
  type: TransportType
  /** TCP: host:port 格式，如 "192.168.1.100:9100" */
  /** USB: 串口路径，如 "/dev/ttyUSB0" 或 "COM3" */
  /** File: 输出文件路径 */
  address: string
  /** TCP 连接超时（毫秒），默认 5000 */
  timeout?: number
}

/**
 * 通过 TCP 发送数据到网络打印机
 */
async function sendTcp(data: Buffer, address: string, timeout: number): Promise<void> {
  const [host, portStr] = address.split(':')
  const port = parseInt(portStr, 10) || 9100

  return new Promise((resolve, reject) => {
    const socket = new net.Socket()
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error(`TCP connection timeout after ${timeout}ms: ${address}`))
    }, timeout)

    socket.connect(port, host, () => {
      socket.write(data, (err) => {
        clearTimeout(timer)
        socket.end()
        if (err) reject(err)
        else resolve()
      })
    })

    socket.on('error', (err) => {
      clearTimeout(timer)
      socket.destroy()
      reject(new Error(`TCP connection failed: ${err.message}`))
    })
  })
}

/**
 * 通过 USB/串口发送数据
 * 注意：需要安装可选依赖 serialport
 */
async function sendUsb(data: Buffer, address: string): Promise<void> {
  try {
    // serialport 是可选依赖，动态导入
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { SerialPort } = await import('serialport') as any
    return new Promise<void>((resolve, reject) => {
      const port = new SerialPort({
        path: address,
        baudRate: 115200,
        autoOpen: false,
      })

      port.open((err: Error | null) => {
        if (err) {
          reject(new Error(`USB/Serial open failed: ${err.message}`))
          return
        }
        port.write(data, (writeErr: Error | null) => {
          if (writeErr) {
            port.close()
            reject(new Error(`USB/Serial write failed: ${writeErr.message}`))
            return
          }
          port.drain(() => {
            port.close()
            resolve()
          })
        })
      })
    })
  } catch {
    throw new Error(
      'serialport package not installed. Run: npm install serialport'
    )
  }
}

/**
 * 写入到文件（调试用途）
 */
async function sendFile(data: Buffer, filePath: string): Promise<void> {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(filePath, data)
}

/**
 * 发送 ESC/POS 命令数据到打印机
 * @param data ESC/POS 命令 Buffer
 * @param config 传输配置
 */
export async function send(data: Buffer, config: TransportConfig): Promise<void> {
  const timeout = config.timeout ?? 5000

  switch (config.type) {
    case 'tcp':
      return sendTcp(data, config.address, timeout)
    case 'usb':
      return sendUsb(data, config.address)
    case 'file':
      return sendFile(data, config.address)
    default:
      throw new Error(`Unsupported transport type: ${config.type}`)
  }
}
