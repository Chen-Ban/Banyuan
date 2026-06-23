/**
 * 单击识别器
 *
 * 策略：pointerdown + pointerup 在同一位置（位移 < 10px），且无长时间按压。
 * 本方案只实现 click，doubleclick / contextmenu 留作后续子任务。
 */

import { InteractionRecognizer, type RecognizedInteraction } from "./InteractionRecognizer.js";

const CLICK_THRESHOLD = 10; // 像素

export class ClickRecognizer extends InteractionRecognizer {
  private _downX = 0;
  private _downY = 0;
  private _isDown = false;
  private _button = 0;

  onPointerDown(clientX: number, clientY: number, button: number): void {
    this._downX = clientX;
    this._downY = clientY;
    this._isDown = true;
    this._button = button;
  }

  onPointerMove(clientX: number, clientY: number): void {
    if (!this._isDown) return;
    // 如果移动超过阈值，取消 click 识别
    const dx = clientX - this._downX;
    const dy = clientY - this._downY;
    if (Math.sqrt(dx * dx + dy * dy) > CLICK_THRESHOLD) {
      this._isDown = false;
    }
  }

  onPointerUp(clientX: number, clientY: number): void {
    if (!this._isDown) return;
    this._isDown = false;

    const dx = clientX - this._downX;
    const dy = clientY - this._downY;
    if (Math.sqrt(dx * dx + dy * dy) <= CLICK_THRESHOLD) {
      // 右键 → onContextMenu，左键/中键 → onClick
      const eventKey = this._button === 2 ? "onContextMenu" : "onClick";
      this.emit({
        eventKey,
        clientX,
        clientY,
      } satisfies RecognizedInteraction);
    }
  }

  reset(): void {
    this._isDown = false;
  }
}
