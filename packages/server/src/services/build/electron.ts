/**
 * electron.ts — electron-builder 执行器
 *
 * 将 Vite 打包产物套上 Electron 壳，
 * 使用 electron-builder 生成平台安装包（.dmg / .exe / .AppImage）
 */

import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

export type Platform = 'mac' | 'win' | 'linux'

export interface ElectronBuildOptions {
    distDir: string      // Vite 产物目录（绝对路径，即 projectDir/dist）
    outputDir: string    // 最终安装包输出目录（绝对路径）
    appName: string      // 应用名称
    platform: Platform
    width: number        // 应用窗口宽度（px）
    height: number       // 应用窗口高度（px）
}

function toKebabCase(name: string): string {
    return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').trim()
}

function runCommand(cmd: string, args: string[], cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, {
            cwd,
            shell: process.platform === 'win32',
            stdio: 'inherit',
        })
        child.on('close', (code) => {
            if (code === 0) {
                resolve()
            } else {
                reject(new Error(`Command "${cmd} ${args.join(' ')}" exited with code ${code}`))
            }
        })
        child.on('error', (err) => {
            reject(new Error(`Failed to spawn "${cmd}": ${err.message}`))
        })
    })
}

function buildMainJs(width: number, height: number): string {
    return `const { app, BrowserWindow } = require('electron')
const path = require('path')

function createWindow() {
  const win = new BrowserWindow({
    width: ${width},
    height: ${height},
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'))
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
`
}

export async function buildElectron(options: ElectronBuildOptions): Promise<void> {
    const { distDir, outputDir, appName, platform, width, height } = options
    const kebabName = toKebabCase(appName)

    // 步骤1：在 distDir 同级创建 electron-wrapper 目录
    const wrapperDir = path.join(distDir, '..', 'electron-wrapper')
    fs.mkdirSync(wrapperDir, { recursive: true })

    // 步骤2：写入 main.js（窗口尺寸由 width/height 决定）
    fs.writeFileSync(path.join(wrapperDir, 'main.js'), buildMainJs(width, height), 'utf-8')

    // 步骤3：写入 package.json
    const packageJson = {
        name: kebabName,
        version: '1.0.0',
        main: 'main.js',
        scripts: {
            dist: 'electron-builder',
        },
        build: {
            appId: `com.banyuan.${kebabName}`,
            productName: appName,
            directories: {
                // 使用相对路径，避免 electron-builder 跨目录绝对路径解析问题
                output: '../output',
            },
            files: [
                'main.js',
                'renderer/**/*',
            ],
            mac: {
                target: 'dmg',
            },
            win: {
                target: 'nsis',
            },
            linux: {
                target: 'AppImage',
            },
        },
        devDependencies: {
            electron: '^31.0.0',
            'electron-builder': '^24.13.3',
        },
    }
    fs.writeFileSync(
        path.join(wrapperDir, 'package.json'),
        JSON.stringify(packageJson, null, 2),
        'utf-8'
    )

    // 步骤4：将 distDir 内容复制到 electron-wrapper/renderer/
    const rendererDir = path.join(wrapperDir, 'renderer')
    fs.mkdirSync(rendererDir, { recursive: true })
    fs.cpSync(distDir, rendererDir, { recursive: true })

    // 步骤5：安装 electron 依赖
    await runCommand('npm', ['install', '--prefer-offline'], wrapperDir)

    // 步骤6：执行 electron-builder
    const platformFlag = `--${platform}`
    await runCommand('npx', ['electron-builder', platformFlag], wrapperDir)
}
