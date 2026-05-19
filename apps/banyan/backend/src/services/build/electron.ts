/**
 * electron.ts — Electron 打包器
 *
 * 使用 electron-builder 将 Vite 产物打包为桌面安装包。
 * 支持 mac（.dmg）、win（.exe）、linux（.AppImage）三个平台。
 */

import * as fs from 'fs'
import * as path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export type Platform = 'mac' | 'win' | 'linux'

export interface ElectronBuildOptions {
  /** Vite 打包产物目录（绝对路径） */
  distDir: string
  /** electron-builder 输出目录（绝对路径） */
  outputDir: string
  /** 应用名称 */
  appName: string
  /** 目标平台 */
  platform: Platform
  /** 画布宽度（px），用于设置窗口初始尺寸 */
  width: number
  /** 画布高度（px） */
  height: number
}

/** 平台 → electron-builder CLI 参数映射 */
const PLATFORM_FLAG: Record<Platform, string> = {
  mac: '--mac',
  win: '--win',
  linux: '--linux',
}

export async function buildElectron(options: ElectronBuildOptions): Promise<void> {
  const { distDir, outputDir, appName, platform, width, height } = options

  // 1. 在 distDir 同级创建 electron 主进程入口
  const electronDir = path.join(path.dirname(distDir), 'electron')
  fs.mkdirSync(electronDir, { recursive: true })

  const mainJs = `const { app, BrowserWindow } = require('electron')
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
  win.loadFile(path.join(__dirname, '../dist/index.html'))
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
`
  fs.writeFileSync(path.join(electronDir, 'main.js'), mainJs, 'utf-8')

  // 2. 生成 electron-builder 配置
  const builderConfig = {
    appId: `com.banyuan.${appName.toLowerCase().replace(/\s+/g, '-')}`,
    productName: appName,
    directories: {
      output: outputDir,
    },
    files: [
      'dist/**/*',
      'electron/**/*',
    ],
    mac: { target: 'dmg' },
    win: { target: 'nsis' },
    linux: { target: 'AppImage' },
  }

  const builderConfigPath = path.join(path.dirname(distDir), 'electron-builder.json')
  fs.writeFileSync(builderConfigPath, JSON.stringify(builderConfig, null, 2), 'utf-8')

  // 3. 生成临时 package.json（electron-builder 需要）
  const pkgPath = path.join(path.dirname(distDir), 'package.json')
  const pkg = {
    name: appName.toLowerCase().replace(/\s+/g, '-'),
    version: '1.0.0',
    main: 'electron/main.js',
    private: true,
  }
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf-8')

  // 4. 执行 electron-builder（需全局安装或通过 npx）
  await execFileAsync(
    'npx',
    ['electron-builder', PLATFORM_FLAG[platform], '--config', builderConfigPath],
    {
      cwd: path.dirname(distDir),
      timeout: 10 * 60 * 1000, // 10 分钟超时
      env: { ...process.env, ELECTRON_BUILDER_ALLOW_UNRESOLVED_DEPENDENCIES: 'true' },
    }
  )
}
