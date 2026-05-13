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
 *       └── App.tsx           ← useRuntimeBanvas(appJson) + 渲染 <Banvas>
 */

import * as fs from 'fs'
import * as path from 'path'

export interface ScaffoldOptions {
    appJson: string      // 序列化的 App JSON（多页面数组，JSON.stringify 后的字符串）
    appName: string      // 应用名称，用于 package.json name 和 HTML title
    outputDir: string    // 生成项目的目标目录（绝对路径）
    width: number        // 画布宽度（px）
    height: number       // 画布高度（px）
    /** banvasgl 版本号（由前端传入，确保与用户运行时一致） */
    banvasglVersion: string
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
    const { appJson, appName, outputDir, width, height, banvasglVersion, distDir = 'dist' } = options

    // 1. 创建目录
    fs.mkdirSync(outputDir, { recursive: true })
    fs.mkdirSync(path.join(outputDir, 'src'), { recursive: true })

    // 2. .npmrc — 固定 npm 行为，后续切换私有 registry 只需改这里
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
      body { background: #000; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
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
            banvasgl: `^${banvasglVersion}`,
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

    // 8. src/App.tsx — 内联 appJson、width、height
    const appPages = JSON.stringify(JSON.parse(appJson))
    const appTsx = `import useRuntimeBanvas from 'banvasgl/runtime'

// 由生成器内联的应用数据
const APP_PAGES: string[] = ${appPages}

export default function App() {
  const { Banvas } = useRuntimeBanvas(APP_PAGES, {
    width: ${width},
    height: ${height},
  })
  return <>{Banvas}</>
}
`
    fs.writeFileSync(path.join(outputDir, 'src', 'App.tsx'), appTsx, 'utf-8')
}
