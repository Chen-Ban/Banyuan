/**
 * History（撤销/重做）操作
 */

import type { IHistoryActions, App } from '@banyuan/canvas'

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
