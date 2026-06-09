/**
 * Web 平台事件适配器
 *
 * 监听 HTMLElement 上的原生 DOM 事件（PointerEvent / KeyboardEvent / WheelEvent / FocusEvent / CompositionEvent），
 * 规范化为 banvasgl 的 InteractionInput 后回调上层。
 *
 * 适用于：
 *   - 用户应用运行在浏览器中（包括 Electron renderer 进程的 Web 视图）
 *   - Canvas 元素或其他可交互 DOM 元素
 *
 * 设计决策：
 *   - 优先使用 PointerEvent API（W3C 标准，统一 mouse/touch/pen）
 *   - Wheel 事件统一标准化为像素单位（处理 deltaMode 差异）
 *   - keyboard 绑定到 window（全局快捷键语义）
 *   - 不做手势识别，严格 1:1 翻译
 */

import type {
    InteractionInput,
    PointerDownInput,
    PointerMoveInput,
    PointerUpInput,
    PointerCancelInput,
    PointerEnterInput,
    PointerLeaveInput,
    KeyDownInput,
    KeyUpInput,
    WheelInput,
    FocusInput,
    BlurInput,
    CompositionStartInput,
    CompositionUpdateInput,
    CompositionEndInput,
    Point3,
} from "@banyuan/banvasgl";
import type { EventAdapter, CoordinateTransform, EventAdapterOptions } from "./types.js";

// ════════════════════════════════════════════
//  Web 适配器选项
// ════════════════════════════════════════════

export interface WebEventAdapterOptions extends EventAdapterOptions {
    /** 要监听指针/滚轮/焦点事件的 DOM 元素（通常是 canvas） */
    element: HTMLElement;
    /**
     * 键盘事件监听目标，默认 window
     *
     * 运行态一般绑定 window（全局快捷键）；
     * 若需限定作用域可传入特定元素。
     */
    keyboardTarget?: EventTarget;
    /**
     * IME 输入框元素（用于 composition 事件），可选
     *
     * 运行态若无文本编辑场景可不传。
     */
    compositionElement?: HTMLElement;
    /**
     * 当前聚焦 View ID 的获取函数（用于 focus/blur/composition 事件的 targetId）
     */
    getFocusedViewId?: () => string | undefined;
}

// ════════════════════════════════════════════
//  Web 适配器实现
// ════════════════════════════════════════════

export class WebEventAdapter implements EventAdapter {
    private _element: HTMLElement;
    private _keyboardTarget: EventTarget;
    private _compositionElement: HTMLElement | null;
    private _getFocusedViewId: () => string | undefined;
    private _toWorld: CoordinateTransform;
    private _onInput: ((input: InteractionInput) => void) | null = null;
    private _cleanup: (() => void) | null = null;

    constructor(options: WebEventAdapterOptions) {
        this._element = options.element;
        this._keyboardTarget = options.keyboardTarget ?? window;
        this._compositionElement = options.compositionElement ?? null;
        this._getFocusedViewId = options.getFocusedViewId ?? (() => undefined);
        this._toWorld = options.coordinateTransform;
    }

    // ── EventAdapter 接口实现 ──

    attach(onInput: (input: InteractionInput) => void): void {
        this._onInput = onInput;
        this._bindEvents();
    }

    detach(): void {
        this._cleanup?.();
        this._cleanup = null;
        this._onInput = null;
    }

    setCoordinateTransform(transform: CoordinateTransform): void {
        this._toWorld = transform;
    }

    // ── 内部：事件绑定 ──

