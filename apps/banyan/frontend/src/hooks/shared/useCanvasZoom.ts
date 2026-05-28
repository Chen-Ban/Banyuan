/**
 * useCanvasZoom —— Canvas 缩放 hook
 *
 * 核心思路：
 *   - 逻辑尺寸（canvas.width / canvas.height）始终等于用户配置的页面尺寸，
 *     JSON IR 坐标系统不受影响。
 *   - 样式尺寸（canvas.style.width / canvas.style.height）由缩放比例控制。
 *   - 初始化时按 contain 策略（长边适配内容区域）计算 initialScale。
 *   - Cmd+Wheel (macOS) / Ctrl+Wheel (Windows) 驱动缩放，屏蔽浏览器默认行为。
 *   - 缩放范围约束 [MIN_SCALE, MAX_SCALE]，确保不会模糊。
 *
 * 不修改 DPR，不影响 canvas 物理像素。
 */

import { useCallback, useEffect, useRef, useState } from 'react'

const MIN_SCALE = 0.1
const MAX_SCALE = 5
const ZOOM_STEP = 0.002

export interface UseCanvasZoomOptions {
    canvasWidth: number
    canvasHeight: number
    containerWidth: number
    containerHeight: number
    minScale?: number
    maxScale?: number
}

export interface UseCanvasZoomResult {
    scale: number
    styleWidth: number
    styleHeight: number
    zoomContainerRef: (node: HTMLElement | null) => void
}

const CONTAIN_PADDING = 12

function calcContainScale(
    canvasWidth: number,
    canvasHeight: number,
    containerWidth: number,
    containerHeight: number,
): number {
    if (canvasWidth <= 0 || canvasHeight <= 0) return 1
    if (containerWidth <= 0 || containerHeight <= 0) return 1
    const availableWidth = containerWidth - CONTAIN_PADDING * 2
    const availableHeight = containerHeight - CONTAIN_PADDING * 2
    if (availableWidth <= 0 || availableHeight <= 0) return 1
    return Math.min(availableWidth / canvasWidth, availableHeight / canvasHeight)
}

function clampScale(scale: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, scale))
}

export function useCanvasZoom(options: UseCanvasZoomOptions): UseCanvasZoomResult {
    const {
        canvasWidth,
        canvasHeight,
        containerWidth,
        containerHeight,
        minScale = MIN_SCALE,
        maxScale = MAX_SCALE,
    } = options

    const initialScale = calcContainScale(canvasWidth, canvasHeight, containerWidth, containerHeight)

    const [scale, setScale] = useState<number>(() =>
        clampScale(initialScale, minScale, maxScale),
    )

    const containerNodeRef = useRef<HTMLElement | null>(null)

    useEffect(() => {
        const newInitial = calcContainScale(canvasWidth, canvasHeight, containerWidth, containerHeight)
        const clamped = clampScale(newInitial, minScale, maxScale)
        setScale(clamped)
    }, [canvasWidth, canvasHeight, containerWidth, containerHeight, minScale, maxScale])

    const handleWheel = useCallback(
        (e: WheelEvent) => {
            if (!e.metaKey && !e.ctrlKey) return
            e.preventDefault()
            e.stopPropagation()
            const delta = -e.deltaY * ZOOM_STEP
            setScale((prev) => clampScale(prev * (1 + delta), minScale, maxScale))
        },
        [minScale, maxScale],
    )

    useEffect(() => {
        const node = containerNodeRef.current
        if (!node) return
        node.addEventListener('wheel', handleWheel, { passive: false })
        return () => {
            node.removeEventListener('wheel', handleWheel)
        }
    }, [handleWheel])

    const zoomContainerRef = useCallback((node: HTMLElement | null) => {
        containerNodeRef.current = node
    }, [])

    const styleWidth = canvasWidth * scale
    const styleHeight = canvasHeight * scale

    return { scale, styleWidth, styleHeight, zoomContainerRef }
}
