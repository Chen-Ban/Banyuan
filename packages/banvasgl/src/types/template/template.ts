/**
 * 模板系统核心类型定义
 *
 * Template（模板）是 RawJSON 之上的一层封装，提供可移植、可复用的视图子树模板。
 * 与 Material（物料）的关系：Material = Template + 应用层元信息（IMaterialMeta）。
 *
 * serializeTemplate：将 View 子树快照为模板（ITemplate）
 * instantiateTemplate：将模板还原为 View 实例并注入到场景中
 *
 * 设计决策参见 ADR-027 Step 4。
 */

// ── 模板参数 ──

/** 参数类型（用于 UI 渲染和验证） */
export type TemplateParameterType =
    | 'string'
    | 'number'
    | 'boolean'
    | 'color'
    | 'url'
    | 'enum'
    | 'json'

/** 模板参数定义 */
export interface ITemplateParameter {
    /** 参数 ID（在模板中通过 {{param:paramId}} 引用） */
    id: string
    /** 参数展示名称 */
    label: string
    /** 参数描述 */
    description?: string
    /** 参数类型 */
    type: TemplateParameterType
    /** 默认值 */
    defaultValue: unknown
    /** 参数在模板 JSON 中的绑定路径（如 "root.content.text"） */
    bindingPath: string
    /** enum 类型的可选项 */
    options?: Array<{ label: string; value: unknown }>
    /** 是否必填 */
    required?: boolean
}

// ── 模板资源 ──

/** 模板中引用的外部资源（图片、视频等） */
export interface ITemplateAsset {
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

// ── 模板 ──

/**
 * 模板 — serializeTemplate 的产物
 *
 * root 是序列化后的视图子树 RawJSON（$type/$value 包装），其中：
 * - 所有 id 被替换为 {{id:N}} 占位符
 * - 参数绑定位置被替换为 {{param:paramId}} 占位符
 * - 资源引用被替换为 {{asset:assetId}} 占位符
 * - 根节点 transform 坐标已归零
 * - FlowSchema 中的 viewId 引用已同步替换
 */
export interface ITemplate {
    /** 子树 JSON（含占位符，$type/$value 包装） */
    root: Record<string, unknown>
    /** 模板中使用的 ID 占位符数量（instantiate 时需生成同等数量的新 UUID） */
    idCount: number
    /** FlowSchema 中引用了内部 ID 的路径列表，用于 instantiate 时替换 */
    internalIdRefs: IInternalIdRef[]
    /** 参数定义列表 */
    parameters: ITemplateParameter[]
    /** 资源列表 */
    assets: ITemplateAsset[]
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

// ── Actions 接口 ──

/**
 * 模板操作接口
 *
 * 实现位于 engine/serialization/template/，由 actions/templateActions 作为
 * template.serialize / template.instantiate 暴露。
 */
export interface ITemplateActions {
    /**
     * 将视图子树序列化为模板
     *
     * @param viewId - 要序列化的根视图 ID
     * @param config - 序列化配置
     * @returns 模板，失败返回 null
     */
    serialize(
        viewId: string,
        config: ITemplateSerializeConfig,
    ): ITemplate | null

    /**
     * 将模板实例化为视图并添加到当前场景
     *
     * @param template - 模板
     * @param position - 放置位置
     * @param params - 参数填充值（key 为 paramId）
     * @returns 新创建的根视图 ID，失败返回 null
     */
    instantiate(
        template: ITemplate,
        position: { x: number; y: number },
        params?: Record<string, unknown>,
    ): string | null
}

/** serialize 配置 */
export interface ITemplateSerializeConfig {
    /** 参数绑定定义（哪些路径暴露为参数） */
    parameterBindings?: ITemplateParameterBinding[]
}

/** 参数绑定声明 */
export interface ITemplateParameterBinding {
    /** 参数 ID */
    id: string
    /** 参数展示名称 */
    label: string
    /** 参数类型 */
    type: TemplateParameterType
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
