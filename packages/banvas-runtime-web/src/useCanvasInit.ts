import { useCallback, useEffect, useRef, useState } from 'react'
import { App, BaseCamera, Scene } from '@banyuan/banvasgl'
import type { IAppOptions, IRendererOptions } from '@banyuan/banvasgl'
import type { SerializedPageJSON } from '@banyuan/banvas-runtime'

// ── BOM 属性（内联，避免跨目录依赖） ──
function useBOMProperties(): { dpr: number } {
    const [dpr, setDpr] = useState<number>(() =>
        typeof window !== 'undefined' ? (window.devicePixelRatio ?? 1) : 1,
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

// ── 公共类型 ──

/**
 * useCanvasInit 初始化选项
 *
 * rendererOptions 中的 showGrid / showRuler 字段已在 IRendererOptions 中声明，
 * 但渲染器尚未实现，传入后暂时无视觉效果，待后续 Renderer 层实现。
 */
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
 *   2. 将序列化页面数据反序列化到 App
 *   3. 响应尺寸 / DPR 变化
 *
 * 被 useDesignBanvas、useFlowBanvas、useRuntimeBanvas 共用。
 * 不包含任何事件绑定或业务逻辑。
 *
 * 网格、标尺、背景色等渲染配置统一通过 rendererOptions 传入，
 * 由 App 层透传给 Renderer，hook 层保持薄。
 *
 * 注意：这是 Web 平台适配的实现。
 * 其他平台适配（iOS / Android / Desktop）将提供各自的初始化函数。
 */
export function useCanvasInit(
    serializedPages: SerializedPageJSON[],
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
    // 尺寸由 Effect 3 的 handleResize 统一设置，此处无需手动设置
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

    // Effect 2: 页面初始化（将序列化数据填充到 app）
    useEffect(() => {
        if (!app) return

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

    // Effect 3: 尺寸 / DPR 变化时更新画布物理像素
    // 引擎只关心虚拟尺寸（物理像素 = 逻辑尺寸 × DPR），
    // CSS 样式尺寸（显示多大）由外层 useCanvasZoom 控制。
    useEffect(() => {
        if (!app) return
        app.handleResize(options.width * dpr, options.height * dpr, dpr)
    }, [app, dpr, options.width, options.height])

    return { app, canvasRef, canvasCallbackRef }
}
