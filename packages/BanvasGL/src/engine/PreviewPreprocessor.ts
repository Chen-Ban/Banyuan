/**
 * PreviewPreprocessor — 预览/导出预处理模块
 *
 * 在截图或预览前对画布状态进行临时清理，完成后自动恢复。
 * 采用"快照-清理-执行-恢复"模式，确保预处理不影响用户的编辑状态。
 *
 * 支持的预处理操作：
 *   - clearInteractionStates: 清除所有 View 的 selected/actived 状态（消除插件渲染）
 *
 * 可扩展方向（后续按需添加）：
 *   - hideHelperLayers: 隐藏辅助线、网格等
 *   - hideSpecificViews: 隐藏指定类型的 View（如 SelectBoxView）
 *   - applyExportBackground: 使用导出专用背景色
 */

import type App from './App'
import type Scene from '@/engine/Scene'
import { flattenViewTree } from '@/engine/operations/ViewTree'
import type View from '@/view/View/View'

// ── 状态快照 ──

interface ViewStateSnapshot {
    view: View
    actived: boolean
    selected: boolean
}

interface PreprocessorSnapshot {
    viewStates: ViewStateSnapshot[]
}

// ── 预处理选项 ──

export interface PreprocessOptions {
    /** 清除选中/激活状态，消除 BoundingBox 等插件渲染（默认 true） */
    clearInteractionStates?: boolean
    // 以下为后续扩展预留
    // hideHelperLayers?: boolean
    // hideSpecificViewTypes?: VIEWTYPE[]
    // exportBackground?: string
}

const DEFAULT_OPTIONS: Required<PreprocessOptions> = {
    clearInteractionStates: true,
}

/**
 * 对当前场景执行预处理，返回恢复函数
 *
 * 用法：
 *   const restore = preprocessForExport(app)
 *   app.render()
 *   const dataUrl = app.getRenderer().toDataURL()
 *   restore()
 */
export function preprocessForExport(
    app: App,
    options: PreprocessOptions = {},
): () => void {
    const opts = { ...DEFAULT_OPTIONS, ...options }
    const scene = app.getCurrentScene()
    if (!scene) return () => {}

    const snapshot = captureSnapshot(scene)

    // 执行预处理
    if (opts.clearInteractionStates) {
        clearInteractionStates(scene)
    }

    // 手动触发一次渲染，让清理后的状态反映到 canvas 上
    app.render()

    // 返回恢复函数
    return () => {
        restoreSnapshot(snapshot)
        app.render()
    }
}

// ── 内部实现 ──

function captureSnapshot(scene: Scene): PreprocessorSnapshot {
    const allViews = flattenViewTree(scene)
    const viewStates: ViewStateSnapshot[] = allViews
        .filter((v) => v.actived || v.selected)
        .map((v) => ({
            view: v,
            actived: v.actived,
            selected: v.selected,
        }))

    return { viewStates }
}

function clearInteractionStates(scene: Scene): void {
    const allViews = flattenViewTree(scene)
    allViews.forEach((v) => {
        if (v.actived) v.setActived(false)
        if (v.selected) v.setSelected(false)
    })
}

function restoreSnapshot(snapshot: PreprocessorSnapshot): void {
    snapshot.viewStates.forEach(({ view, actived, selected }) => {
        if (actived) view.setActived(true)
        if (selected) view.setSelected(true)
    })
}
