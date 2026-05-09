/**
 * History（撤销/重做）操作
 */

import type { IHistoryActions } from '@/core/interfaces'
import type { App } from '@/core/app'

/**
 * 创建 HistoryActions 实例
 *
 * 注意：canUndo / canRedo 是 getter，每次访问时实时计算。
 */
export function createHistoryActions(getApp: () => App | null): IHistoryActions {
    const notify = () => getApp()?.notify()

    return {
        undo(): boolean {
            const scene = getApp()?.getCurrentScene()
            if (!scene) return false
            const result = scene.undo()
            if (result) notify()
            return result
        },

        redo(): boolean {
            const scene = getApp()?.getCurrentScene()
            if (!scene) return false
            const result = scene.redo()
            if (result) notify()
            return result
        },

        get canUndo(): boolean {
            return getApp()?.getCurrentScene()?.canUndo ?? false
        },

        get canRedo(): boolean {
            return getApp()?.getCurrentScene()?.canRedo ?? false
        },
    }
}
