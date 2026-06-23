/**
 * 相地 · AI Projection 转换器
 *
 * 将 BanvasGL Serializer 原生 JSON（$type/$value 格式）无损转换为 LLM 友好的投影格式。
 * 双向转换：toAIProjection ↔ fromAIProjection 可完美 roundtrip。
 *
 * 设计原则：
 *   1. 展平 $type/$value 包装 → 直接使用 `type` 字段
 *   2. Matrix4 16 元素数组 → 语义化 { x, y, rotation?, scaleX?, scaleY? }
 *   3. 省略默认值（visible=true, freezed=false, null events/lifetimes）
 *   4. 保留所有信息，确保可逆
 */

import type { SerializedData } from '@banyuan/banvasgl'
import type {
    AIProjectionApp,
    AIAppLifetimes,
    AIProjectionScene,
    AIProjectionNode,
    AITransform,
    AISize,
    AIDecoration,
    AIEvents,
    AILifetimes,
    AIDataModel,
    AIGraphViewNode,
    AITextViewNode,
    AIImageViewNode,
    AIVideoViewNode,
    AICombinedViewNode,
    AINodeViewNode,
    AIEdgeViewNode,
    AIPortViewNode,
    AIGenericViewNode,
    AIFlexLayout,
    AIListLayout,
    AIGridLayout,
    AILayoutMode,
} from './projection.types.js'

// ═══════════════════════════════════════════════════════════════════════════════
// 常量
// ═══════════════════════════════════════════════════════════════════════════════

const EPSILON = 1e-6

const EVENT_KEYS: (keyof AIEvents)[] = [
    'onClick', 'onDoubleClick', 'onLongPress',
    'onMouseEnter', 'onMouseLeave', 'onMouseDown',
    'onMouseUp', 'onMouseMove', 'onFocus', 'onBlur',
    'onChange', 'onScroll',
]

const LIFETIME_KEYS: (keyof AILifetimes)[] = [
    'onCreated', 'onAttach', 'onDestroy',
]

const SCENE_LIFETIME_KEYS = ['onLoad', 'onUnload', 'onShow', 'onHide'] as const

// ═══════════════════════════════════════════════════════════════════════════════
// 公共 API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 将 SerializedData（Serializer.serialize 的输出）转换为 AI Projection 格式。
 *
 * @param serializedData - JSON.parse(page) 得到的 SerializedData 对象
 * @returns AI Projection 场景对象
 */
export function toAIProjection(serializedData: SerializedData): AIProjectionScene {
    const sceneWrapper = serializedData.data
    if (!sceneWrapper || sceneWrapper.$type !== 'SCENE') {
        throw new Error(`[AI Projection] Expected $type="SCENE", got: ${sceneWrapper?.$type}`)
    }
    const sceneValue = sceneWrapper.$value
    return projectScene(sceneValue)
}

/**
 * 将 AI Projection 格式转换回 SerializedData（可直接 JSON.stringify 后存入 MongoDB）。
 *
 * @param projection - AI Projection 场景对象
 * @param version - 目标版本号
 * @returns SerializedData 格式的对象
 */
export function fromAIProjection(projection: AIProjectionScene, version: string): SerializedData {
    const sceneData = unprojectScene(projection)
    return {
        type: 'SCENE',
        version,
        data: { $type: 'SCENE', $value: sceneData },
        metadata: {
            timestamp: Date.now(),
            source: 'AI Projection',
        },
    }
}

/**
 * 从 App 级别的 UI 定义 JSON 字符串中提取并转换为 AIProjectionApp。
 *
 * UI 定义 JSON 格式：{ type: "APP", version, data: { lifetimes, scenes: [{ $type, $value }, ...] }, metadata }
 * 每个 scene 元素包装为 { $type: "SCENE", $value: sceneData }。
 */
export function uiJSONToProjection(uiJSON: string): AIProjectionApp {
    const appSerialized: SerializedData = JSON.parse(uiJSON)
    const appData = appSerialized.data

    // App lifetimes 投影（省略全 null 的情况）
    const lifetimes = projectAppLifetimes(appData?.lifetimes)

    const scenes: AIProjectionScene[] = (appData && Array.isArray(appData.scenes))
        ? appData.scenes.map((sceneWrapper: { $type: string; $value: any }) => {
            const sceneSerializedData: SerializedData = {
                type: 'SCENE',
                version: appSerialized.version,
                data: sceneWrapper,
                metadata: appSerialized.metadata,
            }
            return toAIProjection(sceneSerializedData)
        })
        : []

    const app: AIProjectionApp = {
        version: appSerialized.version,
        scenes,
    }
    if (lifetimes) app.lifetimes = lifetimes
    return app
}

