/**
 * bundler.ts — Vite 打包器
 *
 * 在脚手架生成的项目目录中执行 `pnpm install && pnpm run build`，
 * 将 React 应用打包为静态资源，供 electron-builder 使用。
 *
 * 使用 pnpm 而非 npm，与 Banyuan monorepo 的包管理器保持一致，
 * 避免 lockfile 冲突和 node_modules 结构不一致问题。
 */

import { execFile } from 'child_process'
import { promisify } from 'util'
import { which } from '../../utils/which.js'

const execFileAsync = promisify(execFile)

export interface BundleOptions {
  /** 脚手架生成的项目目录（绝对路径） */
  projectDir: string
  /** Vite 产物输出目录（绝对路径），需与 vite.config.ts 中的 outDir 一致 */
  outputDir: string
}

export async function bundle(options: BundleOptions): Promise<void> {
  const { projectDir } = options

  // 动态查找 pnpm 可执行路径，避免硬编码
  const pnpm = await which('pnpm')

  // 1. pnpm install（使用 --prefer-offline 加速本地缓存命中）
  await execFileAsync(pnpm, ['install', '--prefer-offline'], {
    cwd: projectDir,
    timeout: 5 * 60 * 1000, // 5 分钟超时
  })

  // 2. pnpm run build（调用 vite build）
  await execFileAsync(pnpm, ['run', 'build'], {
    cwd: projectDir,
    timeout: 5 * 60 * 1000,
  })
}
