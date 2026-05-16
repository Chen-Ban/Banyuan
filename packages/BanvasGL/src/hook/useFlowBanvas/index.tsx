import React, {
    useCallback,
    useMemo,
    useSyncExternalStore,
} from 'react'
import { useCanvasInit } from '../useCanvasInit'
import type { SerializedPageJSON } from '../useCanvasInit'
import { useFlowCanvasEvents } from './canvas/useFlowCanvasEvents'
import type { App } from '@/core/app'

export interface UseFlowBanvasOptions {
    width: number
    height: number
    backgroundColor?: string
}

export interface UseFlowBanvasResult {
    /** 渲染好的 Canvas React 元素 */
    Canvas: React.ReactElement
    /** App 实例引用（高级用法） */
    app: App | null
}

/**
 * 流程图画布专用 hook（EventsTab 内嵌流程图编辑器使用）
 *
 * 与 useDesignBanvas 的区别：
 * - 使用 useFlowCanvasEvents（只支持 MOVE + CONNECT）
 * - 不绑定 input、右键菜单、拖拽创建
 * - 不暴露 actions/pages 等主编辑器概念
 * - 交互结束时通过 onSchemaChange 通知调用方写回 FlowSchema
 */
export default function useFlowBanvas(
    serializedPages: SerializedPageJSON[],
    options: UseFlowBanvasOptions,
    onSchemaChange?: () => void,
): UseFlowBanvasResult {
    const { width, height, backgroundColor } = options

    const { app, canvasRef, canvasCallbackRef } = useCanvasInit(serializedPages, {
        width,
        height,
        rendererOptions: backgroundColor
            ? { backgroundColor, clearColor: backgroundColor }
            : undefined,
    })

    // 监听 app 状态变更驱动重渲染
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

    // 交互结束回调
    const handleInteractionEnd = useCallback(() => {
        app?.notify()
        onSchemaChange?.()
    }, [app, onSchemaChange])

    // 绑定流程图事件
    useFlowCanvasEvents({
        app,
        canvasRef,
        onInteractionEnd: handleInteractionEnd,
    })

    const canvasEl = useMemo(
        () => (
            <div style={{ position: 'relative' }}>
                <canvas
                    ref={canvasCallbackRef}
                    style={{ display: 'block' }}
                />
            </div>
        ),
        [canvasCallbackRef],
    )

    return {
        Canvas: canvasEl,
        app,
    }
}
