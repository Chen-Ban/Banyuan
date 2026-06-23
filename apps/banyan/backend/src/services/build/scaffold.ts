/**
 * scaffold.ts — 脚手架生成器
 *
 * 根据用户的 App JSON，生成一个最小化的 React 项目：
 *   <outputDir>/
 *   ├── .npmrc
 *   ├── index.html
 *   ├── package.json
 *   ├── vite.config.ts
 *   ├── tsconfig.json
 *   └── src/
 *       ├── main.tsx          ← ReactDOM.createRoot + <App />
 *       ├── App.tsx           ← useRuntimeBanvas(appJson) + 渲染 <Banvas>
 *       └── app.json          ← 应用数据（从 App.tsx 中分离，避免 bundle 体积膨胀）
 *
 * app.json 分离策略：
 *   APP_DATA 数据从内联 JS 中分离为独立的 public/app.json，
 *   运行时通过 fetch('/app.json') 异步加载。
 *   对于复杂应用，app.json 可达数 MB，分离后可利用浏览器缓存，
 *   并由 Vite/Nginx 的 gzip 压缩降低传输体积 60-80%。
 */

import * as fs from 'fs'
import * as path from 'path'

export interface ScaffoldOptions {
  appJson: string      // App 级别序列化 JSON（SerializedData 格式，包含 lifetimes + scenes）
  appName: string      // 应用名称，用于 package.json name 和 HTML title
  outputDir: string    // 生成项目的目标目录（绝对路径）
  /** 设计尺寸宽度（px），仅供 Electron 窗口初始大小参考，应用内容运行时自适应容器 */
  width?: number
  /** 设计尺寸高度（px） */
  height?: number
  /** @banyuan/banvasgl 版本号（由前端传入，确保与用户运行时一致） */
  canvasVersion: string
  /** @banyuan/banvas-runtime-web 版本号 */
  runtimeVersion?: string
  /** Vite build 产物目录，相对于 outputDir，默认 'dist' */
  distDir?: string
}

function toKebabCase(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .trim()
}

export async function scaffold(options: ScaffoldOptions): Promise<void> {
  const { appJson, appName, outputDir, canvasVersion, runtimeVersion, distDir = 'dist' } = options

  // 1. 创建目录
  fs.mkdirSync(outputDir, { recursive: true })
  fs.mkdirSync(path.join(outputDir, 'src'), { recursive: true })
  // public 目录：存放 pages.json，Vite 会将其原样复制到 dist/
  fs.mkdirSync(path.join(outputDir, 'public'), { recursive: true })

  // 2. .npmrc — 固定 pnpm 行为，后续切换私有 registry 只需改这里
  const npmrc = [
    '# 由 Banyuan 构建器自动生成',
    'prefer-offline=true',
    'fund=false',
    'audit=false',
  ].join('\n') + '\n'
  fs.writeFileSync(path.join(outputDir, '.npmrc'), npmrc, 'utf-8')

  // 3. index.html
  const indexHtml = `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${appName}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body, #root { width: 100%; height: 100%; overflow: hidden; }
      body { background: #000; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`
  fs.writeFileSync(path.join(outputDir, 'index.html'), indexHtml, 'utf-8')

  // 4. package.json
  const packageJson = {
    name: toKebabCase(appName),
    version: '1.0.0',
    private: true,
    scripts: {
      dev: 'vite',
      build: 'vite build',
      preview: 'vite preview',
    },
    dependencies: {
      react: '^19.1.0',
      'react-dom': '^19.1.0',
      '@banyuan/banvasgl': `^${canvasVersion}`,
      '@banyuan/banvas-runtime-web': `^${runtimeVersion ?? canvasVersion}`,
    },
    devDependencies: {
      '@types/react': '^19.1.2',
      '@types/react-dom': '^19.1.2',
      '@vitejs/plugin-react': '^4.3.4',
      typescript: '~5.7.3',
      vite: '^6.3.5',
    },
  }
  fs.writeFileSync(
    path.join(outputDir, 'package.json'),
    JSON.stringify(packageJson, null, 2),
    'utf-8'
  )

  // 5. vite.config.ts — outDir 与 ScaffoldOptions.distDir 保持一致
  const viteConfig = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: ${JSON.stringify(distDir)},
    emptyOutDir: true,
  },
})
`
  fs.writeFileSync(path.join(outputDir, 'vite.config.ts'), viteConfig, 'utf-8')

  // 6. tsconfig.json
  const tsconfig = {
    compilerOptions: {
      target: 'ES2020',
      lib: ['ES2020', 'DOM', 'DOM.Iterable'],
      module: 'ESNext',
      moduleResolution: 'bundler',
      jsx: 'react-jsx',
      strict: true,
      skipLibCheck: true,
      noEmit: true,
    },
    include: ['src'],
  }
  fs.writeFileSync(
    path.join(outputDir, 'tsconfig.json'),
    JSON.stringify(tsconfig, null, 2),
    'utf-8'
  )

  // 7. src/main.tsx
  const mainTsx = `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
`
  fs.writeFileSync(path.join(outputDir, 'src', 'main.tsx'), mainTsx, 'utf-8')

  // 8. public/app.json — 应用数据从 App.tsx 中分离
  //    Vite 会将 public/ 目录原样复制到 dist/，运行时通过 fetch('/app.json') 加载
  //    分离后可利用浏览器缓存，并由静态服务器的 gzip 压缩降低传输体积
  const appDataJson = JSON.stringify(JSON.parse(appJson))
  fs.writeFileSync(path.join(outputDir, 'public', 'app.json'), appDataJson, 'utf-8')

  // 9. src/App.tsx — 运行时动态获取容器尺寸，应用自适应填充
  const appTsx = `import { useState, useEffect, useRef } from 'react'
import { useRuntimeBanvas } from '@banyuan/banvas-runtime-web'

/** 动态获取容器尺寸，监听 resize 自适应 */
function useContainerSize() {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight })

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const update = () => {
      setSize({ width: el.clientWidth, height: el.clientHeight })
    }
    update()

    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return { ref, size }
}

export default function App() {
  const [appData, setAppData] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { ref: containerRef, size } = useContainerSize()

  useEffect(() => {
    fetch('/app.json')
      .then((res) => {
        if (!res.ok) throw new Error(\`Failed to load app.json: \${res.status}\`)
        return res.json() as Promise<Record<string, unknown>>
      })
      .then(setAppData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }, [])

  const { Banvas } = useRuntimeBanvas({
    uiJSON: appData,
    width: size.width,
    height: size.height,
  })

  if (error) {
    return (
      <div style={{ color: '#fff', padding: 24, fontFamily: 'monospace' }}>
        <strong>加载失败：</strong> {error}
      </div>
    )
  }

  if (!appData) {
    return null // 加载中，静默等待
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      {Banvas}
    </div>
  )
}
`
  fs.writeFileSync(path.join(outputDir, 'src', 'App.tsx'), appTsx, 'utf-8')
}
