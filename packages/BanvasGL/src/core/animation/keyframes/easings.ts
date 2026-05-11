import type { EasingFunction } from '../types'

/**
 * 内置缓动函数集合
 */
export const Easings = {
    /** 线性 */
    linear: ((t: number) => t) as EasingFunction,

    /** 二次方缓入 */
    easeInQuad: ((t: number) => t * t) as EasingFunction,

    /** 二次方缓出 */
    easeOutQuad: ((t: number) => t * (2 - t)) as EasingFunction,

    /** 二次方缓入缓出 */
    easeInOutQuad: ((t: number) =>
        t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
    ) as EasingFunction,

    /** 三次方缓入 */
    easeInCubic: ((t: number) => t * t * t) as EasingFunction,

    /** 三次方缓出 */
    easeOutCubic: ((t: number) => {
        const t1 = t - 1
        return t1 * t1 * t1 + 1
    }) as EasingFunction,

    /** 三次方缓入缓出 */
    easeInOutCubic: ((t: number) =>
        t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1
    ) as EasingFunction,

    /** 四次方缓入 */
    easeInQuart: ((t: number) => t * t * t * t) as EasingFunction,

    /** 四次方缓出 */
    easeOutQuart: ((t: number) => {
        const t1 = t - 1
        return 1 - t1 * t1 * t1 * t1
    }) as EasingFunction,

    /** 四次方缓入缓出 */
    easeInOutQuart: ((t: number) => {
        const t1 = t - 1
        return t < 0.5 ? 8 * t * t * t * t : 1 - 8 * t1 * t1 * t1 * t1
    }) as EasingFunction,

    /** 正弦缓入 */
    easeInSine: ((t: number) => 1 - Math.cos((t * Math.PI) / 2)) as EasingFunction,

    /** 正弦缓出 */
    easeOutSine: ((t: number) => Math.sin((t * Math.PI) / 2)) as EasingFunction,

    /** 正弦缓入缓出 */
    easeInOutSine: ((t: number) => -(Math.cos(Math.PI * t) - 1) / 2) as EasingFunction,

    /** 指数缓入 */
    easeInExpo: ((t: number) =>
        t === 0 ? 0 : Math.pow(2, 10 * (t - 1))
    ) as EasingFunction,

    /** 指数缓出 */
    easeOutExpo: ((t: number) =>
        t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
    ) as EasingFunction,

    /** 指数缓入缓出 */
    easeInOutExpo: ((t: number) => {
        if (t === 0) return 0
        if (t === 1) return 1
        return t < 0.5
            ? Math.pow(2, 20 * t - 10) / 2
            : (2 - Math.pow(2, -20 * t + 10)) / 2
    }) as EasingFunction,

    /** 回弹缓入 */
    easeInBack: ((t: number) => {
        const c = 1.70158
        return (c + 1) * t * t * t - c * t * t
    }) as EasingFunction,

    /** 回弹缓出 */
    easeOutBack: ((t: number) => {
        const c = 1.70158
        const t1 = t - 1
        return 1 + (c + 1) * t1 * t1 * t1 + c * t1 * t1
    }) as EasingFunction,

    /** 回弹缓入缓出 */
    easeInOutBack: ((t: number) => {
        const c = 1.70158 * 1.525
        return t < 0.5
            ? (Math.pow(2 * t, 2) * ((c + 1) * 2 * t - c)) / 2
            : (Math.pow(2 * t - 2, 2) * ((c + 1) * (t * 2 - 2) + c) + 2) / 2
    }) as EasingFunction,
} as const

/**
 * 创建三次贝塞尔缓动函数
 * 与 CSS cubic-bezier() 一致
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): EasingFunction {
    // 三次贝塞尔曲线采样（Horner 法则展开）
    // B(t) = 3(1-t)²t·P1 + 3(1-t)t²·P2 + t³ 展开为: (1-3P2+3P1)t³ + (3P2-6P1)t² + 3P1·t
    const sampleCurveX = (t: number) => (((1 - 3 * x2 + 3 * x1) * t + (3 * x2 - 6 * x1)) * t + 3 * x1) * t
    const sampleCurveY = (t: number) => (((1 - 3 * y2 + 3 * y1) * t + (3 * y2 - 6 * y1)) * t + 3 * y1) * t
    const sampleCurveDerivativeX = (t: number) => (3 * (1 - 3 * x2 + 3 * x1) * t + 2 * (3 * x2 - 6 * x1)) * t + 3 * x1

    function solveCurveX(x: number): number {
        let t = x
        for (let i = 0; i < 8; i++) {
            const currentX = sampleCurveX(t) - x
            if (Math.abs(currentX) < 1e-7) return t
            const derivative = sampleCurveDerivativeX(t)
            if (Math.abs(derivative) < 1e-7) break
            t -= currentX / derivative
        }
        // 回退到二分法
        let lo = 0, hi = 1
        t = x
        while (lo < hi) {
            const mid = sampleCurveX(t)
            if (Math.abs(mid - x) < 1e-7) return t
            if (x > mid) lo = t
            else hi = t
            t = (lo + hi) / 2
        }
        return t
    }

    return (x: number) => sampleCurveY(solveCurveX(x))
}
