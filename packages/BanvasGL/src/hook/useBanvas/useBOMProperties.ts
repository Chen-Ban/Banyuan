import { useEffect, useState } from "react";

/**
 * BOM 属性接口，包含所有会影响绘制的浏览器对象模型属性
 */
export interface BOMProperties {
  /** 设备像素比 */
  dpr: number;
}

/**
 * 监听 BOM 变化，返回影响绘制的属性
 * @returns BOM 属性对象
 */
export function useBOMProperties(): BOMProperties {
  const [dpr, setDpr] = useState<number>(() => (typeof window !== "undefined" ? window.devicePixelRatio ?? 1 : 1));

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateDpr = () => {
      const newDpr = window.devicePixelRatio ?? 1;
      setDpr(newDpr);
    };

    // 监听 change 事件（设备像素比可能在窗口变化时改变）
    window.addEventListener("change", updateDpr);

    return () => {
      window.removeEventListener("change", updateDpr);
    };
  }, []);

  return { dpr };
}
