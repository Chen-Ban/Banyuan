/**
 * CanvasDecoration — 画布设备框装饰
 *
 * 现代设备外观（2025-2026）— 拟态设计：
 *   1px outline + 三层 box-shadow 模拟 3D 凸起效果
 *   所有设备统一轻量浅灰边框，无厚重 bezel
 *
 *   - iphone:      iOS 状态栏 + Dynamic Island
 *   - android:     Android 状态栏 + 中置打孔摄像头 + 手势条
 *   - ipad:        iOS 状态栏
 *   - mac:         macOS 标题栏 + notch
 *   - windows:     Windows 11 标题栏（按钮右侧，46px 标准宽）
 *   - foldable:    Android 状态栏 + UDC + 折痕
 *   - android-tablet: Android 状态栏
 */

import { useEffect, useRef, useState } from 'react'
import type { DeviceType } from '@/layouts/ApplicationLayout/constants'
import { useCurrentTime } from './useCurrentTime'
import { useBatteryStatus } from './useBatteryStatus'
import styles from './index.module.scss'

export interface CanvasDecorationProps {
  deviceType: DeviceType
  canvasNode: HTMLCanvasElement | null
  canvasSectionEl: HTMLDivElement | null
}

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

interface DecorationConfig {
  topBarHeight: number
  bottomBarHeight: number
  borderRadius: number
  showTopBar: boolean
  topBarStyle: 'ios-status' | 'android-status' | 'mac-title' | 'windows-title'
  showDynamicIsland: boolean
  showPunchHole: boolean
  showNotch: boolean
  showHomeIndicator: boolean
  homeIndicatorStyle: 'ios' | 'android-pill'
  showCrease: boolean
  showUDC: boolean
}

function getDecorationConfig(type: DeviceType): DecorationConfig {
  switch (type) {
    case 'iphone':
      return {
        topBarHeight: 40,
        bottomBarHeight: 20,
        borderRadius: 24,
        showTopBar: true,
        topBarStyle: 'ios-status',
        showDynamicIsland: true,
        showPunchHole: false,
        showNotch: false,
        showHomeIndicator: true,
        homeIndicatorStyle: 'ios',
        showCrease: false,
        showUDC: false,
      }
    case 'android':
      return {
        topBarHeight: 34,
        bottomBarHeight: 18,
        borderRadius: 18,
        showTopBar: true,
        topBarStyle: 'android-status',
        showDynamicIsland: false,
        showPunchHole: true,
        showNotch: false,
        showHomeIndicator: true,
        homeIndicatorStyle: 'android-pill',
        showCrease: false,
        showUDC: false,
      }
    case 'ipad':
      return {
        topBarHeight: 26,
        bottomBarHeight: 0,
        borderRadius: 18,
        showTopBar: true,
        topBarStyle: 'ios-status',
        showDynamicIsland: false,
        showPunchHole: false,
        showNotch: false,
        showHomeIndicator: false,
        homeIndicatorStyle: 'ios',
        showCrease: false,
        showUDC: false,
      }
    case 'android-tablet':
      return {
        topBarHeight: 26,
        bottomBarHeight: 0,
        borderRadius: 14,
        showTopBar: true,
        topBarStyle: 'android-status',
        showDynamicIsland: false,
        showPunchHole: false,
        showNotch: false,
        showHomeIndicator: false,
        homeIndicatorStyle: 'android-pill',
        showCrease: false,
        showUDC: false,
      }
    case 'mac':
      return {
        topBarHeight: 28,
        bottomBarHeight: 0,
        borderRadius: 10,
        showTopBar: true,
        topBarStyle: 'mac-title',
        showDynamicIsland: false,
        showPunchHole: false,
        showNotch: true,
        showHomeIndicator: false,
        homeIndicatorStyle: 'ios',
        showCrease: false,
        showUDC: false,
      }
    case 'windows':
      return {
        topBarHeight: 32,
        bottomBarHeight: 0,
        borderRadius: 4,
        showTopBar: true,
        topBarStyle: 'windows-title',
        showDynamicIsland: false,
        showPunchHole: false,
        showNotch: false,
        showHomeIndicator: false,
        homeIndicatorStyle: 'ios',
        showCrease: false,
        showUDC: false,
      }
    case 'foldable':
      return {
        topBarHeight: 28,
        bottomBarHeight: 0,
        borderRadius: 14,
        showTopBar: true,
        topBarStyle: 'android-status',
        showDynamicIsland: false,
        showPunchHole: false,
        showNotch: false,
        showHomeIndicator: false,
        homeIndicatorStyle: 'android-pill',
        showCrease: true,
        showUDC: true,
      }
  }
}

export function getCanvasMargin(type: DeviceType): number {
  const c = getDecorationConfig(type)
  const top = c.showTopBar ? c.topBarHeight : 0
  const bottom = c.showHomeIndicator ? c.bottomBarHeight : 0
  return Math.max(top, bottom) * 2 + 4
}

