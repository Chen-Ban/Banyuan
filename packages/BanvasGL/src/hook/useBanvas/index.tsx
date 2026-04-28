import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useCanvasInit } from './useCanvasInit'
import { useCanvasEvents } from './useCanvasEvents'
import { useInputEvents } from './useInputEvents'
import { SerializedSceneJSON, UseBanvasOptions, UseBanvasResult } from './types'
import { Scene } from '@/core/scene'

export default function useBanvas(
    serializedScenes: SerializedSceneJSON[],
    _options: UseBanvasOptions
): UseBanvasResult {
    const containerRef = useRef<HTMLDivElement | null>(null)
    const inputRef = useRef<HTMLInputElement | null>(null)

    const [selectedScene, setSelectedScene] = useState<Scene | null>(null)
    const [selectedViewId, setSelectedViewId] = useState<string>('')

    // Canvas 初始化
    const { app, canvasRef } = useCanvasInit(serializedScenes, _options)

    useEffect(() => {
        const scene = app?.getCurrentPage()
        if (scene) {
            setSelectedScene(scene)
        }
    }, [app, setSelectedScene])

    // Canvas 事件绑定
    useCanvasEvents({
        app,
        canvasRef,
        inputRef,
        setSelectedViewId,
    })

    // Input 事件绑定
    useInputEvents({
        app,
        inputRef,
        setSelectedViewId,
    })

    const canvasEl = useMemo(
        () => (
            <div
                ref={containerRef}
                style={{
                    position: 'relative',
                }}
            >
                <canvas
                    ref={canvasRef}
                    style={{
                        display: 'block',
                    }}
                />
                <input
                    ref={inputRef}
                    type="text"
                    style={{
                        opacity: 0,
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        width: 100,
                        height: 20,
                        border: '1px solid #000',
                    }}
                />
            </div>
        ),
        []
    )

    return {
        Banvas: canvasEl,
        app,
        selectedViewId,
        selectedScene,
        setSelectedScene,
        setSelectedViewId,
    }
}
