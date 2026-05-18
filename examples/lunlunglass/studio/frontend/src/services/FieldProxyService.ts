/**
 * FieldProxyService（Studio 前端专用）
 *
 * 为 Studio 前端提供字段注册表的获取能力。
 * Studio 后端已实现代理接口（GET /api/fields → 转发到 POS 后端），
 * 本服务封装前端侧的调用逻辑，供字段绑定 UI 使用。
 *
 * 在开发阶段提供 mock 数据兜底，确保 POS 后端不可用时 Studio 仍可开发调试。
 *
 * @see studio/backend/src/controllers/FieldsController.ts — 后端代理实现
 * @see pos/backend/src/config/fields.ts — 字段注册表源数据
 */

import { fetchFields, type FieldGroup, type FieldDefinition } from '../api/fields'

// ─────────────────────────────────────────────
// 接口定义
// ─────────────────────────────────────────────

/** 字段代理服务接口 */
export interface IFieldProxyService {
  /** 获取字段注册表（分组结构），供字段选择器分组展示 */
  getFieldRegistry(): Promise<FieldGroup[]>
  /** 获取扁平化字段列表 */
  getFlatFields(): Promise<FieldDefinition[]>
  /** 按 key 查找字段定义 */
  getFieldByKey(key: string): Promise<FieldDefinition | undefined>
}

// ─────────────────────────────────────────────
// Mock 数据（POS 后端不可用时的兜底）
// ─────────────────────────────────────────────

const MOCK_FIELD_REGISTRY: FieldGroup[] = [
  {
    groupKey: 'customer',
    groupLabel: '顾客信息',
    fields: [
      {
        key: 'customer_name',
        label: '顾客姓名',
        description: '顾客的用户名',
        dataPath: 'user.username',
        type: 'text',
        example: '张三',
      },
      {
        key: 'customer_phone',
        label: '联系电话',
        description: '顾客手机号',
        dataPath: 'user.phone',
        type: 'text',
        example: '13800138000',
      },
      {
        key: 'customer_email',
        label: '电子邮箱',
        description: '顾客邮箱地址',
        dataPath: 'user.email',
        type: 'text',
        example: 'example@mail.com',
      },
    ],
  },
  {
    groupKey: 'optometry',
    groupLabel: '验光参数',
    fields: [
      { key: 'left_sph', label: '左眼球镜（SPH）', description: '左眼球镜度数', dataPath: 'user.optometry.left.sph', type: 'text', example: '-3.25' },
      { key: 'left_cyl', label: '左眼柱镜（CYL）', description: '左眼柱镜度数', dataPath: 'user.optometry.left.cyl', type: 'text', example: '-0.75' },
      { key: 'left_axis', label: '左眼轴位（AXIS）', description: '左眼散光轴位', dataPath: 'user.optometry.left.axis', type: 'text', example: '180' },
      { key: 'left_ph', label: '左眼瞳高（PH）', description: '左眼瞳孔高度', dataPath: 'user.optometry.left.ph', type: 'text', example: '22' },
      { key: 'left_add', label: '左眼下加光（ADD）', description: '左眼近用附加度数', dataPath: 'user.optometry.left.add', type: 'text', example: '+1.50' },
      { key: 'right_sph', label: '右眼球镜（SPH）', description: '右眼球镜度数', dataPath: 'user.optometry.right.sph', type: 'text', example: '-2.75' },
      { key: 'right_cyl', label: '右眼柱镜（CYL）', description: '右眼柱镜度数', dataPath: 'user.optometry.right.cyl', type: 'text', example: '-0.50' },
      { key: 'right_axis', label: '右眼轴位（AXIS）', description: '右眼散光轴位', dataPath: 'user.optometry.right.axis', type: 'text', example: '175' },
      { key: 'right_ph', label: '右眼瞳高（PH）', description: '右眼瞳孔高度', dataPath: 'user.optometry.right.ph', type: 'text', example: '22' },
      { key: 'right_add', label: '右眼下加光（ADD）', description: '右眼近用附加度数', dataPath: 'user.optometry.right.add', type: 'text', example: '+1.50' },
      { key: 'pd_left', label: '左眼瞳距（PD）', description: '左眼单眼瞳距', dataPath: 'user.optometry.pd.left', type: 'text', example: '32' },
      { key: 'pd_right', label: '右眼瞳距（PD）', description: '右眼单眼瞳距', dataPath: 'user.optometry.pd.right', type: 'text', example: '32' },
    ],
  },
  {
    groupKey: 'order',
    groupLabel: '订单信息',
    fields: [
      { key: 'order_id', label: '订单号', description: '订单唯一编号', dataPath: 'order.orderId', type: 'text', example: 'ORD-20260516-001' },
      { key: 'order_id_barcode', label: '订单号（条码）', description: '订单号的条形码', dataPath: 'order.orderId', type: 'barcode', example: 'ORD-20260516-001' },
      { key: 'order_id_qrcode', label: '订单号（二维码）', description: '订单号的二维码', dataPath: 'order.orderId', type: 'qrcode', example: 'ORD-20260516-001' },
      { key: 'order_status', label: '订单状态', description: '当前订单状态', dataPath: 'order.status', type: 'text', example: '已完成' },
      { key: 'order_total', label: '订单金额', description: '订单总金额', dataPath: 'order.totalAmount', type: 'text', example: '1280.00' },
      { key: 'order_remark', label: '订单备注', description: '订单备注信息', dataPath: 'order.remark', type: 'text', example: '加急' },
      { key: 'order_date', label: '下单日期', description: '订单创建日期', dataPath: 'order.createdAt', type: 'text', example: '2026-05-16' },
    ],
  },
  {
    groupKey: 'product',
    groupLabel: '商品信息',
    fields: [
      { key: 'product_name', label: '商品名称', description: '订单第一件商品名称', dataPath: 'order.items.0.product.name', type: 'text', example: '蔡司铂金系列 1.74' },
      { key: 'product_sku', label: '商品编码', description: '订单第一件商品 SKU', dataPath: 'order.items.0.product.sku', type: 'text', example: 'ZEISS-PT-174' },
      { key: 'product_spec', label: '商品规格', description: '订单第一件商品规格', dataPath: 'order.items.0.product.spec', type: 'text', example: '1.74 超薄非球面' },
      { key: 'product_price', label: '商品单价', description: '订单第一件商品单价', dataPath: 'order.items.0.price', type: 'text', example: '1280.00' },
    ],
  },
]