const CanvasDecoration: React.FC<CanvasDecorationProps> = ({ deviceType, canvasNode, canvasSectionEl }) => {
  const [canvasRect, setCanvasRect] = useState<Rect | null>(null)
  const [sectionRect, setSectionRect] = useState<Rect | null>(null)
  const roCRef = useRef<ResizeObserver | null>(null)
  const roSRef = useRef<ResizeObserver | null>(null)

  const time = useCurrentTime()
  const battery = useBatteryStatus()
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const h = () => setOnline(navigator.onLine)
    window.addEventListener('online', h)
    window.addEventListener('offline', h)
    return () => {
      window.removeEventListener('online', h)
      window.removeEventListener('offline', h)
    }
  }, [])

  useEffect(() => {
    if (!canvasNode) {
      setCanvasRect(null)
      return
    }
    const m = () => {
      const r = canvasNode.getBoundingClientRect()
      setCanvasRect({ left: r.left, top: r.top, width: r.width, height: r.height })
    }
    m()
    const ro = new ResizeObserver(m)
    ro.observe(canvasNode)
    roCRef.current = ro
    return () => {
      ro.disconnect()
      roCRef.current = null
    }
  }, [canvasNode])

  useEffect(() => {
    if (!canvasSectionEl) {
      setSectionRect(null)
      return
    }
    const m = () => {
      const r = canvasSectionEl.getBoundingClientRect()
      setSectionRect({ left: r.left, top: r.top, width: r.width, height: r.height })
    }
    m()
    const ro = new ResizeObserver(m)
    ro.observe(canvasSectionEl)
    roSRef.current = ro
    return () => {
      ro.disconnect()
      roSRef.current = null
    }
  }, [canvasSectionEl])

  if (!canvasRect || canvasRect.width <= 0 || canvasRect.height <= 0 || !sectionRect) return null

  const config = getDecorationConfig(deviceType)

  const relLeft = canvasRect.left - sectionRect.left
  const relTop = canvasRect.top - sectionRect.top - (config.showTopBar ? config.topBarHeight : 0)
  const outerW = canvasRect.width
  const outerH =
    canvasRect.height +
    (config.showTopBar ? config.topBarHeight : 0) +
    (config.showHomeIndicator ? config.bottomBarHeight : 0)

  const battStyle = {
    background: `linear-gradient(to right, ${battery.color} ${battery.level}%, transparent ${battery.level}%)`,
  }

  return (
    <div
      className={`${styles.decoration} ${styles[deviceType] ?? ''}`}
      style={{
        position: 'absolute',
        left: relLeft,
        top: relTop,
        width: outerW,
        height: outerH,
        borderRadius: config.borderRadius,
        pointerEvents: 'none',
        zIndex: 1,
      }}
    >
      {config.showTopBar && config.topBarStyle === 'ios-status' && (
        <div
          className={`${styles.topBar} ${styles.iosStatusBar}`}
          style={{
            height: config.topBarHeight,
            borderRadius: `${config.borderRadius}px ${config.borderRadius}px 0 0`,
          }}
        >
          <span className={styles.statusTime}>{time}</span>
          <span className={styles.statusIcons}>
            {online && <span className={styles.statusWifi} />}
            <span className={styles.statusSignal} />
            <span className={styles.statusBattery} style={battStyle} />
          </span>
        </div>
      )}
      {config.showTopBar && config.topBarStyle === 'android-status' && (
        <div
          className={`${styles.topBar} ${styles.androidStatusBar}`}
          style={{
            height: config.topBarHeight,
            borderRadius: `${config.borderRadius}px ${config.borderRadius}px 0 0`,
          }}
        >
          <span className={styles.statusTime}>{time}</span>
          <span className={styles.androidIconsRight}>
            <span className={styles.statusSignal} />
            {online && <span className={styles.statusWifi} />}
            <span className={styles.statusBattery} style={battStyle} />
          </span>
        </div>
      )}
      {config.showTopBar && config.topBarStyle === 'mac-title' && (
        <div
          className={styles.macTitleBar}
          style={{
            height: config.topBarHeight,
            borderRadius: `${config.borderRadius}px ${config.borderRadius}px 0 0`,
          }}
        >
          <span className={styles.trafficLights}>
            <span className={styles.trafficDot} />
            <span className={styles.trafficDot} />
            <span className={styles.trafficDot} />
          </span>
        </div>
      )}
      {config.showTopBar && config.topBarStyle === 'windows-title' && (
        <div
          className={styles.winTitleBar}
          style={{
            height: config.topBarHeight,
            borderRadius: `${config.borderRadius}px ${config.borderRadius}px 0 0`,
          }}
        >
          <span className={styles.winSpacer} />
          <span className={styles.winCtrls}>
            <span className={styles.winBtn}>─</span>
            <span className={styles.winBtn}>□</span>
            <span className={styles.winBtn} data-close>
              ✕
            </span>
          </span>
        </div>
      )}
      {config.showDynamicIsland && <div className={styles.dynamicIsland} />}
      {config.showPunchHole && <div className={styles.punchHole} />}
      {config.showNotch && <div className={styles.macNotch} />}
      {config.showUDC && <div className={styles.udcZone} />}
      {config.showCrease && <div className={styles.crease} />}
      <div className={styles.screenArea} style={{ width: canvasRect.width, height: canvasRect.height }} />
      {config.showHomeIndicator && (
        <div
          className={`${styles.homeBar} ${config.homeIndicatorStyle === 'android-pill' ? styles.homeBarAndroid : ''}`}
          style={{
            height: config.bottomBarHeight,
            borderRadius: `0 0 ${config.borderRadius}px ${config.borderRadius}px`,
          }}
        >
          <span
            className={`${styles.homeIndicator} ${config.homeIndicatorStyle === 'android-pill' ? styles.homeIndicatorAndroid : ''}`}
          />
        </div>
      )}
    </div>
  )
}

export default CanvasDecoration
