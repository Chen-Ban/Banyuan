/**
 * serialport 是可选依赖，仅在 USB 打印场景使用
 * 此声明文件避免 TypeScript 编译错误
 */
declare module 'serialport' {
  export class SerialPort {
    constructor(options: { path: string; baudRate: number; autoOpen?: boolean })
    open(callback: (err: Error | null) => void): void
    write(data: Buffer, callback: (err: Error | null) => void): void
    drain(callback: () => void): void
    close(callback?: (err: Error | null) => void): void
  }
}