    private _bindEvents(): void {
        const el = this._element;
        const emit = (input: InteractionInput) => this._onInput?.(input);

        // ── 指针事件 ──

        const onPointerDown = (e: PointerEvent) => {
            const worldPoint = this._toWorld(e.clientX, e.clientY);
            emit({
                type: "pointerdown",
                worldPoint,
                clientX: e.clientX,
                clientY: e.clientY,
                pointerId: e.pointerId,
                pointerType: e.pointerType as "mouse" | "touch" | "pen",
                pressure: e.pressure,
                tiltX: e.tiltX,
                tiltY: e.tiltY,
                button: e.button,
            } satisfies PointerDownInput);
        };

        const onPointerMove = (e: PointerEvent) => {
            const worldPoint = this._toWorld(e.clientX, e.clientY);
            emit({
                type: "pointermove",
                worldPoint,
                clientX: e.clientX,
                clientY: e.clientY,
                pointerId: e.pointerId,
                pointerType: e.pointerType as "mouse" | "touch" | "pen",
                pressure: e.pressure,
                tiltX: e.tiltX,
                tiltY: e.tiltY,
            } satisfies PointerMoveInput);
        };

        const onPointerUp = (e: PointerEvent) => {
            const worldPoint = this._toWorld(e.clientX, e.clientY);
            emit({
                type: "pointerup",
                worldPoint,
                clientX: e.clientX,
                clientY: e.clientY,
                pointerId: e.pointerId,
                pointerType: e.pointerType as "mouse" | "touch" | "pen",
                pressure: e.pressure,
                tiltX: e.tiltX,
                tiltY: e.tiltY,
            } satisfies PointerUpInput);
        };

        const onPointerCancel = (e: PointerEvent) => {
            const worldPoint = this._toWorld(e.clientX, e.clientY);
            emit({
                type: "pointercancel",
                worldPoint,
                clientX: e.clientX,
                clientY: e.clientY,
                pointerId: e.pointerId,
                pointerType: e.pointerType as "mouse" | "touch" | "pen",
                pressure: e.pressure,
                tiltX: e.tiltX,
                tiltY: e.tiltY,
            } satisfies PointerCancelInput);
        };

        const onPointerEnter = (e: PointerEvent) => {
            const worldPoint = this._toWorld(e.clientX, e.clientY);
            emit({
                type: "pointerenter",
                worldPoint,
                clientX: e.clientX,
                clientY: e.clientY,
                pointerId: e.pointerId,
                pointerType: e.pointerType as "mouse" | "touch" | "pen",
                pressure: e.pressure,
                tiltX: e.tiltX,
                tiltY: e.tiltY,
            } satisfies PointerEnterInput);
        };

        const onPointerLeave = (e: PointerEvent) => {
            const worldPoint = this._toWorld(e.clientX, e.clientY);
            emit({
                type: "pointerleave",
                worldPoint,
                clientX: e.clientX,
                clientY: e.clientY,
                pointerId: e.pointerId,
                pointerType: e.pointerType as "mouse" | "touch" | "pen",
                pressure: e.pressure,
                tiltX: e.tiltX,
                tiltY: e.tiltY,
            } satisfies PointerLeaveInput);
        };

        // ── 键盘事件 ──

        const onKeyDown = (e: Event) => {
            const ke = e as KeyboardEvent;
            emit({
                type: "keydown",
                code: ke.code,
                repeat: ke.repeat,
                ctrlKey: ke.ctrlKey,
                metaKey: ke.metaKey,
                shiftKey: ke.shiftKey,
                altKey: ke.altKey,
            } satisfies KeyDownInput);
        };

        const onKeyUp = (e: Event) => {
            const ke = e as KeyboardEvent;
            emit({
                type: "keyup",
                code: ke.code,
                ctrlKey: ke.ctrlKey,
                metaKey: ke.metaKey,
                shiftKey: ke.shiftKey,
                altKey: ke.altKey,
            } satisfies KeyUpInput);
        };

        // ── 滚轮事件 ──

        const onWheel = (e: WheelEvent) => {
            const worldPoint = this._toWorld(e.clientX, e.clientY);

            // deltaMode 标准化为像素
            let deltaX = e.deltaX;
            let deltaY = e.deltaY;
            let deltaZ = e.deltaZ;

            if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) {
                deltaX *= 40;
                deltaY *= 40;
                deltaZ *= 40;
            } else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
                deltaX *= 800;
                deltaY *= 800;
                deltaZ *= 800;
            }

