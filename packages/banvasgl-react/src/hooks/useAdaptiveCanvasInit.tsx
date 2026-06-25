/**
 * useAdaptiveCanvasInit — 自适应模式 Canvas 初始化 hook
 *
 * 职责（在 useCanvasCore 共享底座之上）：
 *   1. 空应用时用 800×600 占位 camera（首次 resize 时接管）
 *   2. uiJSON 恢复后不操作 camera（首次 resize 时接管）
 *   3. 容器 resize/DPR 时同步 canvas 物理像素 + camera bounds
 *   4. 启用相机驱动的无限画布交互（zoom via Ctrl+Wheel / pan via Wheel）
 *   5. Canvas CSS 样式：100% 铺满容器
 *   6. 容器 CSS 样式：overflow hidden
 *   7. selectedViewPos 计算（逻辑尺寸 = 容器 CSS 尺寸）
 *
 * 适用场景：流程设计态（useFlowBanvas）
 */

import React, { useEffect, useMemo } from 'react'
import { OrthographicCamera } from '@banyuan/banvasgl'
import { Scene } from '@banyuan/banvasgl'
import type { IAppOptions } from '@banyuan/banvasgl'
import type { WebSurfaceOptions } from '../platform/WebSurface.js'
import type { IBanvasActions } from '@banyuan/banvasgl'
import { useCanvasCore } from './useCanvasCore.js'
import { useBOMProperties } from './useBOMProperties.js'
import type { UseCanvasCoreOptions } from './useCanvasCore.js'
import { useCanvasCamera } from './useCanvasCamera.js'
import type { SelectedViewPos } from './useFixedCanvasInit.js'

// ── 公共类型 ──

export interface UseAdaptiveCanvasOptions {
  appOptions?: Partial<IAppOptions>
  rendererOptions?: WebSurfaceOptions
  /** 是否启用文本输入（默认 false，流程设计态不需要） */
  textInput?: boolean
  /**
   * 目标设备像素比（devicePixelRatio）。
   *
   * 编辑模式下由外部传入，用于模拟目标设备的渲染密度。
   * 不传（undefined）时回退到本机 window.devicePixelRatio。
   */
  dpr?: number
}

export interface UseAdaptiveCanvasResult {
  /** 安全受限的操作接口，app 未就绪时为 null */
  actions: IBanvasActions | null
  /** 渲染元素 */
  elements: {
    /** 画布容器（含 canvas + textInput），直接放到 JSX 中 */
    container: React.ReactElement
  }
  /** version 驱动的派生值与 DOM 引用 */
  derived: {
    /** 画布状态修订号，每次 Scene 变更递增，可用作 useMemo 依赖 */
    revision: number
    /** 当前选中视图 ID（空字符串表示未选中） */
    selectedViewId: string
    /** 当前活跃页面 ID（null 表示无页面） */
    currentPageId: string | null
    /** 当前选中视图在 viewport 中的 CSS 坐标和尺寸（null 表示无选中） */
    selectedViewPos: SelectedViewPos | null
    /** canvas DOM 节点（供交互 hook 绑定事件） */
    canvas: HTMLCanvasElement | null
    /** 文本输入 input DOM 节点（未启用时为 null） */
    inputElement: HTMLInputElement | null
  }
}

/**
 * useAdaptiveCanvasInit — 自适应模式 Canvas 初始化 hook
 *
 * 画布尺寸和相机边界跟随容器实际尺寸动态变化。
 * 支持无限画布交互（滚轮缩放/平移）。
 */
