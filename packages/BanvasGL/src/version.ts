/**
 * 当前 banvasgl 版本号
 * 构建时由 tsup define 注入，值来自 package.json 的 version 字段
 */
declare const __BANVASGL_VERSION__: string
export const version: string = __BANVASGL_VERSION__
