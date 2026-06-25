/**
 * which — 查找可执行文件路径
 *
 * 在 PATH 中查找指定命令的完整路径，避免硬编码可执行文件路径。
 * 优先使用系统 `which` 命令，找不到时抛出明确错误。
 */

import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

/**
 * 查找命令的完整路径
 *
 * @param cmd 命令名称，如 'pnpm'、'node'
 * @returns 命令的完整路径，如 '/usr/local/bin/pnpm'
 * @throws 若命令不在 PATH 中，抛出包含安装提示的错误
 */
export async function which(cmd: string): Promise<string> {
  try {
    // macOS/Linux 使用 `which`，Windows 使用 `where`
    const whichCmd = process.platform === 'win32' ? 'where' : 'which'
    const { stdout } = await execFileAsync(whichCmd, [cmd])
    const resolved = stdout.trim().split('\n')[0].trim()
    if (!resolved) throw new Error(`empty output`)
    return resolved
  } catch {
    throw new Error(
      `Command "${cmd}" not found in PATH. ` +
        `Please install it and ensure it is available in your PATH.\n` +
        `  Install pnpm: https://pnpm.io/installation`,
    )
  }
}
