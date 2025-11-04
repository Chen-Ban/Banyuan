import { Matrix4, Point3, View } from "../core";
export const event2Point = (e: MouseEvent): Point3 => {
  return new Point3(e.offsetX, e.offsetY, 0);
};

export const world2Relative = (p: Point3, matrix: Matrix4): Point3 => {
  return matrix.inverse().multiply(p);
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
