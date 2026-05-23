/**
 * 可序列化接口（约束实例）
 *
 * 实现此接口的类支持 JSON 序列化/反序列化。
 * 实例方法 toJSON() 将对象转为纯数据对象；
 * 配套的静态工厂方法 fromJSON(data) 从纯数据对象重建实例（由各类自行实现）。
 *
 * 注意：TypeScript interface 只能描述实例形状，无法约束静态方法，
 * 因此 fromJSON 的约束由 ISerializableClass 单独承担。
 *
 * Serializer 的类型注册表会自动检测实现了 ISerializable 的类，
 * 优先调用 toJSON / fromJSON 而非通用的 Object.entries 遍历。
 */
export interface ISerializable {
  /**
   * 将当前实例转为可 JSON.stringify 的纯数据对象。
   * 返回值中不应包含类实例、函数、DOM 引用等不可序列化内容。
   * 对于内嵌的 ISerializable 子对象，应递归调用其 toJSON()。
   */
  toJSON(): any
}

/**
 * 可序列化类的构造函数对象接口（约束构造函数对象，而非实例）。
 *
 * TypeScript interface 只能描述实例形状，静态方法必须通过单独的接口来约束。
 * ISerializableClass 专门用于 Serializer 类型注册表，确保注册的每个类都具备：
 *   - `new(...args)` 构造能力
 *   - `fromJSON(data)` 静态工厂方法
 *
 * 与 ISerializable（描述实例）配合使用，共同构成完整的序列化契约。
 */
export interface ISerializableClass<T = any> {
  new (...args: any[]): T
  fromJSON(data: any): T
}