export function useAdaptiveCanvasInit(options: UseAdaptiveCanvasOptions = {}): UseAdaptiveCanvasResult {
  const { appOptions, rendererOptions, textInput } = options

  // ── 共享底座（options 由调用方保证引用稳定） ──
  const coreOptions: UseCanvasCoreOptions = useMemo(
    () => ({ appOptions, rendererOptions, textInput }),
    [appOptions, rendererOptions, textInput],
  )
  const {
    actions,
    app,
    canvasNode,
    containerSize,
    version,
    selectedViewId,
    currentPageId,
    mergedContainerRef,
    canvasCallbackRef,
    inputElement,
    textInputOverlay,
  } = useCanvasCore(coreOptions)

  const { dpr: bomDpr } = useBOMProperties()
  // 外部 DPR 覆盖本机 DPR（编辑模式下的目标设备模拟），
  // 不传时回退到本机 window.devicePixelRatio
  const dpr = options.dpr ?? bomDpr

  // ── 相机驱动的无限画布交互 ──
  const { syncCameraToContainer } = useCanvasCamera({
    app,
    canvas: canvasNode,
    enabled: true,
  })

  // ── Effect 2: 空应用初始化 ──
  // 自适应模式：初始 camera 800×600 占位，首次 resize 时 syncCameraToContainer 接管
  // 数据加载由应用层通过 actions.app.loadAppJSON() 命令式注入
  useEffect(() => {
    if (!app || !actions) return

    const camera = new OrthographicCamera({
      left: 0,
      right: 800,
      top: 0,
      bottom: 600,
    })
    const scene = new Scene(camera)
    app.addScene(scene)
    app.navigateTo(scene)
    actions.app.notify()
  }, [app, actions])

  // ── Effect 3: 容器 resize / DPR 变化时同步 ──
  // 自适应模式：更新 canvas 尺寸 + camera bounds
  useEffect(() => {
    if (!app || containerSize.width <= 0 || containerSize.height <= 0) return
    if (!app.renderer) return
    app.renderer.setDPR(dpr)
    syncCameraToContainer(containerSize.width, containerSize.height)
  }, [app, containerSize, dpr, syncCameraToContainer])

  // ── 派生：selectedViewPos ──
  const selectedViewPos = useMemo((): SelectedViewPos | null => {
    if (!actions || !selectedViewId || !canvasNode || !app) return null
    const view = actions.view.getViewInstance(selectedViewId)
    if (!view) return null

    const tx = view.matrix.get(0, 3)
    const ty = view.matrix.get(1, 3)
    const w = (view.style?.width as number | undefined) ?? 0
    const h = (view.style?.height as number | undefined) ?? 0

    // 世界坐标 → viewport CSS 坐标
    // 自适应模式：逻辑画布尺寸用容器 CSS 尺寸
    const rect = canvasNode.getBoundingClientRect()
    const logicalW = rect.width
    const logicalH = rect.height
    const scaleX = rect.width / logicalW
    const scaleY = rect.height / logicalH

    return {
      x: rect.left + tx * scaleX,
      y: rect.top + ty * scaleY,
      width: w * scaleX,
      height: h * scaleY,
    }
  }, [actions, app, selectedViewId, canvasNode, version])

  // ── Canvas 样式：铺满容器 ──
  const canvasStyle: React.CSSProperties = useMemo(
    () => ({ display: 'block', width: '100%', height: '100%' }),
    [],
  )

  // ── 容器样式：overflow hidden ──
  const containerStyle: React.CSSProperties = useMemo(
    () => ({
      position: 'relative',
      overflow: 'hidden',
      width: '100%',
      height: '100%',
      flex: 1,
      minHeight: 0,
    }),
    [],
  )

  // ── 容器 JSX ──
  const container = useMemo(
    () => (
      <div ref={mergedContainerRef} style={containerStyle}>
        <canvas ref={canvasCallbackRef} style={canvasStyle} />
        {textInputOverlay}
      </div>
    ),
    [mergedContainerRef, canvasCallbackRef, canvasStyle, containerStyle, textInputOverlay],
  )

  return {
    actions,
    elements: { container },
    derived: {
      revision: version,
      selectedViewId,
      currentPageId,
      selectedViewPos,
      canvas: canvasNode,
      inputElement,
    },
  }
}