// ─────────────────────────────────────────────
// 实现
// ─────────────────────────────────────────────

/** 内存缓存，避免重复请求 */
let cachedRegistry: FieldGroup[] | null = null

/**
 * FieldProxyService 实现
 *
 * 优先通过 Studio 后端代理获取真实字段注册表（来自 POS 后端），
 * 若请求失败则回退到内置 mock 数据，确保 Studio 可离线开发。
 */
class FieldProxyService implements IFieldProxyService {
  async getFieldRegistry(): Promise<FieldGroup[]> {
    if (cachedRegistry) return cachedRegistry

    try {
      const response = await fetchFields()
      if (response.success && response.data) {
        cachedRegistry = response.data
        return cachedRegistry
      }
    } catch {
      console.warn(
        '[FieldProxyService] Failed to fetch fields from backend, using mock data.'
      )
    }

    // 回退到 mock 数据
    cachedRegistry = MOCK_FIELD_REGISTRY
    return cachedRegistry
  }

  async getFlatFields(): Promise<FieldDefinition[]> {
    const registry = await this.getFieldRegistry()
    return registry.flatMap((group) => group.fields)
  }

  async getFieldByKey(key: string): Promise<FieldDefinition | undefined> {
    const flatFields = await this.getFlatFields()
    return flatFields.find((f) => f.key === key)
  }

  /** 清除缓存，下次调用时重新请求 */
  invalidateCache(): void {
    cachedRegistry = null
  }
}

/** 单例实例 */
export const fieldProxyService = new FieldProxyService()

export default fieldProxyService
