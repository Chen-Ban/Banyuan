import type { IBanvasActions, IPageNode, IViewNode } from 'banvasgl'

/**
 * 打印模板导出工具
 *
 * 遍历当前画布中所有 view，收集开启了动态打印（__printEnabled）的容器信息，
 * 以及画布的背景图（canvas toDataURL），打包为 PrintConfigExport 结构。
 *
 * 前端只负责标记"哪些容器参与动态打印"及其位置/尺寸，
 * 具体的字段映射（容器 → 数据库表字段）由运营人员在 CRM 中配置。
 *
 * 设计说明：
 * BanvasGL 不仅是一个渲染图形库，它是低代码平台的底层引擎。
 * lunlunglass 作为第一个业务项目，目前主要使用了渲染能力，
 * 但同时也在验证引擎的扩展能力——例如此处通过 view.data 扩展字段
 * （__printEnabled）来支持打印服务的业务需求。
 * 这种"引擎提供通用 data 存储机制，业务层自定义语义"的模式，
 * 也是后续低代码平台其他能力（表单绑定、条件渲染、动态数据源等）的验证路径。
 */

/**
 * 一个参与动态打印的容器槽位
 * 不含具体字段映射——映射由 CRM 管理
 */
interface PrintSlot {
  /** view 在引擎中的唯一 ID，CRM 通过此 ID 关联映射配置 */
  viewId: string
  /** view 名称（方便运营人员在 CRM 中识别） */
  label: string
  /** 容器在画布中的位置和尺寸 */
  bounds: { x: number; y: number; width: number; height: number }
}

export interface PrintConfigExport {
  paperWidth: 58 | 80
  dpi: number
  backgroundImage: string
  backgroundSize: { width: number; height: number }
  /** 参与动态打印的容器列表 */
  slots: PrintSlot[]
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
  const currentPage = pages.find((p) => p.id === currentPageId)
  if (!currentPage) return null

  const allViewIds = collectViewIds(currentPage.children)

  // 收集启用了动态打印的容器
  const slots: PrintSlot[] = []

  for (const viewId of allViewIds) {
    const viewData = actions.view.getViewData(viewId)
    const printEnabled = !!(viewData?.['__printEnabled'] as any)?.value
    if (!printEnabled) continue

    const viewInstance = actions.view.getViewInstance(viewId)
    if (!viewInstance) continue

    const x = actions.view.getProperty(viewId, 'x') ?? 0
    const y = actions.view.getProperty(viewId, 'y') ?? 0
    const width = viewInstance.viewport.width
    const height = viewInstance.viewport.height

    slots.push({
      viewId,
      label: viewInstance.name || viewId,
      bounds: { x, y, width, height },
    })
  }

  // 获取背景图
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
    slots,
  }
}
