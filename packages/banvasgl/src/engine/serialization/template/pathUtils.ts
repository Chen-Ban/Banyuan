/**
 * 物料模板的 dot-notation 路径工具
 *
 * 用于在裸子树 JSON 上按路径读写值（FlowSchema 内部 ID 引用、参数绑定等场景）。
 */

/**
 * 解析路径字符串为数组
 * 支持 'a.b[0].c' → ['a', 'b', '0', 'c']
 */
export function parsePath(path: string): string[] {
  return path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)
}

/** 通过 dot-notation 路径获取值 */
export function getValueByPath(obj: any, path: string): any {
  const parts = parsePath(path)
  let current = obj
  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    current = current[part]
  }
  return current
}

/** 通过 dot-notation 路径设置值 */
export function setValueByPath(obj: any, path: string, value: any): void {
  const parts = parsePath(path)
  let current = obj
  for (let i = 0; i < parts.length - 1; i++) {
    if (current === null || current === undefined) return
    current = current[parts[i]]
  }
  if (current !== null && current !== undefined) {
    current[parts[parts.length - 1]] = value
  }
}
