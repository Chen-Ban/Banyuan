/**
 * 声明全局 console，使 BanvasFlow 不依赖 DOM lib 也能使用 console.warn/log 等。
 * 该包需要在 Node.js 和浏览器环境下均可运行，不应引入完整的 DOM 或 @types/node。
 */
declare const console: {
  log(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
  info(...args: unknown[]): void
  debug(...args: unknown[]): void
}
