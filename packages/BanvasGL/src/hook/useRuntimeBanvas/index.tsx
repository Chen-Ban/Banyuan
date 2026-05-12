import React, { useCallback, useMemo, useSyncExternalStore } from 'react'
import { useCanvasInit } from '../useCanvasInit'
import { useRuntimeEvents } from './canvas/useRuntimeEvents'
import type { SerializedPageJSON, UseCanvasOptions } from '../useCanvasInit'

export type { SerializedPageJSON }

export interface UseRuntimeBanvasOptions {
    width: number
    height: number
    appOptions?: UseCanvasOptions['appOptions']
    rendererOptions?: UseCanvasOptions['rendererOptions']
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
 * 使用场景：
 *   - banyan 编辑器内的"预览"模式
 *   - 打包后的独立运行时应用
 */
export default function useRuntimeBanvas(
    serializedPages: SerializedPageJSON[],
    options: UseRuntimeBanvasOptions,
): UseRuntimeBanvasResult {
    const { app, canvasRef, canvasCallbackRef } = useCanvasInit(serializedPages, options)

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
