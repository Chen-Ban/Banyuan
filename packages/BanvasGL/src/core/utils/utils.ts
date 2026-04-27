import { VIEWTYPE } from "@/core/constants";
import { View } from "../views";
import { isCombinedView } from '@/core/interfaces';

// 查找方法
function findByType(view: View, type: VIEWTYPE): View[] {
  const results: View[] = [];

  if (view.type === type) {
    results.push(view);
  }
  if (isCombinedView(view)) {
    results.push(...view.children.map((v) => findByType(v, type)).flat());
  }

  return results;
}

function findChildById(view: View, id: string): View | null {
  let result: View | null = null;
  if (view.id === id) {
    return view;
  }
  if (isCombinedView(view)) {
    result = view.children.filter((v) => findChildById(v, id))[0];
  }
  return result;
}

export { findByType, findChildById };
