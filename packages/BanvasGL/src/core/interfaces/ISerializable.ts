/**
 * 可序列化接口
 *
 * 实现此接口的类支持 JSON 序列化/反序列化。
 * 实例方法 toJSON() 将对象转为纯数据对象；
 * 配套的静态方法 fromJSON(data) 从纯数据对象重建实例（由各类自行实现，接口层无法约束静态方法）。
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
 * 实现了 fromJSON 静态工厂方法的类的构造函数签名。
 * 用于 Serializer 类型注册表的类型约束。
 */
export interface SerializableStatic<T = any> {
  new (...args: any[]): T
  fromJSON(data: any): T
}
