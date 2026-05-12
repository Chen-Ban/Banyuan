/**
 * scaffold.ts — 脚手架生成器
 *
 * 根据用户的 App JSON，生成一个最小化的 React 项目：
 *   <outputDir>/
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
    const { appJson, appName, outputDir, width, height } = options

    // 1. 创建目录
    fs.mkdirSync(outputDir, { recursive: true })
    fs.mkdirSync(path.join(outputDir, 'src'), { recursive: true })

    // 2. index.html
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

    // 3. package.json
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
            banvasgl: '^0.0.0-test.1',
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

    // 4. vite.config.ts
    const viteConfig = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
`
    fs.writeFileSync(path.join(outputDir, 'vite.config.ts'), viteConfig, 'utf-8')

    // 5. tsconfig.json
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

    // 6. src/main.tsx
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

    // 7. src/App.tsx — 内联 appJson、width、height
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
