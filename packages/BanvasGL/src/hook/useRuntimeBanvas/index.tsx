import React, { useCallback, useMemo, useSyncExternalStore } from 'react'
import { useRuntimeCanvasInit } from '../useRuntimeCanvasInit'
import { useRuntimeEvents } from './canvas/useRuntimeEvents'
import type { UseRuntimeCanvasOptions } from '../useRuntimeCanvasInit'

export interface UseRuntimeBanvasOptions {
    width: number
    height: number
    appOptions?: UseRuntimeCanvasOptions['appOptions']
    rendererOptions?: UseRuntimeCanvasOptions['rendererOptions']
}

export interface UseRuntimeBanvasResult {
    /** 渲染好的 Canvas React 元素 */
    Banvas: React.ReactElement
}

/**
 * useRuntimeBanvas — 运行态 hook
 *
 * 职责：
 *   - 加载序列化页面数据并渲染
 *   - 绑定运行态事件（onClick / onMouseEnter 等触发 FlowSchema）
 *   - 不暴露任何编辑器概念（无 actions / pages / contextMenu）
 *
 * 入参 serializedPages：每个元素是一个 Scene 的 JSON 字符串（由 Serializer 生成）。
 *
 * 使用场景：
 *   - 低代码平台内的"预览"模式（import from 'banvasgl/runtime'）
 *   - scaffold 打包后的独立运行时应用（同上）
 */
export default function useRuntimeBanvas(
    /** 每个元素是一个 Scene 的 JSON 字符串，由 Serializer.serialize() 生成 */
    serializedPages: string[],
    options: UseRuntimeBanvasOptions,
): UseRuntimeBanvasResult {
    const { app, canvasRef, canvasCallbackRef } = useRuntimeCanvasInit(serializedPages, options)

    // 监听 app 状态变更驱动重渲染（FlowRunner 执行 setData 后会 markDirty → notify）
    const subscribe = useCallback(
        (onStoreChange: () => void) => {
            if (!app) return () => {}
            return app.subscribe(onStoreChange)
        },
        [app],
    )

    const getSnapshot = useCallback(() => {
        if (!app) return 0
        return app.getVersion()
    }, [app])

    useSyncExternalStore(subscribe, getSnapshot)

    // 绑定运行态事件
    useRuntimeEvents({ app, canvasRef })

    const Banvas = useMemo(
        () => (
            <div style={{ position: 'relative' }}>
                <canvas ref={canvasCallbackRef} style={{ display: 'block' }} />
            </div>
        ),
        [canvasCallbackRef],
    )

    return { Banvas }
}
