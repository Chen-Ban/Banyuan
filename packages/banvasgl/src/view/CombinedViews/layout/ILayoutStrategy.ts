/**
 * ILayoutStrategy —— 布局策略接口
 *
 * 策略模式核心契约：所有布局算法（flex/list/grid）实现此接口。
 * CombinedView 根据 style.layoutMode 选择对应策略执行。
 *
 * 设计要点：
 *   - 策略是无状态的纯算法对象，可全局单例复用
 *   - 策略只负责计算子元素位置（设置 child.matrix），不负责 viewport 分配
 *   - viewport 分配（flex 权重）是 flex 策略的内部实现细节
 */

import type View from '@/view/View/View.js'
import type Bounds from '@/graph/base/Bounds.js'

/**
 * 布局上下文 —— 策略执行时的环境信息
 *
 * 由 CombinedView 在调用策略前组装，提供容器的视口信息。
 */
export interface ILayoutContext {
    /** 容器视口（包含 x, y, width, height） */
    viewport: Bounds
}

/**
 * 布局策略接口
 *
 * 所有布局策略（FlexLayoutStrategy、ListLayoutStrategy、GridLayoutStrategy）
 * 实现此接口，提供统一的 layout 方法签名。
 */
export interface ILayoutStrategy {
    /**
     * 执行布局算法，计算并设置子元素的 matrix 位置。
     *
     * @param children 需要布局的子 View 数组（已按 DOM 顺序排列）
     * @param context 布局上下文（容器视口等环境信息）
     * @param config 布局配置（由各策略自行解析对应的 layout 配置）
     */
    layout(children: View[], context: ILayoutContext, config: Record<string, any>): void
}
