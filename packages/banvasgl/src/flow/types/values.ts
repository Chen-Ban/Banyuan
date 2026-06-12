/**
 * FlowSlot —— 插槽值类型
 *
 * 每个输入参数都是一个插槽。取值规则（互斥）：
 *   - 有 DataEdge（toSlot 指向该 slot）连入 → Pull 该数据边
 *   - 否则 → 取内联值
 */

/** 插槽内联值类型。可以是任意 JSON 值，或被 DataEdge 覆盖。 */
export type FlowSlot = unknown
