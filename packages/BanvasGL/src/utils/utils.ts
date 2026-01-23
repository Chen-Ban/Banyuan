import { Matrix4, Point3, View } from "../core";
export const event2Point = (e: MouseEvent): Point3 => {
  const ratio = window.devicePixelRatio;
  const { offsetX, offsetY } = e;
  return new Point3(offsetX * ratio, offsetY * ratio, 0);
};

export const tree2List = (views: View[]): View[] => {
  const res: View[] = [];

  const travels = (view: View): void => {
    // 添加当前节点到结果列表
    res.push(view);

    // 如果有子节点，递归遍历
    if (view.children.length > 0) {
      for (const child of view.children) {
        travels(child);
      }
    }
  };

  // 遍历所有根节点
  for (const view of views) {
    travels(view);
  }

  return res.sort((a, b) => b.layer - a.layer);
};

export const debounce = (fn: Function, delay: number) => {
  let timer: number | null = null;
  return (...args: any[]) => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      fn(...args);
    }, delay);
  };
};
