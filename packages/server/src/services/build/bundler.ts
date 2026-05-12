/**
 * bundler.ts — Vite 打包执行器
 *
 * 对脚手架生成的 React 项目执行 npm install + vite build，
 * 输出静态 HTML + JS 到 outputDir（由 vite.config.ts 的 outDir 决定，
 * scaffold 生成时已将 distDir 写入 vite.config.ts，两者保持一致）。
 */

import { spawn } from 'child_process'

export interface BundleOptions {
    projectDir: string   // 脚手架生成的项目目录（绝对路径）
    /** Vite build 产物目录（绝对路径）。
     *  必须与 scaffold 时传入的 distDir 对应，
     *  此处仅作文档说明，实际 outDir 由 vite.config.ts 控制。 */
    outputDir: string
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
    // 1. 安装依赖（.npmrc 中已配置 prefer-offline=true）
    await runCommand('npm', ['install'], projectDir)
    // 2. 执行 Vite 打包（outDir 由 vite.config.ts 中的 build.outDir 决定）
    await runCommand('npm', ['run', 'build'], projectDir)
}