/**
 * 将 AIProjectionApp 转换回 App 级别的 UI 定义 JSON 字符串。
 *
 * 输出格式：{ type: "APP", version, data: { lifetimes, scenes: [{ $type, $value }, ...] }, metadata }
 */
export function projectionToUIJSON(app: AIProjectionApp): string {
    const sceneWrappers = app.scenes.map((scene) => {
        const sceneSerializedData = fromAIProjection(scene, app.version)
        return sceneSerializedData.data
    })
    const appSerializedData: SerializedData = {
        type: 'APP',
        version: app.version,
        data: {
            lifetimes: unprojectAppLifetimes(app.lifetimes),
            scenes: sceneWrappers,
        },
        metadata: {
            timestamp: Date.now(),
            source: 'AI Projection',
        },
    }
    return JSON.stringify(appSerializedData)
}

// ═══════════════════════════════════════════════════════════════════════════════
// App Lifetimes 投影
// ═══════════════════════════════════════════════════════════════════════════════

const APP_LIFETIME_KEYS = ['onLaunch', 'onUnlaunch'] as const

/**
 * 将 App.lifetimes（{ onLaunch: FlowSchema|null, onUnlaunch: FlowSchema|null }）投影为
 * AIAppLifetimes（省略全 null 的情况，省略单个 null 条目）。
 */
function projectAppLifetimes(rawLifetimes: any): AIAppLifetimes | undefined {
    if (!rawLifetimes) return undefined
    const lt: Record<string, unknown> = {}
    let hasAny = false
    for (const key of APP_LIFETIME_KEYS) {
        if (rawLifetimes[key] != null) {
            lt[key] = rawLifetimes[key]
            hasAny = true
        }
    }
    return hasAny ? (lt as AIAppLifetimes) : undefined
}

/**
 * 将 AIAppLifetimes 反投影为原始 { onLaunch: FlowSchema|null, onUnlaunch: FlowSchema|null } 格式。
 */
