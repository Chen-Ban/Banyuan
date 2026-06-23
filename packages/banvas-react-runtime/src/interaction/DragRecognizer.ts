/**
 * DragRecognizer —— 从原子指针事件序列中识别拖拽手势
 *
 * 消费 InteractionInput 中的 pointerdown/pointermove/pointerup/pointercancel，
 * 当移动距离超过阈值时识别为拖拽，派发对应 IViewEvents 事件键。
 *
 * 设计原则：
 *   - 纯逻辑，无 DOM 依赖，只消费 InteractionInput
 *   - 通过 emit 回调通知上层（与 InteractionRecognizer 基类一致）
 *   - 支持多指针（按 pointerId 隔离状态）
 *   - pointercancel 时安全收尾（不产生 onDragEnd）
 */

import type {
    PointerDownInput,
    PointerMoveInput,
    PointerUpInput,
    PointerCancelInput,
    Point3,
} from "@banyuan/banvasgl";
import { InteractionRecognizer, type RecognizedInteraction } from "./InteractionRecognizer.js";

// ════════════════════════════════════════════
//  配置
// ════════════════════════════════════════════

export interface DragRecognizerOptions {
    /**
     * 拖拽激活阈值（像素），默认 4
     *
     * 只有移动距离超过此值才认为是拖拽（避免手指抖动误触）。
     */
    threshold?: number;
}

// ════════════════════════════════════════════
//  内部状态
// ════════════════════════════════════════════

interface PointerState {
    startClientX: number;
    startClientY: number;
    pointerId: number;
    isDragging: boolean;
}

// ════════════════════════════════════════════
//  DragRecognizer 实现
// ════════════════════════════════════════════

export class DragRecognizer extends InteractionRecognizer {
    private readonly _threshold: number;
    private _pointers: Map<number, PointerState> = new Map();

    constructor(
        emit: (r: RecognizedInteraction) => void,
        options?: DragRecognizerOptions,
    ) {
        super(emit);
        this._threshold = options?.threshold ?? 4;
    }

    onPointerDown(clientX: number, clientY: number, button: number): void {
        // DragRecognizer 只关心主按钮拖拽（button=0）
        if (button !== 0) return;

        // 用一个虚拟 pointerId（单指模式），后续可扩展
        const pointerId = 1;
        this._pointers.set(pointerId, {
            startClientX: clientX,
            startClientY: clientY,
            pointerId,
            isDragging: false,
        });
    }

    onPointerMove(clientX: number, clientY: number): void {
        const pointerId = 1;
        const state = this._pointers.get(pointerId);
        if (!state) return;

        const dx = clientX - state.startClientX;
        const dy = clientY - state.startClientY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (!state.isDragging) {
            if (distance < this._threshold) return;

            // 激活拖拽
            state.isDragging = true;
            this.emit({
                eventKey: "onDragStart",
                clientX,
                clientY,
            });
            return;
        }

        // 持续拖拽
        this.emit({
            eventKey: "onDrag",
            clientX,
            clientY,
            payload: { deltaX: dx, deltaY: dy },
        });
    }

    onPointerUp(clientX: number, clientY: number): void {
        const pointerId = 1;
        const state = this._pointers.get(pointerId);
        if (!state) return;

        this._pointers.delete(pointerId);

        if (state.isDragging) {
            this.emit({
                eventKey: "onDragEnd",
                clientX,
                clientY,
            });
        }
    }

    /**
     * 送入 pointercancel：安全收尾，不派发 onDragEnd
     * （系统取消不代表用户意图完成拖拽）
     */
    onPointerCancel(): void {
        const pointerId = 1;
        const state = this._pointers.get(pointerId);
        if (!state) return;
        this._pointers.delete(pointerId);
        // 不 emit onDragEnd —— cancel 不产生「正常完成」语义
    }

    reset(): void {
        this._pointers.clear();
    }

    /** 查询是否正在拖拽 */
    get isDragging(): boolean {
        for (const state of this._pointers.values()) {
            if (state.isDragging) return true;
        }
        return false;
    }
}