            emit({
                type: "wheel",
                worldPoint,
                clientX: e.clientX,
                clientY: e.clientY,
                deltaX,
                deltaY,
                deltaZ: deltaZ || undefined,
                ctrlKey: e.ctrlKey,
                metaKey: e.metaKey,
                shiftKey: e.shiftKey,
                altKey: e.altKey,
            } satisfies WheelInput);
        };

        // ── 焦点事件 ──

        const onFocus = () => {
            const targetId = this._getFocusedViewId();
            if (!targetId) return;
            emit({
                type: "focus",
                targetId,
            } satisfies FocusInput);
        };

        const onBlur = () => {
            const targetId = this._getFocusedViewId();
            if (!targetId) return;
            emit({
                type: "blur",
                targetId,
            } satisfies BlurInput);
        };

        // ── IME 组合事件 ──

        const onCompositionStart = () => {
            const targetId = this._getFocusedViewId();
            if (!targetId) return;
            emit({
                type: "compositionstart",
                targetId,
            } satisfies CompositionStartInput);
        };

        const onCompositionUpdate = (e: Event) => {
            const targetId = this._getFocusedViewId();
            if (!targetId) return;
            emit({
                type: "compositionupdate",
                targetId,
                data: (e as CompositionEvent).data,
            } satisfies CompositionUpdateInput);
        };

        const onCompositionEnd = (e: Event) => {
            const targetId = this._getFocusedViewId();
            if (!targetId) return;
            emit({
                type: "compositionend",
                targetId,
                data: (e as CompositionEvent).data,
            } satisfies CompositionEndInput);
        };

        // ── 注册监听器 ──

        el.addEventListener("pointerdown", onPointerDown);
        el.addEventListener("pointermove", onPointerMove);
        el.addEventListener("pointerup", onPointerUp);
        el.addEventListener("pointercancel", onPointerCancel);
        el.addEventListener("pointerenter", onPointerEnter);
        el.addEventListener("pointerleave", onPointerLeave);
        el.addEventListener("wheel", onWheel, { passive: true });
        el.addEventListener("focus", onFocus);
        el.addEventListener("blur", onBlur);

        this._keyboardTarget.addEventListener("keydown", onKeyDown);
        this._keyboardTarget.addEventListener("keyup", onKeyUp);

        const compEl = this._compositionElement;
        if (compEl) {
            compEl.addEventListener("compositionstart", onCompositionStart);
            compEl.addEventListener("compositionupdate", onCompositionUpdate);
            compEl.addEventListener("compositionend", onCompositionEnd);
        }

        // ── 清理函数 ──

        this._cleanup = () => {
            el.removeEventListener("pointerdown", onPointerDown);
            el.removeEventListener("pointermove", onPointerMove);
            el.removeEventListener("pointerup", onPointerUp);
            el.removeEventListener("pointercancel", onPointerCancel);
            el.removeEventListener("pointerenter", onPointerEnter);
            el.removeEventListener("pointerleave", onPointerLeave);
            el.removeEventListener("wheel", onWheel);
            el.removeEventListener("focus", onFocus);
            el.removeEventListener("blur", onBlur);

            this._keyboardTarget.removeEventListener("keydown", onKeyDown);
            this._keyboardTarget.removeEventListener("keyup", onKeyUp);

            if (compEl) {
                compEl.removeEventListener("compositionstart", onCompositionStart);
                compEl.removeEventListener("compositionupdate", onCompositionUpdate);
                compEl.removeEventListener("compositionend", onCompositionEnd);
            }
        };
    }
}

// ════════════════════════════════════════════
//  工厂函数
// ════════════════════════════════════════════

/**
 * 创建 Web 平台事件适配器
 */
export function createWebEventAdapter(options: WebEventAdapterOptions): EventAdapter {
    return new WebEventAdapter(options);
}
