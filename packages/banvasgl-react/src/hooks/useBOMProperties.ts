/**
 * useBOMProperties — 浏览器 DPR（devicePixelRatio）监听 Hook
 *
 * 监听 window.devicePixelRatio 变化，适用于高分屏/外接显示器切换。
 *
 * 返回：
 * - dpr    state，用作 useEffect dep 触发 DPR 变化时的响应式重渲染
 * - dprRef ref，  供 Effect 内部获取最新值但不作为依赖
 */
import { useEffect, useRef, useState } from "react";

export function useBOMProperties(): { dpr: number; dprRef: React.MutableRefObject<number> } {
  const dprRef = useRef<number>(
    typeof window !== "undefined" ? (window.devicePixelRatio ?? 1) : 1,
  );
  const [dpr, setDpr] = useState<number>(dprRef.current);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let mql: MediaQueryList | null = null;

    const listen = () => {
      const currentDpr = window.devicePixelRatio ?? 1;
      dprRef.current = currentDpr;
      setDpr(currentDpr);
      mql?.removeEventListener("change", listen);
      mql = window.matchMedia(`(resolution: ${currentDpr}dppx)`);
      mql.addEventListener("change", listen);
    };

    listen();

    return () => {
      mql?.removeEventListener("change", listen);
    };
  }, []);

  return { dpr, dprRef };
}
