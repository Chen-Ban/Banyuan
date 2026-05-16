/**
 * 字段注册表（Field Registry）
 *
 * 定义所有可在打印模板中使用的动态字段契约。
 * 由开发者维护，随代码提交 git，变更有历史可追溯。
 *
 * 归属：POS 后端（pos/backend/src/config/fields.ts）
 *
 * ─── dataPath 解析上下文 ───────────────────────────────────────────
 * 打印时后端构建如下上下文对象，dataPath 从中按路径取值：
 *
 *   {
 *     order: IOrder,   // 通过 orderId 直接查出
 *     user:  IUser,    // 通过 order.userId 关联查出
 *   }
 *
 * 例：dataPath = "user.optometry.left.sph"
 *   → context.user.optometry.left.sph
 *
 * ─── 扩展方式 ──────────────────────────────────────────────────────
 * 新增字段：在对应分组末尾追加一条记录，key 全局唯一。
 * 新增分组：在文件末尾追加新的 FieldGroup，并加入 FIELD_REGISTRY。
 */

// ─────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────

/** 字段渲染类型 */
export type FieldType = 'text' | 'barcode' | 'qrcode'

/** 单个字段契约 */
export interface FieldDefinition {
  /** 字段唯一标识，模板中存储此 key */
  key: string
  /** 人话标签，展示给模板设计者 */
  label: string
  /** 字段说明，鼠标悬停时展示 */
  description: string
  /** 数据路径，从打印上下文（{ order, user }）中取值 */
  dataPath: string
  /** 渲染类型 */
  type: FieldType
  /** 示例值，用于 Studio 预览占位 */
  example: string
}

/** 字段分组，用于 Studio 字段选择器的分类展示 */
export interface FieldGroup {
  /** 分组标识 */
  groupKey: string
  /** 分组显示名称 */
  groupLabel: string
  /** 该分组下的字段列表 */
  fields: FieldDefinition[]
}

// ─────────────────────────────────────────────
// 字段注册表
// ─────────────────────────────────────────────

