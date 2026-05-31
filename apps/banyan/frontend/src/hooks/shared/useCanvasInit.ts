import { useCallback, useEffect, useRef, useState } from 'react'
import { App, BaseCamera, Scene } from '@banyuan/banvasgl'
import type { IAppOptions, IRendererOptions } from '@banyuan/banvasgl'

// ── BOM 属性（内联，避免跨目录依赖） ──
function useBOMProperties(): { dpr: number } {
    const [dpr, setDpr] = useState<number>(() =>
        typeof window !== 'undefined' ? (window.devicePixelRatio ?? 1) : 1,
    )

    useEffect(() => {
        if (typeof window === 'undefined') return

        let mql: MediaQueryList | null = null

        const listen = () => {
            const currentDpr = window.devicePixelRatio ?? 1
            setDpr(currentDpr)
            mql?.removeEventListener('change', listen)
            mql = window.matchMedia(`(resolution: ${currentDpr}dppx)`)
            mql.addEventListener('change', listen)
        }

        listen()

        return () => {
            mql?.removeEventListener('change', listen)
        }
    }, [])

    return { dpr }
}

// ── 公共类型 ──

export interface UseCanvasOptions {
    width: number
    height: number
    appOptions?: IAppOptions
    rendererOptions?: Omit<IRendererOptions, 'dpr'>
}

export interface UseCanvasInitResult {
    app: App | null
    canvasRef: React.RefObject<HTMLCanvasElement | null>
    canvasCallbackRef: (node: HTMLCanvasElement | null) => void
}

/**
 * useCanvasInit — 底层 Canvas 初始化 hook
 *
 * 职责：
 *   1. 创建并销毁 App 实例
 *   2. 将序列化的 appJSON 反序列化到 App
 *   3. 响应尺寸 / DPR 变化
 *
 * 被 useDesignBanvas、useFlowBanvas 共用。
 * 不包含任何事件绑定或业务逻辑。
 */
export function useCanvasInit(
    appJSON: string,
    options: UseCanvasOptions,
): UseCanvasInitResult {
    const { dpr } = useBOMProperties()
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const [canvasNode, setCanvasNode] = useState<HTMLCanvasElement | null>(null)
    const [app, setApp] = useState<App | null>(null)

    // callback ref：同步更新 canvasRef + 触发 state 变化
    const canvasCallbackRef = useCallback((node: HTMLCanvasElement | null) => {
        canvasRef.current = node
        setCanvasNode(node)
    }, [])

    // Effect 1: App 初始化（canvas 就绪后创建）
    useEffect(() => {
        if (!canvasNode) return

        const _app = App.create(canvasNode, options.appOptions ?? {}, {
            ...options.rendererOptions,
            dpr,
        })
        _app.launch({})
        setApp(_app)

        return () => {
            _app.destroy()
            setApp(null)
        }
    }, [canvasNode]) // eslint-disable-line react-hooks/exhaustive-deps

    // Effect 2: 从 appJSON 恢复应用状态
    useEffect(() => {
        if (!app) return

        if (appJSON) {
            app.initFromSerialized(appJSON)
        } else {
            // 空应用：创建默认空白页
            const camera = new BaseCamera()
            const scene = new Scene(camera)
            app.addScene(scene)
            app.navigateTo(scene)
        }

        app.notify()
    }, [app, appJSON])

    // Effect 3: 尺寸 / DPR 变化时更新画布物理像素
    useEffect(() => {
        if (!app) return
        app.handleResize(options.width * dpr, options.height * dpr, dpr)
    }, [app, dpr, options.width, options.height])

    return { app, canvasRef, canvasCallbackRef }
}
