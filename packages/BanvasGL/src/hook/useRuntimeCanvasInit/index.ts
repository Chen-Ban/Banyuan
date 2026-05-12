import { useCallback, useEffect, useRef, useState } from 'react'
import { App, BaseCamera, Scene } from '@/core'
import type { IAppOptions, IRendererOptions } from '@/core/interfaces'

// ── BOM 属性（内联，避免跨目录依赖） ──
function useBOMProperties(): { dpr: number } {
    const [dpr, setDpr] = useState<number>(() =>
        typeof window !== 'undefined' ? window.devicePixelRatio ?? 1 : 1,
    )

    useEffect(() => {
        if (typeof window === 'undefined') return

        // 用 matchMedia 监听当前 DPR 对应的媒体查询，
        // 当屏幕 DPR 变化（如拖动窗口到不同 DPI 屏幕）时触发 change 事件。
        // 每次触发后需重新注册，因为新的 DPR 需要新的媒体查询字符串。
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

export interface UseRuntimeCanvasOptions {
    width: number
    height: number
    appOptions?: IAppOptions
    rendererOptions?: Omit<IRendererOptions, 'dpr'>
}

export interface UseRuntimeCanvasInitResult {
    app: App | null
    canvasRef: React.RefObject<HTMLCanvasElement | null>
    canvasCallbackRef: (node: HTMLCanvasElement | null) => void
}

/**
 * useRuntimeCanvasInit — 运行时底层 Canvas 初始化 hook
 *
 * 职责：
 *   1. 创建并销毁 App 实例
 *   2. 将序列化页面数据（JSON.stringify 后的 Scene 数组）反序列化到 App
 *   3. 响应尺寸 / DPR 变化
 *
 * 入参 serializedPages：每个元素是一个 Scene 的 JSON 字符串（由 Serializer 生成）。
 *
 * 被 useRuntimeBanvas 使用，不包含任何事件绑定或业务逻辑。
 * 这是跨平台适配的分叉点（Web / 小程序 / Native）。
 */
export function useRuntimeCanvasInit(
    /** 每个元素是一个 Scene 的 JSON 字符串，由 Serializer.serialize() 生成 */
    serializedPages: string[],
    options: UseRuntimeCanvasOptions,
): UseRuntimeCanvasInitResult {
    const { dpr } = useBOMProperties()
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const [canvasNode, setCanvasNode] = useState<HTMLCanvasElement | null>(null)
    const [app, setApp] = useState<App | null>(null)

    // callback ref：同步更新 canvasRef + 触发 state 变化
    const canvasCallbackRef = useCallback((node: HTMLCanvasElement | null) => {
        canvasRef.current = node
        setCanvasNode(node)
    }, [])

    // 统一设置画布逻辑尺寸与样式尺寸
    const applyCanvasSize = useCallback(() => {
        if (!canvasNode) return
        canvasNode.style.width = `${options.width}px`
        canvasNode.style.height = `${options.height}px`
        canvasNode.width = options.width * dpr
        canvasNode.height = options.height * dpr
    }, [canvasNode, options.width, options.height, dpr])

    // Effect 1: App 初始化（canvas 就绪后创建）
    useEffect(() => {
        if (!canvasNode) return
        applyCanvasSize()
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

    // Effect 2: 页面初始化（将序列化数据填充到 app）
    useEffect(() => {
        if (!app) return
        const existingScenes = app.getScenes()
        existingScenes.forEach((scene) => app.removeScene(scene))
        if (Array.isArray(serializedPages) && serializedPages.length > 0) {
            app.initFromSerializedScenes(serializedPages)
        } else {
            const camera = new BaseCamera()
            const scene = new Scene(camera)
            app.addScene(scene)
            app.navigateTo(scene)
        }
        app.notify()
    }, [app, serializedPages])

    // Effect 3: 尺寸 / DPR 变化时更新画布
    useEffect(() => {
        if (!canvasNode || !app) return
        applyCanvasSize()
        app.renderer.setDPR(dpr)
    }, [app, applyCanvasSize, dpr])

    return { app, canvasRef, canvasCallbackRef }
}
