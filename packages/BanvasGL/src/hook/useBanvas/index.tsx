import React, { useMemo, useRef } from "react";
import { useCanvasInit } from "./useCanvasInit";
import { useCanvasEvents } from "./useCanvasEvents";
import { useInputEvents } from "./useInputEvents";
import { useBOMProperties } from "./useBOMProperties";
import type { UseBanvasOptions, UseBanvasResult, SerializedSceneJSON } from "./types";

export default function useBanvas(
  serializedScenes: SerializedSceneJSON[] = [],
  _options: UseBanvasOptions = {}
): UseBanvasResult {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // 获取 BOM 属性
  const { dpr } = useBOMProperties();

  // Canvas 初始化
  const { app, canvasRef } = useCanvasInit(serializedScenes, _options, dpr);

  // Canvas 事件绑定
  useCanvasEvents({
    app,
    canvasRef,
    inputRef,
  });

  // Input 事件绑定
  useInputEvents({
    app,
    inputRef,
  });

  const canvasEl = useMemo(
    () => (
      <div
        ref={containerRef}
        style={{
          position: "relative",
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            display: "block",
          }}
        />
        <input
          ref={inputRef}
          type="text"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 100,
            height: 20,
            border: "1px solid #000",
          }}
        />
      </div>
    ),
    []
  );

  return { Banvas: canvasEl, app };
}