const FIELD_REGISTRY: FieldGroup[] = [
  // ── 顾客信息 ──────────────────────────────
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

  // ── 验光参数 ──────────────────────────────
  {
    groupKey: 'optometry',
    groupLabel: '验光参数',
    fields: [
      // 左眼
      {
        key: 'left_sph',
        label: '左眼球镜（SPH）',
        description: '左眼球镜度数，正值为远视，负值为近视',
        dataPath: 'user.optometry.left.sph',
        type: 'text',
        example: '-3.25',
      },
      {
        key: 'left_cyl',
        label: '左眼柱镜（CYL）',
        description: '左眼柱镜度数，用于矫正散光',
        dataPath: 'user.optometry.left.cyl',
        type: 'text',
        example: '-0.75',
      },
      {
        key: 'left_axis',
        label: '左眼轴位（AXIS）',
        description: '左眼散光轴位，范围 0~180°',
        dataPath: 'user.optometry.left.axis',
        type: 'text',
        example: '180',
      },
      {
        key: 'left_ph',
        label: '左眼瞳高（PH）',
        description: '左眼瞳孔高度，单位 mm',
        dataPath: 'user.optometry.left.ph',
        type: 'text',
        example: '22',
      },
      {
        key: 'left_add',
        label: '左眼下加光（ADD）',
        description: '左眼近用附加度数，渐进镜专用',
        dataPath: 'user.optometry.left.add',
        type: 'text',
        example: '+1.50',
      },
      // 右眼
      {
        key: 'right_sph',
        label: '右眼球镜（SPH）',
        description: '右眼球镜度数，正值为远视，负值为近视',
        dataPath: 'user.optometry.right.sph',
        type: 'text',
        example: '-2.75',
      },
      {
        key: 'right_cyl',
        label: '右眼柱镜（CYL）',
        description: '右眼柱镜度数，用于矫正散光',
        dataPath: 'user.optometry.right.cyl',
        type: 'text',
        example: '-0.50',
      },
      {
        key: 'right_axis',
        label: '右眼轴位（AXIS）',
        description: '右眼散光轴位，范围 0~180°',
        dataPath: 'user.optometry.right.axis',
        type: 'text',
        example: '175',
      },
      {
        key: 'right_ph',
        label: '右眼瞳高（PH）',
        description: '右眼瞳孔高度，单位 mm',
        dataPath: 'user.optometry.right.ph',
        type: 'text',
        example: '22',
      },
      {
        key: 'right_add',
        label: '右眼下加光（ADD）',
        description: '右眼近用附加度数，渐进镜专用',
        dataPath: 'user.optometry.right.add',
        type: 'text',
        example: '+1.50',
      },
      // 瞳距
      {
        key: 'pd_left',
        label: '左眼瞳距（PD）',
        description: '左眼单眼瞳距，单位 mm',
        dataPath: 'user.optometry.pd.left',
        type: 'text',
        example: '32',
      },
      {
        key: 'pd_right',
        label: '右眼瞳距（PD）',
        description: '右眼单眼瞳距，单位 mm',
        dataPath: 'user.optometry.pd.right',
        type: 'text',
        example: '32',
      },
    ],
  },

  // ── 订单信息 ──────────────────────────────
  {
    groupKey: 'order',
    groupLabel: '订单信息',
    fields: [
      {
        key: 'order_id',
        label: '订单号',
        description: '订单唯一编号',
        dataPath: 'order.orderId',
        type: 'text',
        example: 'ORD-20260516-001',
      },
      {
        key: 'order_id_barcode',
        label: '订单号（条码）',
        description: '订单号的 CODE128 条形码',
        dataPath: 'order.orderId',
        type: 'barcode',
        example: 'ORD-20260516-001',
      },
      {
        key: 'order_id_qrcode',
        label: '订单号（二维码）',
        description: '订单号的 QR 二维码',
        dataPath: 'order.orderId',
        type: 'qrcode',
        example: 'ORD-20260516-001',
      },
      {
        key: 'order_status',
        label: '订单状态',
        description: '当前订单状态：待处理 / 处理中 / 已完成 / 已取消',
        dataPath: 'order.status',
        type: 'text',
        example: '已完成',
      },
      {
        key: 'order_total',
        label: '订单金额',
        description: '订单总金额，单位元',
        dataPath: 'order.totalAmount',
        type: 'text',
        example: '1280.00',
      },
      {
        key: 'order_remark',
        label: '订单备注',
        description: '下单时填写的备注信息',
        dataPath: 'order.remark',
        type: 'text',
        example: '加急',
      },
      {
        key: 'order_date',
        label: '下单日期',
        description: '订单创建日期',
        dataPath: 'order.createdAt',
        type: 'text',
        example: '2026-05-16',
      },
    ],
  },

  // ── 商品信息 ──────────────────────────────
  {
    groupKey: 'product',
    groupLabel: '商品信息',
    fields: [
      {
        key: 'product_name',
        label: '商品名称',
        description: '订单第一件商品的名称',
        dataPath: 'order.items.0.product.name',
        type: 'text',
        example: '蔡司铂金系列 1.74',
      },
      {
        key: 'product_sku',
        label: '商品编码',
        description: '订单第一件商品的 SKU 编码',
        dataPath: 'order.items.0.product.sku',
        type: 'text',
        example: 'ZEISS-PT-174',
      },
      {
        key: 'product_spec',
        label: '商品规格',
        description: '订单第一件商品的规格/型号',
        dataPath: 'order.items.0.product.spec',
        type: 'text',
        example: '1.74 超薄非球面',
      },
      {
        key: 'product_price',
        label: '商品单价',
        description: '订单第一件商品的实际成交单价，单位元',
        dataPath: 'order.items.0.price',
        type: 'text',
        example: '1280.00',
      },
    ],
  },
]

// ─────────────────────────────────────────────
// 导出工具函数
// ─────────────────────────────────────────────

/** 获取完整字段注册表（分组结构，供 Studio 字段选择器使用） */
export function getFieldRegistry(): FieldGroup[] {
  return FIELD_REGISTRY
}

/** 获取扁平化字段列表（供打印时按 key 查找定义） */
export function getFlatFields(): FieldDefinition[] {
  return FIELD_REGISTRY.flatMap((group) => group.fields)
}

/** 按 key 查找字段定义 */
export function getFieldByKey(key: string): FieldDefinition | undefined {
  return getFlatFields().find((f) => f.key === key)
}
