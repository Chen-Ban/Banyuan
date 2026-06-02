/**
 * 物料系统核心类型定义
 *
 * 物料（Material）是可复用的参数化视图模板。
 * serialize：将 View 子树快照为物料模板（IMaterialTemplate）
 * instantiate：将物料模板还原为 View 实例并注入到场景中
 *
 * 设计决策参见 ADR-027 Step 4。
 */

// ── 物料元数据 ──

/** 物料来源标识 */
export type MaterialSource = 'builtin' | 'user' | 'team' | 'marketplace'

/** 物料分类标签 */
export interface IMaterialMeta {
    /** 物料唯一 ID（UUID） */
    id: string
    /** 物料名称（展示用） */
    name: string
    /** 物料描述 */
    description?: string
    /** 分类标签（用于面板筛选） */
    tags?: string[]
    /** 缩略图 URL */
    thumbnail?: string
    /** 物料来源 */
    source: MaterialSource
    /** 创建者 ID */
    creatorId?: string
    /** 创建时间（ISO 字符串） */
    createdAt?: string
    /** 最后更新时间（ISO 字符串） */
    updatedAt?: string
    /** 物料版本号（语义化版本） */
    version: string
    /** 兼容的 BanvasGL 最低版本 */
    minEngineVersion?: string
}

// ── 物料参数 ──

/** 参数类型（用于 UI 渲染和验证） */
export type MaterialParameterType =
    | 'string'
    | 'number'
    | 'boolean'
    | 'color'
    | 'url'
    | 'enum'
    | 'json'

/** 物料参数定义 */
export interface IMaterialParameter {
    /** 参数 ID（在模板中通过 {{param:paramId}} 引用） */
    id: string
    /** 参数展示名称 */
    label: string
    /** 参数描述 */
    description?: string
    /** 参数类型 */
    type: MaterialParameterType
    /** 默认值 */
    defaultValue: unknown
    /** 参数在模板 JSON 中的绑定路径（如 "root.content.text"） */
    bindingPath: string
    /** enum 类型的可选项 */
    options?: Array<{ label: string; value: unknown }>
    /** 是否必填 */
    required?: boolean
}

// ── 物料资源 ──

/** 物料中引用的外部资源（图片、视频等） */
export interface IMaterialAsset {
    /** 资源 ID（在模板中通过 {{asset:assetId}} 引用） */
    id: string
    /** 资源类型 */
    type: 'image' | 'video' | 'audio' | 'font' | 'other'
    /** 资源 URL（CDN 地址或原始地址） */
    url: string
    /** 原始文件名 */
    originalName?: string
    /** 文件大小（bytes） */
    size?: number
}

// ── 物料模板 ──

/**
 * 物料模板 — serialize 的产物
 *
 * root 是序列化后的视图子树 JSON，其中：
 * - 所有 id 被替换为 {{id:N}} 占位符
 * - 参数绑定位置被替换为 {{param:paramId}} 占位符
 * - 资源引用被替换为 {{asset:assetId}} 占位符
 * - 根节点 transform 坐标已归零
 * - FlowSchema 中的 viewId 引用已同步替换
 */
export interface IMaterialTemplate {
    /** 子树 JSON（含占位符） */
    root: Record<string, unknown>
    /** 模板中使用的 ID 占位符数量（instantiate 时需生成同等数量的新 UUID） */
    idCount: number
    /** FlowSchema 中引用了内部 ID 的路径列表，用于 instantiate 时替换 */
    internalIdRefs: IInternalIdRef[]
    /** 参数定义列表 */
    parameters: IMaterialParameter[]
    /** 资源列表 */
    assets: IMaterialAsset[]
}

/** FlowSchema 中的内部 ID 引用记录 */
export interface IInternalIdRef {
    /**
     * 引用所在的 JSON 路径（从 root 开始，dot-notation）
     * 例如：'events.onClick.nodes[2].config.targetViewId'
     */
    path: string
    /** 引用的占位符（如 '{{id:3}}'） */
    placeholder: string
}

// ── 物料聚合 ──

/** 完整物料定义（元数据 + 模板） */
export interface IMaterial {
    /** 物料元数据 */
    meta: IMaterialMeta
    /** 物料模板 */
    template: IMaterialTemplate
}

// ── Actions 接口 ──

/**
 * 物料操作接口
 *
 * 实现位于 engine/material/，由 actions/viewActions 代理为
 * view.serializeMaterial / view.instantiateMaterial 暴露。
 */
export interface IMaterialActions {
    /**
     * 将视图子树序列化为物料模板
     *
     * @param viewId - 要序列化的根视图 ID
     * @param config - 序列化配置
     * @returns 物料模板，失败返回 null
     */
    serialize(
        viewId: string,
        config: IMaterialSerializeConfig,
    ): IMaterialTemplate | null

    /**
     * 将物料模板实例化为视图并添加到当前场景
     *
     * @param material - 物料定义（含 meta + template）或仅 template
     * @param position - 放置位置
     * @param params - 参数填充值（key 为 paramId）
     * @returns 新创建的根视图 ID，失败返回 null
     */
    instantiate(
        material: IMaterial | IMaterialTemplate,
        position: { x: number; y: number },
        params?: Record<string, unknown>,
    ): string | null
}

/** serialize 配置 */
export interface IMaterialSerializeConfig {
    /** 物料名称 */
    name: string
    /** 物料描述 */
    description?: string
    /** 参数绑定定义（哪些路径暴露为参数） */
    parameterBindings?: IMaterialParameterBinding[]
}

/** 参数绑定声明 */
export interface IMaterialParameterBinding {
    /** 参数 ID */
    id: string
    /** 参数展示名称 */
    label: string
    /** 参数类型 */
    type: MaterialParameterType
    /** 绑定路径（从 root 开始） */
    bindingPath: string
    /** 默认值（不提供则取当前值） */
    defaultValue?: unknown
    /** 参数描述 */
    description?: string
    /** enum 类型可选项 */
    options?: Array<{ label: string; value: unknown }>
    /** 是否必填 */
    required?: boolean
}
