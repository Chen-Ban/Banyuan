import type { IBanvasActions, IPageNode, IViewNode } from 'banvasgl'

/**
 * 打印模板导出工具
 *
 * 遍历当前画布中所有 view，收集绑定了 __printFieldKey 的动态字段信息，
 * 以及画布的背景图（canvas toDataURL），打包为 IPrintConfig 结构。
 *
 * 设计说明：
 * BanvasGL 不仅是一个渲染图形库，它是低代码平台的底层引擎。
 * lunlunglass 作为第一个业务项目，目前主要使用了渲染能力，
 * 但同时也在验证引擎的扩展能力——例如此处通过 view.data 扩展字段
 * （__printFieldKey 等）来支持打印服务的业务需求。
 * 这种"引擎提供通用 data 存储机制，业务层自定义语义"的模式，
 * 也是后续低代码平台其他能力（表单绑定、条件渲染、动态数据源等）的验证路径。
 */

interface PrintFieldExport {
  key: string
  label: string
  type: 'text' | 'barcode' | 'qrcode'
  bounds: { x: number; y: number; width: number; height: number }
  textStyle?: {
    fontSize: number
    fontWeight: 'normal' | 'bold'
    align: 'left' | 'center' | 'right'
    overflow: 'clip' | 'ellipsis' | 'shrink'
  }
  defaultValue?: string
}

export interface PrintConfigExport {
  paperWidth: 58 | 80
  dpi: number
  backgroundImage: string
  backgroundSize: { width: number; height: number }
  fields: PrintFieldExport[]
}

/**
 * 递归收集所有 viewNode 的 id
 */
function collectViewIds(nodes: IViewNode[]): string[] {
  const ids: string[] = []
  for (const node of nodes) {
    ids.push(node.id)
    if (node.children?.length) {
      ids.push(...collectViewIds(node.children))
    }
  }
  return ids
}

/**
 * 从画布中导出打印模板配置
 *
 * @param actions BanvasGL actions
 * @param pages 当前页面列表
 * @param currentPageId 当前活跃页面
 * @param canvasElement 画布 DOM 元素（用于获取背景图 dataURL）
 * @param paperWidth 纸张宽度 mm
 * @param dpi 打印分辨率
 */
export function exportPrintConfig(
  actions: IBanvasActions,
  pages: IPageNode[],
  currentPageId: string | null,
  canvasElement: HTMLCanvasElement | null,
  paperWidth: 58 | 80 = 58,
  dpi: number = 203
): PrintConfigExport | null {
  // 获取当前页面
  const currentPage = pages.find((p) => p.id === currentPageId)
  if (!currentPage) return null

  // 收集当前页面所有 view id
  const allViewIds = collectViewIds(currentPage.children)

  // 收集动态字段
  const fields: PrintFieldExport[] = []

  for (const viewId of allViewIds) {
    const viewData = actions.view.getViewData(viewId)
    const printFieldSchema = viewData?.['__printFieldKey']
    if (!printFieldSchema) continue

    const fieldKey = (printFieldSchema as any).value as string
    if (!fieldKey) continue

    const viewInstance = actions.view.getViewInstance(viewId)
    if (!viewInstance) continue

    // 获取视图的位置和尺寸
    const x = actions.view.getProperty(viewId, 'x') ?? 0
    const y = actions.view.getProperty(viewId, 'y') ?? 0
    const width = viewInstance.viewport.width
    const height = viewInstance.viewport.height

    // 根据 view.data 中的 hint 确定字段类型
    let fieldType: 'text' | 'barcode' | 'qrcode' = 'text'
    const typeHint = (viewData?.['__printFieldType'] as any)?.value
    if (typeHint === 'barcode') fieldType = 'barcode'
    else if (typeHint === 'qrcode') fieldType = 'qrcode'

    const field: PrintFieldExport = {
      key: fieldKey,
      label: viewInstance.name || fieldKey,
      type: fieldType,
      bounds: { x, y, width, height },
    }

    // 对文本类型，提取文本样式
    if (fieldType === 'text') {
      field.textStyle = {
        fontSize: 14,
        fontWeight: 'normal',
        align: 'left',
        overflow: 'clip',
      }

      // 尝试从 view.data 读取自定义样式覆盖
      const styleData = viewData?.['__printTextStyle'] as any
      if (styleData?.value) {
        try {
          const parsed = JSON.parse(styleData.value)
          field.textStyle = { ...field.textStyle, ...parsed }
        } catch {
          // 忽略解析错误
        }
      }
    }

    // 默认值
    const defaultVal = (viewData?.['__printDefaultValue'] as any)?.value
    if (defaultVal) field.defaultValue = defaultVal

    fields.push(field)
  }

  // 获取背景图（整个 canvas 的当前渲染内容）
  let backgroundImage = ''
  let backgroundSize = { width: 0, height: 0 }

  if (canvasElement) {
    backgroundImage = canvasElement.toDataURL('image/png')
    backgroundSize = {
      width: canvasElement.width,
      height: canvasElement.height,
    }
  }

  return {
    paperWidth,
    dpi,
    backgroundImage,
    backgroundSize,
    fields,
  }
}