function unprojectAppLifetimes(lifetimes?: AIAppLifetimes): { onLaunch: unknown; onUnlaunch: unknown } {
    return {
        onLaunch: lifetimes?.onLaunch ?? null,
        onUnlaunch: lifetimes?.onUnlaunch ?? null,
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Scene 投影
// ═══════════════════════════════════════════════════════════════════════════════

function projectScene(sceneValue: any): AIProjectionScene {
    const scene: AIProjectionScene = {
        id: sceneValue.id,
        size: { width: 375, height: 812 }, // 默认移动端尺寸
        children: [],
    }

    // 场景名称
    if (sceneValue.name) scene.name = sceneValue.name

    // 从 camera viewport 推断页面尺寸
    if (sceneValue.camera) {
        const cameraType = sceneValue.camera.$type ?? 'ORTHOGRAPHIC'
        const cameraValue = sceneValue.camera.$value ?? sceneValue.camera
        if (cameraValue.viewport) {
            scene.size = {
                width: cameraValue.viewport.width,
                height: cameraValue.viewport.height,
            }
        }
        // 非默认相机类型时保留
        if (cameraType !== 'ORTHOGRAPHIC') {
            scene.cameraType = cameraType
        }
    }

    // 场景背景色（从 data 中提取）
    if (sceneValue.data?.backgroundColor) {
        scene.backgroundColor = sceneValue.data.backgroundColor
    }

    // 场景生命周期（过滤 null）
    if (sceneValue.lifetimes) {
        const lt: any = {}
        let hasAny = false
        for (const key of SCENE_LIFETIME_KEYS) {
            if (sceneValue.lifetimes[key] != null) {
                lt[key] = sceneValue.lifetimes[key]
                hasAny = true
            }
        }
        if (hasAny) scene.lifetimes = lt
    }

    // 子视图
    if (sceneValue.children && Array.isArray(sceneValue.children)) {
        scene.children = sceneValue.children
            .map((child: any) => projectNode(child))
            .filter(Boolean) as AIProjectionNode[]
    }

    return scene
}

function unprojectScene(projection: AIProjectionScene): any {
    // 还原场景生命周期
    const lifetimes: Record<string, unknown> = {}
    for (const key of SCENE_LIFETIME_KEYS) {
        lifetimes[key] = projection.lifetimes?.[key as keyof typeof projection.lifetimes] ?? null
    }

    // 还原场景 data
    const sceneData: Record<string, unknown> = {}
    if (projection.backgroundColor) {
        sceneData.backgroundColor = projection.backgroundColor
    }

    const result: any = {
        id: projection.id,
        data: sceneData,
        lifetimes,
        camera: {
            $type: projection.cameraType ?? 'ORTHOGRAPHIC',
            $value: {
                type: projection.cameraType ?? 'ORTHOGRAPHIC',
                viewport: {
                    x: 0,
                    y: 0,
                    width: projection.size.width,
                    height: projection.size.height,
                },
            },
        },
        children: projection.children.map((child) => unprojectNode(child)),
    }

    // 保留场景名称
    if (projection.name) result.name = projection.name

    return result
}

// ═══════════════════════════════════════════════════════════════════════════════
// Node 投影（$type/$value → AIProjectionNode）
// ═══════════════════════════════════════════════════════════════════════════════

function projectNode(wrapped: any): AIProjectionNode | null {
    if (!wrapped) return null
    const type = wrapped.$type ?? wrapped.type
    const data = wrapped.$value ?? wrapped
    if (!type) return null

    const base = projectBaseFields(data)

    switch (type) {
        case 'GRAPHVIEW':
            return projectGraphView(base, data)
        case 'TEXTVIEW':
            return projectTextView(base, data)
        case 'IMAGEVIEW':
            return projectImageView(base, data)
        case 'VIDEOVIEW':
            return projectVideoView(base, data)
        case 'COMBINEDVIEW':
            return projectCombinedView(base, data)
        case 'NODEVIEW':
            return projectNodeView(base, data)
        case 'EDGEVIEW':
            return projectEdgeView(base, data)
        case 'PORTVIEW':
            return projectPortView(base, data)
        default:
            return projectGenericView(type, base, data)
    }
}

function unprojectNode(node: AIProjectionNode): any {
    const base = unprojectBaseFields(node)
    let extra: Record<string, unknown>

    switch (node.type) {
        case 'GRAPHVIEW':
            extra = unprojectGraphView(node as AIGraphViewNode)
            break
        case 'TEXTVIEW':
            extra = unprojectTextView(node as AITextViewNode)
            break
        case 'IMAGEVIEW':
            extra = unprojectImageView(node as AIImageViewNode)
            break
        case 'VIDEOVIEW':
            extra = unprojectVideoView(node as AIVideoViewNode)
            break
        case 'COMBINEDVIEW':
            extra = unprojectCombinedView(node as AICombinedViewNode)
            break
        case 'NODEVIEW':
            extra = unprojectNodeView(node as AINodeViewNode)
            break
        case 'EDGEVIEW':
            extra = unprojectEdgeView(node as AIEdgeViewNode)
            break
        case 'PORTVIEW':
            extra = unprojectPortView(node as AIPortViewNode)
            break
        default:
            extra = unprojectGenericView(node as AIGenericViewNode)
            break
    }

    return { $type: node.type, $value: { ...base, ...extra } }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 各 ViewType 投影实现
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GraphView ────────────────────────────────────────────────────────────────

function projectGraphView(base: BaseFields, data: any): AIGraphViewNode {
    const content = data.content
        ? { graphType: data.content.$type, data: data.content.$value ?? {} }
        : null
    return { ...base, type: 'GRAPHVIEW', content }
}

function unprojectGraphView(node: AIGraphViewNode): Record<string, unknown> {
    return {
        content: node.content
            ? { $type: node.content.graphType, $value: node.content.data }
            : null,
        children: [],
    }
}

// ─── TextView ─────────────────────────────────────────────────────────────────

function projectTextView(base: BaseFields, data: any): AITextViewNode {
    let content: AITextViewNode['content'] = null
    if (data.content) {
        const textFieldsData = data.content.$value ?? data.content
        if (textFieldsData.paragraphs) {
            content = { paragraphs: projectTextParagraphs(textFieldsData.paragraphs) }
        }
    }
    return { ...base, type: 'TEXTVIEW', content }
}

function unprojectTextView(node: AITextViewNode): Record<string, unknown> {
    if (!node.content) return { content: null, children: [], editable: true, verticalAlign: 'top' }
    return {
        content: {
            $type: 'TEXTFIELDS',
            $value: {
                paragraphs: unprojectTextParagraphs(node.content.paragraphs),
                // options 必须存在：TextFields.fromJSON → TextFieldsOptions.fromJSON(undefined)
                // 会因读取 undefined.verticalAlign 抛错，补全默认值避免反序列化崩溃。
                options: {
                    verticalAlign: 'TOP',
                    paragraphSpacing: 0,
                    fixedWidth: true,
                    fixedHeight: false,
                },
            },
        },
        children: [],
        editable: true,
        verticalAlign: 'top',
    }
}

/** AI 简化模型的 align ←→ banvasgl HorizontalAlign 互转 */
const AI_ALIGN_TO_BANVAS: Record<string, string> = { left: 'LEFT', center: 'CENTER', right: 'RIGHT' }
const BANVAS_ALIGN_TO_AI: Record<string, 'left' | 'center' | 'right'> = { LEFT: 'left', CENTER: 'center', RIGHT: 'right' }

/** {r,g,b,a} → '#rrggbb'（banvasgl Color.toJSON 形态 → AI 简化色串） */
function rgbaToHex(color: any): string | undefined {
    if (!color || typeof color !== 'object') return undefined
    const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n ?? 0))).toString(16).padStart(2, '0')
    return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`
}

/** '#rrggbb' → {r,g,b,a}（AI 简化色串 → banvasgl Color.toJSON 形态） */
function hexToRgba(hex: string): { r: number; g: number; b: number; a: number } {
    let h = (hex || '#000000').replace('#', '')
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('')
    const r = parseInt(h.substring(0, 2), 16)
    const g = parseInt(h.substring(2, 4), 16)
    const b = parseInt(h.substring(4, 6), 16)
    const a = h.length === 8 ? parseInt(h.substring(6, 8), 16) / 255 : 1
    return {
        r: Number.isNaN(r) ? 0 : r,
        g: Number.isNaN(g) ? 0 : g,
        b: Number.isNaN(b) ? 0 : b,
        a: Number.isNaN(a) ? 1 : a,
    }
}

/**
 * 正投影：banvasgl TextParagraph JSON → AI 简化模型。
 *
 * banvasgl 段落结构为 `{ texts: [...PrintableTextElement, NonPrintableTextElement], options }`，
 * 每个 PrintableTextElement 是「单字符」`{ content, options: { color:{r,g,b,a}, size, weight, style } }`，
 * 末尾还有一个 NonPrintableTextElement 段落守卫。AI 侧使用「整段文本 + style」的语义化表示，
 * 因此这里需要：① 跳过守卫；② 把连续同 style 的单字符合并成一个 element 文本。
 */
function projectTextParagraphs(paragraphs: any[]): any[] {
    return paragraphs.map((para: any) => {
        const paraData = para.$value ?? para
        // banvasgl 真实字段为 texts，历史/异常数据可能用 elements，做兜底
        const rawTexts: any[] = paraData.texts ?? paraData.elements ?? []

        type RunStyle = { fontSize?: number; fontWeight?: string; color?: string; italic?: boolean }
        const elements: Array<{ text: string; style?: any }> = []
        let curText = ''
        let curStyleKey: string | null = null
        let curStyle: RunStyle = {}

        const flush = () => {
            if (curText === '') return
            const el: any = { text: curText }
            if (Object.keys(curStyle).length > 0) el.style = curStyle
            elements.push(el)
            curText = ''
        }

        for (const raw of rawTexts) {
            const t = raw.$value ?? raw
            // 跳过不可打印段落守卫（NonPrintableTextElement）
            if (t.$class === 'NonPrintableTextElement') continue

            const opts = t.options ?? {}
            const style: RunStyle = {}
            const fontSize = opts.size
            if (fontSize != null && fontSize !== 14) style.fontSize = fontSize
            if (opts.weight && opts.weight !== 'normal') style.fontWeight = opts.weight
            const hex = rgbaToHex(opts.color)
            if (hex && hex !== '#000000') style.color = hex
            if (opts.style === 'italic') style.italic = true

            const styleKey = JSON.stringify(style)
            const char = typeof t.content === 'string' ? t.content : ''
            if (styleKey !== curStyleKey) {
                flush()
                curStyleKey = styleKey
                curStyle = style
            }
            curText += char
        }
        flush()

        const result: any = { elements }
        const align = BANVAS_ALIGN_TO_AI[paraData.options?.horizontalAlign as string]
        if (align && align !== 'left') result.align = align
        return result
    })
}

/**
 * 反投影：AI 简化模型 → banvasgl TextParagraph JSON。
 *
 * 与 banvasgl 反序列化契约严格对齐：
 * - 段落字段为 `texts`（不是 elements），末尾必须补一个 NonPrintableTextElement 段落守卫；
 * - 每个文字 element 的 `text` 需拆分为「单字符」PrintableTextElement，每个带完整 `options`；
 * - `options.color` 为 `{r,g,b,a}` 对象（不是色串），`options` 字段必须存在，否则
 *   `TextOptions.fromJSON(undefined)` → `Color.fromJSON(undefined.color)` 会抛 `reading 'color'`。
 */
function unprojectTextParagraphs(paragraphs: any[]): any[] {
    return paragraphs.map((para) => {
        const texts: any[] = []
        for (const elem of para.elements ?? []) {
            const options = {
                color: hexToRgba(elem.style?.color ?? '#000000'),
                family: 'Arial',
                size: elem.style?.fontSize ?? 14,
                letterSpacing: 0,
                style: elem.style?.italic ? 'italic' : 'normal',
                weight: elem.style?.fontWeight ?? 'normal',
            }
            const text = typeof elem.text === 'string' ? elem.text : ''
            // 拆分为单字符 PrintableTextElement，满足 banvasgl 单字符约束。
            // banvasgl TextParagraph.fromJSON 按 $class 分发，type 字段不参与反序列化，故省略。
            for (const char of Array.from(text)) {
                texts.push({
                    $class: 'PrintableTextElement',
                    content: char,
                    options: { ...options, color: { ...options.color } },
                })
            }
        }
        // 段落守卫：banvasgl TextParagraph 末尾固定有一个 NonPrintableTextElement
        texts.push({ $class: 'NonPrintableTextElement' })

        return {
            id: crypto.randomUUID(),
            texts,
            options: {
                horizontalAlign: AI_ALIGN_TO_BANVAS[para.align ?? 'left'] ?? 'LEFT',
                leading: 1.2,
                preHeight: 0,
                postHeight: 0,
                indentation: 0,
                preWidth: 0,
            },
        }
    })
}

// ─── ImageView ────────────────────────────────────────────────────────────────

function projectImageView(base: BaseFields, data: any): AIImageViewNode {
    let src: string | null = null
    let objectFit: AIImageViewNode['objectFit']
    if (data.content) {
        const imageData = data.content.$value ?? data.content
        src = imageData.src ?? imageData.url ?? null
        if (imageData.objectFit && imageData.objectFit !== 'fill') {
            objectFit = imageData.objectFit
        }
    }
    const result: AIImageViewNode = { ...base, type: 'IMAGEVIEW', src }
    if (objectFit) result.objectFit = objectFit
    return result
}

function unprojectImageView(node: AIImageViewNode): Record<string, unknown> {
    if (!node.src) return { content: null, children: [] }
    const value: Record<string, unknown> = { src: node.src }
    if (node.objectFit) value.objectFit = node.objectFit
    return { content: { $type: 'IMAGE', $value: value }, children: [] }
}

// ─── VideoView ────────────────────────────────────────────────────────────────

function projectVideoView(base: BaseFields, data: any): AIVideoViewNode {
    let src: string | null = null
    if (data.content) {
        const videoData = data.content.$value ?? data.content
        src = videoData.src ?? videoData.url ?? null
    }
    return { ...base, type: 'VIDEOVIEW', src }
}

function unprojectVideoView(node: AIVideoViewNode): Record<string, unknown> {
    if (!node.src) return { content: null, children: [] }
    return { content: { $type: 'VIDEO', $value: { src: node.src } }, children: [] }
}

// ─── CombinedView ─────────────────────────────────────────────────────────────

function projectCombinedView(base: BaseFields, data: any): AICombinedViewNode {
    const result: AICombinedViewNode = { ...base, type: 'COMBINEDVIEW', children: [] }
    const style = data.style ?? {}

    if (style.layoutMode && style.layoutMode !== 'free') {
        result.layoutMode = style.layoutMode as AILayoutMode
    }
    if (style.layoutMode === 'flex' && style.flexLayout) {
        result.flexLayout = projectFlexLayout(style.flexLayout)
    }
    if (style.layoutMode === 'list' && style.listLayout) {
        result.listLayout = projectListLayout(style.listLayout)
    }
    if (style.layoutMode === 'grid' && style.gridLayout) {
        result.gridLayout = projectGridLayout(style.gridLayout)
    }

    if (data.children && Array.isArray(data.children)) {
        result.children = data.children
            .map((child: any) => projectNode(child))
            .filter(Boolean) as AIProjectionNode[]
    }

    return result
}

function unprojectCombinedView(node: AICombinedViewNode): Record<string, unknown> {
    // CombinedView 的 style 需要合并 base 中的 overflow 和自身的 layout 字段
    const style: Record<string, unknown> = {}
    // 从 decoration.overflow 推断 style.overflow
    if (node.decoration?.overflow === 'hidden') {
        style.overflow = 'hidden'
    } else if (node.decoration?.overflow === 'scroll') {
        style.overflow = 'scroll'
    }
    if (node.layoutMode) style.layoutMode = node.layoutMode
    if (node.flexLayout) style.flexLayout = unprojectFlexLayout(node.flexLayout)
    if (node.listLayout) style.listLayout = unprojectListLayout(node.listLayout)
    if (node.gridLayout) style.gridLayout = unprojectGridLayout(node.gridLayout)

    return {
        content: null,
        style,
        children: node.children.map((child) => unprojectNode(child)),
    }
}

// ─── NodeView ─────────────────────────────────────────────────────────────────

function projectNodeView(base: BaseFields, data: any): AINodeViewNode {
    const result: AINodeViewNode = {
        ...base,
        type: 'NODEVIEW',
        schema: data.schema ?? {},
        nodeTitle: data.nodeTitle ?? '',
        children: [],
    }
    if (data.children && Array.isArray(data.children)) {
        result.children = data.children
            .map((child: any) => projectNode(child))
            .filter(Boolean) as AIProjectionNode[]
    }
    return result
}

function unprojectNodeView(node: AINodeViewNode): Record<string, unknown> {
    return {
        content: null,
        schema: node.schema,
        nodeTitle: node.nodeTitle,
        children: node.children.map((child) => unprojectNode(child)),
    }
}

// ─── EdgeView ─────────────────────────────────────────────────────────────────

function projectEdgeView(base: BaseFields, data: any): AIEdgeViewNode {
    return {
        ...base,
        type: 'EDGEVIEW',
        fromPortId: data.fromPortId ?? null,
        toPortId: data.toPortId ?? null,
    }
}

function unprojectEdgeView(node: AIEdgeViewNode): Record<string, unknown> {
    return {
        content: null,
        children: [],
        fromPortId: node.fromPortId,
        toPortId: node.toPortId,
    }
}

// ─── PortView ─────────────────────────────────────────────────────────────────

function projectPortView(base: BaseFields, data: any): AIPortViewNode {
    const result: AIPortViewNode = {
        ...base,
        type: 'PORTVIEW',
        portDirection: data.portDirection ?? 'output',
    }
    if (data.maxConnections != null && data.maxConnections !== 1) {
        result.maxConnections = data.maxConnections
    }
    return result
}

function unprojectPortView(node: AIPortViewNode): Record<string, unknown> {
    return {
        content: null,
        children: [],
        portDirection: node.portDirection,
        maxConnections: node.maxConnections ?? 1,
    }
}

// ─── Generic View ─────────────────────────────────────────────────────────────

function projectGenericView(type: string, base: BaseFields, data: any): AIGenericViewNode {
    const result: AIGenericViewNode = { ...base, type }
    if (data.content) result.content = data.content
    if (data.children && Array.isArray(data.children) && data.children.length > 0) {
        result.children = data.children
            .map((child: any) => projectNode(child))
            .filter(Boolean) as AIProjectionNode[]
    }
    return result
}

function unprojectGenericView(node: AIGenericViewNode): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    result.content = node.content ?? null
    result.children = node.children
        ? node.children.map((child) => unprojectNode(child))
        : []
    return result
}

// ═══════════════════════════════════════════════════════════════════════════════
// 公共字段投影
// ═══════════════════════════════════════════════════════════════════════════════

/** 投影后的公共字段（内部类型） */
interface BaseFields {
    type: string
    id: string
    transform: AITransform
    size: AISize
    visible?: boolean
    freezed?: boolean
    decoration?: AIDecoration
    events?: AIEvents
    lifetimes?: AILifetimes
    data?: AIDataModel
    flexLayout?: AIFlexLayout
}

function projectBaseFields(data: any): BaseFields {
    const transform = projectMatrix4(data.matrix)
    const size = projectViewport(data.viewport)

    const result: BaseFields = {
        type: '', // 由调用方覆盖
        id: data.id,
        transform,
        size,
    }

    if (data.visible === false) result.visible = false
    if (data.freezed === true) result.freezed = true

    if (data.decoration && Object.keys(data.decoration).length > 0) {
        result.decoration = projectDecoration(data.decoration)
    }

    if (data.events) {
        const events = projectEvents(data.events)
        if (events) result.events = events
    }

    if (data.lifetimes) {
        const lifetimes = projectLifetimes(data.lifetimes)
        if (lifetimes) result.lifetimes = lifetimes
    }

    if (data.data && Object.keys(data.data).length > 0) {
        result.data = data.data as AIDataModel
    }

    // 子元素级 flex 属性（flex/alignSelf）从 style.flexLayout 中提取
    const flexLayout = data.style?.flexLayout
    if (flexLayout) {
        const childFlexProps: Record<string, unknown> = {}
        if (flexLayout.flex !== undefined) childFlexProps.flex = flexLayout.flex
        if (flexLayout.alignSelf) childFlexProps.alignSelf = flexLayout.alignSelf
        if (Object.keys(childFlexProps).length > 0) {
            result.flexLayout = childFlexProps as any
        }
    }

    return result
}

function unprojectBaseFields(node: AIProjectionNode): Record<string, unknown> {
    // 还原 style：从 decoration.overflow 推断 style.overflow
    const style: Record<string, unknown> = {}
    if (node.decoration?.overflow === 'hidden') {
        style.overflow = 'hidden'
    } else if (node.decoration?.overflow === 'scroll') {
        style.overflow = 'scroll'
    }

    // 子元素级 flex 属性还原到 style.flexLayout
    if (node.flexLayout && (node.flexLayout.flex !== undefined || node.flexLayout.alignSelf)) {
        const flexLayout: Record<string, unknown> = {}
        if (node.flexLayout.flex !== undefined) flexLayout.flex = node.flexLayout.flex
        if (node.flexLayout.alignSelf) flexLayout.alignSelf = node.flexLayout.alignSelf
        style.flexLayout = flexLayout
    }

    return {
        id: node.id,
        type: node.type,
        visible: node.visible ?? true,
        freezed: node.freezed ?? false,
        data: node.data ?? {},
        events: unprojectEvents(node.events),
        lifetimes: unprojectLifetimes(node.lifetimes),
        style,
        matrix: unprojectMatrix4(node.transform),
        viewport: unprojectViewport(node.size),
        constraintBounds: unprojectViewport(node.size),
        decoration: node.decoration ? unprojectDecoration(node.decoration) : undefined,
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Matrix4 ↔ AITransform
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 从 Matrix4 的 16 元素行主序数组提取语义化坐标。
 *
 * BanvasGL Matrix4 行主序布局：
 *   [m00, m01, m02, tx,    ← row 0 (索引 0-3)
 *    m10, m11, m12, ty,    ← row 1 (索引 4-7)
 *    m20, m21, m22, tz,    ← row 2 (索引 8-11)
 *    0,   0,   0,   1 ]   ← row 3 (索引 12-15)
 *
 * BanvasGL rotationZ(θ) 产生：
 *   data[0] = cos θ,  data[1] = sin θ
 *   data[4] = -sin θ, data[5] = cos θ
 *
 * SRT 组合后（Scale → Rotate → Translate）：
 *   data[0] = scaleX * cos θ,  data[1] = scaleY * sin θ
 *   data[4] = scaleX * (-sin θ), data[5] = scaleY * cos θ
 *   data[3] = tx, data[7] = ty
 *
 * 分解公式（与 Matrix4.extractRotationZ 一致）：
 *   rotation = atan2(-data[4], data[0])
 *   scaleX = sqrt(data[0]² + data[4]²)
 *   scaleY = sqrt(data[1]² + data[5]²)
 */
function projectMatrix4(matrixData: any): AITransform {
    if (!matrixData || !matrixData.transform) {
        return { x: 0, y: 0 }
    }

    const t: number[] = matrixData.transform
    const x = t[3] ?? 0
    const y = t[7] ?? 0
    const scaleX = Math.sqrt(t[0] * t[0] + t[4] * t[4])
    const scaleY = Math.sqrt(t[1] * t[1] + t[5] * t[5])
    // 与 Matrix4.extractRotationZ() 一致：atan2(-data[4], data[0])
    const rotation = Math.atan2(-t[4], t[0]) * (180 / Math.PI)

    const result: AITransform = { x: round(x), y: round(y) }
    if (Math.abs(rotation) > EPSILON) result.rotation = round(rotation)
    if (Math.abs(scaleX - 1) > EPSILON) result.scaleX = round(scaleX)
    if (Math.abs(scaleY - 1) > EPSILON) result.scaleY = round(scaleY)

    return result
}

/**
 * 从语义化坐标重建 Matrix4 的 toJSON 格式。
 * 构建顺序：Scale → Rotate → Translate（SRT）
 *
 * BanvasGL rotationZ(θ) 约定：
 *   data[0] = cos θ,  data[1] = sin θ
 *   data[4] = -sin θ, data[5] = cos θ
 *
 * SRT 组合：
 *   data[0] = scaleX * cos θ,    data[1] = scaleY * sin θ
 *   data[4] = scaleX * (-sin θ),  data[5] = scaleY * cos θ
 *   data[3] = tx, data[7] = ty
 */
function unprojectMatrix4(transform: AITransform): any {
    const { x, y, rotation = 0, scaleX = 1, scaleY = 1 } = transform
    const rad = rotation * (Math.PI / 180)
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)

    // 行主序 4×4 矩阵，与 BanvasGL rotationZ 约定一致
    return {
        transform: [
            scaleX * cos, scaleY * sin, 0, x,
            scaleX * (-sin), scaleY * cos, 0, y,
            0, 0, 1, 0,
            0, 0, 0, 1,
        ],
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Viewport ↔ AISize
// ═══════════════════════════════════════════════════════════════════════════════

function projectViewport(viewport: any): AISize {
    if (!viewport) return { width: 0, height: 0 }
    return { width: viewport.width ?? 0, height: viewport.height ?? 0 }
}

function unprojectViewport(size: AISize): any {
    return { x: 0, y: 0, width: size.width, height: size.height }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Decoration 投影
// ═══════════════════════════════════════════════════════════════════════════════

function projectDecoration(decoration: any): AIDecoration | undefined {
    if (!decoration) return undefined
    const result: AIDecoration = {}

    if (decoration.backgroundColor && decoration.backgroundColor !== 'transparent') {
        result.fill = { color: decoration.backgroundColor }
    }
    if (decoration.opacity != null && decoration.opacity !== 1) {
        if (!result.fill) result.fill = {}
        result.fill.opacity = decoration.opacity
    }
    if (decoration.borderWidth && decoration.borderWidth > 0) {
        result.stroke = {
            width: decoration.borderWidth,
            color: decoration.borderColor ?? '#000000',
        }
    }
    if (decoration.borderRadius && decoration.borderRadius !== 0) {
        result.cornerRadius = decoration.borderRadius
    }
    if (decoration.clipContent === true) {
        result.overflow = 'hidden'
    }

    return Object.keys(result).length > 0 ? result : undefined
}

function unprojectDecoration(dec: AIDecoration): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    if (dec.fill?.color && typeof dec.fill.color === 'string') {
        result.backgroundColor = dec.fill.color
    }
    if (dec.fill?.opacity !== undefined) result.opacity = dec.fill.opacity
    if (dec.stroke?.color && typeof dec.stroke.color === 'string') {
        result.borderColor = dec.stroke.color
    }
    if (dec.stroke?.width !== undefined) result.borderWidth = dec.stroke.width
    if (dec.cornerRadius !== undefined) result.borderRadius = dec.cornerRadius
    if (dec.overflow === 'hidden' || dec.overflow === 'scroll') {
        result.clipContent = true
    }
    return result
}

// ═══════════════════════════════════════════════════════════════════════════════
// Events & Lifetimes
// ═══════════════════════════════════════════════════════════════════════════════

function projectEvents(events: Record<string, unknown>): AIEvents | undefined {
    const result: Record<string, unknown> = {}
    let hasAny = false
    for (const key of EVENT_KEYS) {
        if (events[key] != null) {
            result[key] = events[key]
            hasAny = true
        }
    }
    return hasAny ? (result as AIEvents) : undefined
}

function unprojectEvents(events?: AIEvents): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const key of EVENT_KEYS) {
        result[key] = events?.[key] ?? null
    }
    return result
}

function projectLifetimes(lifetimes: Record<string, unknown>): AILifetimes | undefined {
    const result: Record<string, unknown> = {}
    let hasAny = false
    for (const key of LIFETIME_KEYS) {
        if (lifetimes[key] != null) {
            result[key] = lifetimes[key]
            hasAny = true
        }
    }
    return hasAny ? (result as AILifetimes) : undefined
}

function unprojectLifetimes(lifetimes?: AILifetimes): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const key of LIFETIME_KEYS) {
        result[key] = lifetimes?.[key] ?? null
    }
    return result
}

// ═══════════════════════════════════════════════════════════════════════════════
// Layout
// ═══════════════════════════════════════════════════════════════════════════════

function projectFlexLayout(flex: any): AIFlexLayout {
    const result: AIFlexLayout = {}
    // 容器级属性
    if (flex.direction) result.direction = flex.direction
    if (flex.wrap) result.wrap = flex.wrap
    if (flex.gap != null) result.gap = flex.gap
    if (flex.mainAxisAlignment) result.mainAxisAlignment = flex.mainAxisAlignment
    if (flex.crossAxisAlignment) result.crossAxisAlignment = flex.crossAxisAlignment
    if (flex.padding != null) result.padding = flex.padding
    // 子元素级属性
    if (flex.flex !== undefined) result.flex = flex.flex
    if (flex.alignSelf) result.alignSelf = flex.alignSelf
    return result
}

function unprojectFlexLayout(flex: AIFlexLayout): any {
    return { ...flex }
}

function projectListLayout(list: any): AIListLayout {
    const result: AIListLayout = {}
    if (list.direction) result.direction = list.direction
    if (list.gap != null) result.gap = list.gap
    if (list.padding != null) result.padding = list.padding
    return result
}

function unprojectListLayout(list: AIListLayout): any {
    return { ...list }
}

function projectGridLayout(grid: any): AIGridLayout {
    const result: AIGridLayout = {}
    if (grid.columns != null) result.columns = grid.columns
    if (grid.rowGap != null) result.rowGap = grid.rowGap
    if (grid.columnGap != null) result.columnGap = grid.columnGap
    if (grid.padding != null) result.padding = grid.padding
    return result
}

function unprojectGridLayout(grid: AIGridLayout): any {
    return { ...grid }
}


// ═══════════════════════════════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════════════════════════════

/** 四舍五入到 4 位小数，避免浮点噪声 */
function round(n: number): number {
    return Math.round(n * 10000) / 10000
}
