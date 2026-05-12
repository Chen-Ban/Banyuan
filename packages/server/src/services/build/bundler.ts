/**
 * bundler.ts — Vite 打包执行器
 *
 * 对脚手架生成的 React 项目执行 npm install + vite build，
 * 输出静态 HTML + JS 到 dist/
 */

import { spawn } from 'child_process'

export interface BundleOptions {
    projectDir: string   // 脚手架生成的项目目录（绝对路径）
    outputDir: string    // Vite build 产物目录（绝对路径，通常是 projectDir/dist）
}

function runCommand(cmd: string, args: string[], cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, {
            cwd,
            stdio: 'inherit',
            shell: process.platform === 'win32',  // Windows 需要 shell: true
        })
        child.on('close', (code) => {
            if (code === 0) resolve()
            else reject(new Error(`Command "${cmd} ${args.join(' ')}" exited with code ${code}`))
        })
        child.on('error', reject)
    })
}

export async function bundle(options: BundleOptions): Promise<void> {
    const { projectDir } = options
    // 1. 安装依赖
    await runCommand('npm', ['install', '--prefer-offline'], projectDir)
    // 2. 执行 Vite 打包
    await runCommand('npm', ['run', 'build'], projectDir)
}
