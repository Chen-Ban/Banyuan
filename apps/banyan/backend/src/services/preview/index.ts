/**
 * preview service — 预览服务
 *
 * 不需要打包，直接在浏览器里通过 esm.sh CDN 加载 React + @banyuan/banvas-runtime-web，
 * 将 appJson 内联到 HTML 中，返回一个可直接在 iframe 里打开的页面。
 *
 * 流程：
 *   POST /preview        → 存储预览数据，返回 previewId
 *   GET  /preview/:id    → 返回内联了 appJson 的完整 HTML 页面
 */

import { randomUUID } from 'crypto'

export interface PreviewData {
  previewId: string
  appJson: string
  width: number
  height: number
  canvasVersion: string
  createdAt: number
}

// 内存存储（进程重启后丢失，预览是临时性的，可接受）
const previewMap = new Map<string, PreviewData>()

/** 预览数据最长保留时间：1 小时 */
const PREVIEW_TTL_MS = 60 * 60 * 1000

/**
 * 创建预览，返回 previewId
 */
export function createPreview(appJson: string, width: number, height: number, canvasVersion: string): string {
  const previewId = randomUUID()
  previewMap.set(previewId, { previewId, appJson, width, height, canvasVersion, createdAt: Date.now() })
  // 定时清理，避免内存泄漏
  setTimeout(() => previewMap.delete(previewId), PREVIEW_TTL_MS)
  return previewId
}

/**
 * 获取预览数据
 */
export function getPreview(previewId: string): PreviewData | undefined {
  return previewMap.get(previewId)
}

/**
 * 生成预览 HTML
 *
 * 使用 esm.sh 加载 React 和 @banyuan/banvas-runtime-web（ESM CDN），
 * 将 appJson 内联为 JS 常量，无需任何构建步骤。
 *
 * 注意：@banyuan/banvas-runtime-web 需要已发布到 npm 公网，版本号与 scaffold 保持一致。
 */
export function buildPreviewHtml(data: PreviewData): string {
  const { appJson, width, height, canvasVersion } = data
  // 安全地内联 JSON：转义 </script> 防止 XSS
  const safeAppJson = JSON.stringify(appJson).replace(/<\/script>/gi, '<\\/script>')

  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Banyuan Preview</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        background: #1a1a1a;
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module">
      import React from 'https://esm.sh/react@19.1.0'
      import { createRoot } from 'https://esm.sh/react-dom@19.1.0/client'
      import { useRuntimeBanvas } from 'https://esm.sh/@banyuan/banvas-runtime-web@${canvasVersion}'

      const APP_JSON = ${safeAppJson}
      const APP_PAGES = JSON.parse(APP_JSON)
      const WIDTH = ${width}
      const HEIGHT = ${height}

      function App() {
        const { Banvas } = useRuntimeBanvas(APP_PAGES, { width: WIDTH, height: HEIGHT })
        return React.createElement(React.Fragment, null, Banvas)
      }

      createRoot(document.getElementById('root')).render(
        React.createElement(React.StrictMode, null, React.createElement(App))
      )
    </script>
  </body>
</html>
`
}
