/**
 * useCurrentTime — 实时时钟 hook
 *
 * 返回当前系统时间的格式化字符串（HH:MM），每 1 秒自动更新。
 * 用于设备框装饰中的状态栏时间显示。
 */

import { useEffect, useState } from 'react'

export function useCurrentTime(): string {
  const [time, setTime] = useState(() => formatTime())

  useEffect(() => {
    const id = setInterval(() => {
      setTime(formatTime())
    }, 1000)
    return () => clearInterval(id)
  }, [])

  return time
}

function formatTime(): string {
  const now = new Date()
  const h = now.getHours().toString().padStart(2, '0')
  const m = now.getMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
}
