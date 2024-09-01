export * from './boxUtils'
export * from './pointUtil'
export * from './polygonUtils'
export * from './vectorUtils'

import { NodeType, Point, Template } from 'store/types/Template.type'

//防抖函数
export function debounce<T>(fn: (p: T) => void, delay = 200): (p: T) => void {
  let timerId: number | undefined | NodeJS.Timeout = void 0
  return (...args) => {
    if (timerId) {
      clearTimeout(timerId)
    }
    timerId = globalThis.setTimeout(() => {
      fn(...args)
    }, delay)
  }
}

//节流函数
export function throttle<T extends (...args: any[]) => any | void>(
  fn: T,
  limit: number = 200,
): (...args: Parameters<T>) => ReturnType<T> | void {
  let last = Date.now()
  return function (...args) {
    const now = Date.now()
    const duration = now - last
    let res = undefined
    if (duration > limit) {
      res = fn(...args)
      last = Date.now()
    }
    return res
  }
}

//鼠标事件的视口坐标转换成canvas内的坐标
export const client2canvas = (e: MouseEvent | DragEvent): Point => {
  const canvasRec = (e.target as HTMLCanvasElement).getBoundingClientRect()
  return {
    x: e.clientX - canvasRec.left,
    y: e.clientY - canvasRec.top,
    w: 1,
  }
}

export const parseColor = (color: number | number[]) => {
  if (typeof color == 'number') {
    return `#${color.toString(16).padStart(6, '0')}` //不支持略写形式，需要写完整，蓝色通道优先
  } else if (color.length == 3) {
    return `rgb(${color.join(',')})`
  } else if (color.length == 4) {
    return `rgba(${color.join(',')})`
  }
  return '#000000'
}

export const shouuldAnimation = (template: Template) => {
  return template.nodeList.filter((node) => node.type === NodeType.TEXT).filter((node) => node.isActive).length === 1
}
