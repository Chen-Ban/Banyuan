/**
 * 尺寸属性适配器（width / height / scaleX / scaleY）
 *
 * 底层存储：View.viewport（Bounds: x, y, width, height）
 *
 * width/height：直接读写 viewport 尺寸
 * scaleX/scaleY：相对缩放因子，get 返回 1（当前基准），
 *   set 时将 viewport 尺寸乘以目标 scale 值。
 *
 * 注意：set 操作仅修改 viewport 尺寸，不触发 content resize。
 * 如需等比缩放内容，应使用 AnimationAddon._animationResize()。
 */

import type View from '@/view/View/View'
import type { PropertyAdapter } from '@/types/view/property'

export const widthAdapter: PropertyAdapter = {
    category: 'size',

    get(view: View): number {
        return view.viewport.width
    },

    set(view: View, value: number): void {
        view.viewport.setSize(value, view.viewport.height)
    },
}

export const heightAdapter: PropertyAdapter = {
    category: 'size',

    get(view: View): number {
        return view.viewport.height
    },

    set(view: View, value: number): void {
        view.viewport.setSize(view.viewport.width, value)
    },
}

export const scaleXAdapter: PropertyAdapter = {
    category: 'size',

    /**
     * 返回 1 表示当前缩放基准
     * 实际缩放通过修改 viewport.width 实现
     */
    get(): number {
        return 1
    },

    /**
     * 将 viewport.width 乘以 scale 因子
     */
    set(view: View, value: number): void {
        const currentWidth = view.viewport.width
        view.viewport.setSize(currentWidth * value, view.viewport.height)
    },
}

export const scaleYAdapter: PropertyAdapter = {
    category: 'size',

    get(): number {
        return 1
    },

    set(view: View, value: number): void {
        const currentHeight = view.viewport.height
        view.viewport.setSize(view.viewport.width, currentHeight * value)
    },
}

/**
 * 所有尺寸属性适配器
 */
export const sizeAdapters: Record<string, PropertyAdapter> = {
    width: widthAdapter,
    height: heightAdapter,
    scaleX: scaleXAdapter,
    scaleY: scaleYAdapter,
}
