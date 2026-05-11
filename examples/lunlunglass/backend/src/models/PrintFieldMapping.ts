import mongoose, { Schema, Document } from 'mongoose'

/**
 * 打印字段映射配置
 *
 * TODO [CRM]: 当前映射配置依赖开发人员通过 API 手动维护。
 * 后续需要开放一个 CRM 运营管理界面，让运营者可以：
 * 1. 图形化选择打印模板中的动态字段（fieldKey）
 * 2. 通过下拉选择关联的数据库表和字段（collection + fieldPath）
 * 3. 可视化配置拼接模板（template），支持实时预览效果
 * 4. 打通前端模板设计 → 字段绑定 → 数据映射的全链路图形化操作
 * 这样运营者无需开发介入即可完成打印模板的完整配置。
 */

/**
 * 数据源字段引用
 * 描述一个具体的数据来源：哪个表的哪个字段
 */
export interface IDataSourceField {
  /** 数据表/集合名（如 "orders", "products", "users"） */
  collection: string
  /** 字段路径（支持嵌套，如 "items.0.name", "address.city"） */
  fieldPath: string
  /** 显示名（方便业务方配置时阅读） */
  label: string
}

/**
 * 字段映射规则
 * 一个 fieldKey 可以对应多个数据源字段，通过 template 拼接
 */
export interface IFieldMappingRule {
  /** 模板中的字段契约名（对应 printConfig.fields[].key） */
  fieldKey: string
  /** 数据源字段列表（按顺序用于模板拼接） */
  sources: IDataSourceField[]
  /**
   * 拼接模板（使用 ${index} 引用 sources 中的值）
   * 例：sources = [订单号, 客户名] → template = "#${0} - ${1}"
   * 如果不设置，默认用空字符串连接所有 sources 的值
   */
  template?: string
}

/**
 * 打印字段映射配置文档
 * 每个模板对应一份映射配置，描述 fieldKey → 实际数据源的关系
 */
export interface IPrintFieldMapping extends Document {
  /** 关联的模板 ID */
  templateId: string
  /** 映射配置名称 */
  name: string
  /** 字段映射规则列表 */
  rules: IFieldMappingRule[]
  /** 创建时间 */
  createdAt: Date
  /** 更新时间 */
  updatedAt: Date
}

const DataSourceFieldSchema = new Schema<IDataSourceField>(
  {
    collection: { type: String, required: true, trim: true },
    fieldPath: { type: String, required: true, trim: true },
    label: { type: String, default: '', trim: true },
  },
  { _id: false }
)

const FieldMappingRuleSchema = new Schema<IFieldMappingRule>(
  {
    fieldKey: { type: String, required: true, trim: true },
    sources: { type: [DataSourceFieldSchema], required: true, default: [] },
    template: { type: String, default: undefined },
  },
  { _id: false }
)

const PrintFieldMappingSchema = new Schema<IPrintFieldMapping>(
  {
    templateId: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    rules: { type: [FieldMappingRuleSchema], required: true, default: [] },
  },
  { timestamps: true }
)

PrintFieldMappingSchema.index({ templateId: 1 })

const PrintFieldMapping = mongoose.model<IPrintFieldMapping>(
  'PrintFieldMapping',
  PrintFieldMappingSchema
)

export default PrintFieldMapping
