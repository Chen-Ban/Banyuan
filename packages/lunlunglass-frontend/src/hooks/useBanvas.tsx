import React, { useRef, useEffect, useState } from 'react'
import { App, Renderer, AppOptions, RendererOptions } from 'banvasgl'

export interface UseBanvasOptions {
  width?: number
  height?: number
  appOptions?: AppOptions
  rendererOptions?: RendererOptions
}

export interface UseBanvasReturn {
  app: App | null
  canvas: React.ReactElement
}

/**
 * useBanvas Hook
 * 提供BanvasGL应用实例和封装好的画布组件
 */
export const useBanvas = (options: UseBanvasOptions = {}): UseBanvasReturn => {
  const {
    width = 800,
    height = 600,
    appOptions = {},
    rendererOptions = {},
  } = options

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [app, setApp] = useState<App | null>(null)

  // 初始化应用
  useEffect(() => {
    if (!canvasRef.current) return

    try {
      // 创建渲染器
      const renderer = new Renderer(canvasRef.current, rendererOptions)

      // 创建应用实例
      const banvasApp = new App(renderer, appOptions)
      
      // 启动应用
      banvasApp.launch()

      // 使用setTimeout确保在下一个事件循环中设置状态
      setApp(banvasApp)
      

    } catch (error) {
      console.error('Failed to initialize BanvasGL app:', error)
    }
  }, []) // 只在组件挂载时执行一次

  // 封装好的画布组件
  const canvas = (
    <canvas ref={canvasRef} width={width} height={height} />
  )

  return {
    app,
    canvas
  }
}

export default useBanvas
