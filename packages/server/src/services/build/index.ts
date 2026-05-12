/**
 * build service — 生成应用服务
 *
 * 完整流程：
 *   1. scaffold()      — 生成最小 React 项目
 *   2. bundle()        — Vite 打包
 *   3. buildElectron() — electron-builder 打包
 */

import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'
import { randomUUID } from 'crypto'
import { scaffold } from './scaffold'
import { bundle } from './bundler'
import { buildElectron } from './electron'
import type { Platform } from './electron'

export { scaffold, bundle, buildElectron }
export type { Platform }
export type { ScaffoldOptions } from './scaffold'
export type { BundleOptions } from './bundler'
export type { ElectronBuildOptions } from './electron'

// ── 任务状态 ──

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

// 内存任务表（进程重启后丢失，后续可替换为持久化存储）
const taskMap = new Map<string, BuildTask>()

export function getTask(taskId: string): BuildTask | undefined {
    return taskMap.get(taskId)
}

// ── 完整构建流程 ──

export interface StartBuildOptions {
    appJson: string
    appName: string
    platform: Platform
    width: number
    height: number
}

/**
 * 启动异步构建任务，立即返回 taskId
 */
export function startBuild(options: StartBuildOptions): string {
    const taskId = randomUUID()
    const task: BuildTask = {
        taskId,
        appName: options.appName,
        platform: options.platform,
        status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now(),
    }
    taskMap.set(taskId, task)

    // 异步执行，不阻塞请求
    runBuild(task, options).catch((err) => {
        console.error(`[Build ${taskId}] unexpected error:`, err)
    })

    return taskId
}

async function runBuild(task: BuildTask, options: StartBuildOptions): Promise<void> {
    const { appJson, appName, platform, width, height } = options

    // 工作目录：系统临时目录下按 taskId 隔离
    const workDir = path.join(os.tmpdir(), 'banyuan-build', task.taskId)
    const projectDir = path.join(workDir, 'project')
    const distDir = path.join(projectDir, 'dist')
    const outputDir = path.join(workDir, 'output')

    const update = (patch: Partial<BuildTask>) => {
        Object.assign(task, { ...patch, updatedAt: Date.now() })
    }

    try {
        update({ status: 'running' })
        console.log(`[Build ${task.taskId}] step 1/3 scaffold ...`)
        await scaffold({ appJson, appName, outputDir: projectDir, width, height })

        console.log(`[Build ${task.taskId}] step 2/3 bundle ...`)
        await bundle({ projectDir, outputDir: distDir })

        console.log(`[Build ${task.taskId}] step 3/3 electron-builder ...`)
        await buildElectron({ distDir, outputDir, appName, platform })

        // 找到生成的安装包文件
        const outputFile = findOutputFile(outputDir, platform)
        update({ status: 'success', outputFile })
        console.log(`[Build ${task.taskId}] done → ${outputFile}`)
    } catch (err: any) {
        update({ status: 'failed', error: err?.message ?? String(err) })
        console.error(`[Build ${task.taskId}] failed:`, err)
    }
}

/** 在 outputDir 中找到对应平台的安装包文件 */
function findOutputFile(outputDir: string, platform: Platform): string | undefined {
    if (!fs.existsSync(outputDir)) return undefined
    const extMap: Record<Platform, string[]> = {
        mac: ['.dmg'],
        win: ['.exe'],
        linux: ['.AppImage'],
    }
    const exts = extMap[platform]
    const files = fs.readdirSync(outputDir)
    const found = files.find((f) => exts.some((ext) => f.endsWith(ext)))
    return found ? path.join(outputDir, found) : undefined
}
