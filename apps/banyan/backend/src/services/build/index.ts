/**
 * build service — 生成应用服务
 *
 * 完整流程：
 *   1. scaffold()      — 生成最小 React 项目
 *   2. bundle()        — Vite 打包
 *   3. buildElectron() — electron-builder 打包
 *
 * 任务状态持久化到 MongoDB（BuildTask 模型），进程重启后可从 DB 恢复。
 */

import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'
import { randomUUID } from 'crypto'
import { scaffold } from './scaffold.js'
import { bundle } from './bundler.js'
import { buildElectron } from './electron.js'
import type { Platform } from './electron.js'
import { BuildTaskModel } from '../../models/index.js'

export { scaffold, bundle, buildElectron }
export type { Platform }
export type { ScaffoldOptions } from './scaffold.js'
export type { BundleOptions } from './bundler.js'
export type { ElectronBuildOptions } from './electron.js'

/**
 * 持久化存储目录：存放构建完成的安装包
 * 后续迁移到 OSS 时只需替换此处逻辑
 */
const STORAGE_DIR = path.resolve(process.cwd(), 'storage/builds')
fs.mkdirSync(STORAGE_DIR, { recursive: true })

// ── 任务状态（与 IBuildTask 保持一致）──

export type TaskStatus = 'pending' | 'running' | 'success' | 'failed'

export interface BuildTask {
  taskId: string
  appName: string
  platform: Platform
  status: TaskStatus
  createdAt: number
  updatedAt: number
  /** 构建产物下载路径（success 时填充） */
  outputFile?: string
  /** 错误信息（failed 时填充） */
  error?: string
}

/**
 * 从 MongoDB 查询任务状态
 * 进程重启后仍可查询历史任务
 */
export async function getTask(taskId: string): Promise<BuildTask | undefined> {
  const doc = await BuildTaskModel.findOne({ taskId }).lean()
  if (!doc) return undefined
  return {
    taskId: doc.taskId,
    appName: doc.appName,
    platform: doc.platform as Platform,
    status: doc.status as TaskStatus,
    createdAt: doc.createdAt.getTime(),
    updatedAt: doc.updatedAt.getTime(),
    outputFile: doc.outputFile,
    error: doc.error,
  }
}

// ── 并发控制 ──

/** 最大同时运行的构建任务数 */
const MAX_CONCURRENT_BUILDS = 3

/** 当前正在运行的任务数 */
let runningCount = 0

/** 等待执行的任务队列 */
const waitQueue: Array<() => void> = []

/**
 * 获取一个并发槽位，超出上限时等待直到有槽位释放
 */
function acquireSlot(): Promise<void> {
  if (runningCount < MAX_CONCURRENT_BUILDS) {
    runningCount++
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    waitQueue.push(() => {
      runningCount++
      resolve()
    })
  })
}

/**
 * 释放并发槽位，唤醒队列中的下一个等待任务
 */
function releaseSlot(): void {
  const next = waitQueue.shift()
  if (next) {
    next()
  } else {
    runningCount--
  }
}

// ── 完整构建流程 ──

export interface StartBuildOptions {
  appJson: string
  appName: string
  platform: Platform
  width: number
  height: number
  /** banvasgl 版本号，由前端传入 */
  banvasglVersion: string
}

/**
 * 启动异步构建任务，立即返回 taskId
 * 任务状态持久化到 MongoDB，进程重启后可通过 getTask() 查询
 */
export async function startBuild(options: StartBuildOptions): Promise<string> {
  const taskId = randomUUID()

  // 持久化到 MongoDB
  await BuildTaskModel.create({
    taskId,
    appName: options.appName,
    platform: options.platform,
    status: 'pending',
  })

  // 异步执行，不阻塞请求
  runBuild(taskId, options).catch((err) => {
    console.error(`[Build ${taskId}] unexpected error:`, err)
  })

  return taskId
}

async function runBuild(taskId: string, options: StartBuildOptions): Promise<void> {
  const { appJson, appName, platform, width, height, banvasglVersion } = options

  // 工作目录：系统临时目录下按 taskId 隔离
  const workDir = path.join(os.tmpdir(), 'banyuan-build', taskId)
  const projectDir = path.join(workDir, 'project')
  const distDir = path.join(projectDir, 'dist')
  const outputDir = path.join(workDir, 'output')

  /** 更新 MongoDB 中的任务状态 */
  const update = async (patch: Partial<{ status: TaskStatus; outputFile: string; error: string }>) => {
    await BuildTaskModel.updateOne({ taskId }, { $set: patch }).catch((err) => {
      console.warn(`[Build ${taskId}] DB update failed:`, err)
    })
  }

  // 等待并发槽位（超出 MAX_CONCURRENT_BUILDS 时在此阻塞）
  await acquireSlot()

  try {
    await update({ status: 'running' })
    console.log(`[Build ${taskId}] step 1/3 scaffold ...`)
    await scaffold({ appJson, appName, outputDir: projectDir, width, height, banvasglVersion })

    console.log(`[Build ${taskId}] step 2/3 bundle ...`)
    await bundle({ projectDir, outputDir: distDir })

    console.log(`[Build ${taskId}] step 3/3 electron-builder ...`)
    await buildElectron({ distDir, outputDir, appName, platform, width, height })

    // 找到生成的安装包文件，移动到持久化存储目录
    const tmpOutputFile = findOutputFile(outputDir, platform)
    let outputFile: string | undefined
    if (tmpOutputFile) {
      const taskStorageDir = path.join(STORAGE_DIR, taskId)
      fs.mkdirSync(taskStorageDir, { recursive: true })
      const fileName = path.basename(tmpOutputFile)
      outputFile = path.join(taskStorageDir, fileName)
      fs.copyFileSync(tmpOutputFile, outputFile)
    }
    await update({ status: 'success', ...(outputFile ? { outputFile } : {}) })
    console.log(`[Build ${taskId}] done → ${outputFile}`)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    await update({ status: 'failed', error: message })
    console.error(`[Build ${taskId}] failed:`, err)
  } finally {
    releaseSlot()
    // 清理工作目录（保留 output 中的产物，只删 project 目录）
    cleanWorkDir(workDir, taskId)
  }
}

/**
 * 清理构建工作目录
 * 安装包已移至持久化存储目录，workDir 可完全删除
 */
function cleanWorkDir(workDir: string, taskId: string): void {
  try {
    if (fs.existsSync(workDir)) {
      fs.rmSync(workDir, { recursive: true, force: true })
      console.log(`[Build ${taskId}] cleaned work dir`)
    }
  } catch (cleanErr) {
    // 清理失败不影响任务状态，只记录日志
    console.warn(`[Build ${taskId}] cleanup failed:`, cleanErr)
  }
}

/** 在 outputDir 中找到对应平台的安装包文件（取最大的匹配文件，排除 yml/blockmap 等元数据） */
function findOutputFile(outputDir: string, platform: Platform): string | undefined {
  if (!fs.existsSync(outputDir)) return undefined
  const extMap: Record<Platform, string[]> = {
    mac: ['.dmg'],
    win: ['.exe'],
    linux: ['.AppImage'],
  }
  const exts = extMap[platform]
  const files = fs.readdirSync(outputDir)
  const matched = files
    .filter((f) => exts.some((ext) => f.endsWith(ext)))
    .map((f) => {
      const fullPath = path.join(outputDir, f)
      const size = fs.statSync(fullPath).size
      return { fullPath, size }
    })
    .sort((a, b) => b.size - a.size) // 按文件大小降序，安装包通常最大

  return matched[0]?.fullPath
}
