/**
 * 模板模块 —— serializeTemplate（View → 模板）& instantiateTemplate（模板 → View）
 *
 * 本模块是建立在 serialization/rawjson 之上的"模板层"：负责占位符化、ID 重生成、
 * 坐标归零等模板语义，实例化时复用 Serializer 还原 View 实例。
 *
 * 对外直接导出序列化/实例化函数，由 actions/templateActions 调用。
 *
 * 设计决策参见 ADR-027 Step 4。
 */

export { serializeTemplate, instantiateTemplate } from './Serializer.js'
