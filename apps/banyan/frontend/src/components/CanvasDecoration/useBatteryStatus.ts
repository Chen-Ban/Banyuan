/**
 * useBatteryStatus — 电池状态 hook
 *
 * 使用 Battery Status API 获取真实电量百分比和充电状态。
 * API 不可用时降级为模拟满电状态。
 */

import { useEffect, useState } from 'react'

export interface BatteryInfo {
  /** 电量百分比 0-100 */
  level: number
  /** 是否正在充电 */
  charging: boolean
  /** 电池图标颜色 */
  color: string
}

function getColor(level: number, charging: boolean): string {
  if (charging) return '#4cd964'
  if (level <= 10) return '#ff3b30'
  if (level <= 20) return '#ff9500'
  return '#fff'
}

const FALLBACK: BatteryInfo = { level: 75, charging: false, color: '#fff' }

export function useBatteryStatus(): BatteryInfo {
  const [info, setInfo] = useState<BatteryInfo>(FALLBACK)

  useEffect(() => {
    // Battery Status API 仅在 secure context 且浏览器支持时可用
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<{
        level: number
        charging: boolean
        addEventListener: (type: string, fn: () => void) => void
        removeEventListener: (type: string, fn: () => void) => void
      }>
    }

    if (!nav.getBattery) return

    let cancelled = false

    const update = (battery: { level: number; charging: boolean }) => {
      if (cancelled) return
      const level = Math.round(battery.level * 100)
      setInfo({ level, charging: battery.charging, color: getColor(level, battery.charging) })
    }

    nav.getBattery().then((battery) => {
      if (cancelled) return
      update(battery)

      const onCharging = () => update(battery)
      const onLevel = () => update(battery)
      battery.addEventListener('chargingchange', onCharging)
      battery.addEventListener('levelchange', onLevel)

      return () => {
        cancelled = true
        battery.removeEventListener('chargingchange', onCharging)
        battery.removeEventListener('levelchange', onLevel)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  return info
}
