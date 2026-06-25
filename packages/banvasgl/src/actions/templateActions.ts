/**
 * Template 级别操作
 *
 * 提供模板序列化/实例化能力。
 * Material（物料） = ITemplate + IMeta（元信息）。
 */

import type { App } from "@/engine/App";
import type {
  ITemplate,
  ITemplateSerializeConfig,
} from "@/types/template/template.js";
import { serializeTemplate as _serialize, instantiateTemplate as _instantiate } from "@/engine/serialization/template/Serializer.js";

/**
 * 将视图子树序列化为模板
 */
export function serialize(
  getApp: () => App | null,
  viewId: string,
  config: ITemplateSerializeConfig,
): ITemplate | null {
  const scene = getApp()?.getCurrentScene() ?? null;
  return _serialize(scene, viewId, config);
}

/**
 * 将模板实例化为视图并添加到当前场景
 *
 * @returns 新创建的根视图 ID，失败返回 null
 */
export function instantiate(
  getApp: () => App | null,
  template: ITemplate,
  position: { x: number; y: number },
  params?: Record<string, unknown>,
): string | null {
  const app = getApp();
  const scene = app?.getCurrentScene() ?? null;
  return _instantiate(app, scene, template, position, params);
}
