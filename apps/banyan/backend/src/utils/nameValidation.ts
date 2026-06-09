/**
 * 名称校验工具
 *
 * 数据表名、字段名、云函数名仅允许英文标识符：
 *   - 以字母开头
 *   - 仅包含字母、数字、下划线
 *
 * 原因：这些名称会作为 MongoDB 集合名/字段名、JS 标识符使用。
 */

/** 名称正则：字母开头 + 字母/数字/下划线 */
const NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_]*$/

export function isValidIdentifier(name: string): boolean {
  return NAME_REGEX.test(name)
}

/**
 * 校验并返回标准化的名称。
 * 校验失败时抛带 status: 400 的错误（被全局错误中间件翻译为 HTTP 400）。
 */
export function validateIdentifier(name: string, label: string): string {
  const trimmed = name.trim()
  if (!trimmed) {
    throw Object.assign(new Error(`${label}不能为空`), { status: 400 })
  }
  if (!NAME_REGEX.test(trimmed)) {
    throw Object.assign(
      new Error(`${label}只允许英文字母、数字、下划线，且必须以字母开头`),
      { status: 400 },
    )
  }
  return trimmed
}
