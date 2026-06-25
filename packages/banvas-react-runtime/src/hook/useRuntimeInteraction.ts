/**
 * useRuntimeInteraction — 运行策略层核心 hook
 *
 * 职责：
 *   1. 通过 EventAdapter 接收平台无关的 InteractionInput
 *   2. 喂给识别器（Click / Drag / 未来更多），识别出 RecognizedInteraction
 *   3. hitTest 找目标 View → 读取 view.events[eventKey] → 通过 actions.view.triggerEvent 派发
 *
 * 运行态专属：编辑态不装配此 hook。
 *
 * 跨平台设计：
 *   - hook 本身不监听 DOM 事件，由外部传入的 EventAdapter 负责
 *   - 不同平台（Web / Electron / Native）只需换 adapter，hook 逻辑不变
 */

import { useEffect, useRef } from "react";
import type { IBanvasActions, InteractionInput } from "@banyuan/banvasgl";
import { screenToWorld } from "@banyuan/banvasgl-react";
import type { EventAdapter } from "../adapters/types.js";
import { ClickRecognizer } from "../interaction/ClickRecognizer.js";
import { DragRecognizer } from "../interaction/DragRecognizer.js";
import type { RecognizedInteraction } from "../interaction/InteractionRecognizer.js";

export interface UseRuntimeInteractionOptions {
    /** 平台事件适配器（由上层根据平台选择创建） */
    adapter: EventAdapter | null;
    /** banvas actions（提供 hitTest / triggerEvent 等能力） */
    actions: IBanvasActions | null;
    /** canvas DOM 节点（供坐标转换使用） */
    canvas: HTMLCanvasElement | null;
}

export function useRuntimeInteraction(
    options: UseRuntimeInteractionOptions,
): void {
    const { adapter, actions, canvas } = options;
    const actionsRef = useRef(actions);
    actionsRef.current = actions;
    const canvasRef = useRef(canvas);
    canvasRef.current = canvas;

    useEffect(() => {
        if (!adapter || !actions) return;

        // 识别器 emit 回调：hitTest + triggerEvent
        const handleRecognized = (r: RecognizedInteraction) => {
            const currentActions = actionsRef.current;
            const currentCanvas = canvasRef.current;
            if (!currentActions || !currentCanvas) return;

            const worldPoint = screenToWorld(r.clientX, r.clientY, currentActions.app.getCurrentScene()!, currentCanvas);
            const hit = currentActions.view.hitTest(worldPoint);
            if (!hit.view) return;

            // 找到目标 View，触发对应事件
            currentActions.view.triggerEvent(hit.view.id, r.eventKey);
        };

        // 实例化识别器
        const clickRecognizer = new ClickRecognizer(handleRecognized);
        const dragRecognizer = new DragRecognizer(handleRecognized);

        // 处理适配器传入的原子事件
        const onInput = (input: InteractionInput) => {
            switch (input.type) {
                case "pointerdown":
                    clickRecognizer.onPointerDown(input.clientX, input.clientY, input.button ?? 0);
                    dragRecognizer.onPointerDown(input.clientX, input.clientY, input.button ?? 0);
                    break;
                case "pointermove":
                    clickRecognizer.onPointerMove(input.clientX, input.clientY);
                    dragRecognizer.onPointerMove(input.clientX, input.clientY);
                    break;
                case "pointerup":
                    clickRecognizer.onPointerUp(input.clientX, input.clientY);
                    dragRecognizer.onPointerUp(input.clientX, input.clientY);
                    break;
                case "pointercancel":
                    clickRecognizer.reset();
                    dragRecognizer.onPointerCancel();
                    break;
                // 其他事件类型暂不派发给识别器，后续按需扩展
                default:
                    break;
            }
        };

        adapter.attach(onInput);

        return () => {
            adapter.detach();
            clickRecognizer.reset();
            dragRecognizer.reset();
        };
    }, [adapter, actions]);
}
