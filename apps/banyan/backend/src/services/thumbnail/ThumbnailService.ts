/**
 * ThumbnailService — 服务端缩略图生成
 *
 * 使用 node-canvas + BanvasGL 引擎实例化 uiJSON，
 * 渲染首帧并导出为 WebP Buffer。
 *
 * 封面生成为 best-effort：失败不阻塞主流程。
 */

import { App, OrthographicCamera } from "@banyuan/banvasgl";
import { NodePlatformCanvas } from "./NodePlatformCanvas.js";

/** 封面画布尺寸 */
const COVER_WIDTH = 1280;
const COVER_HEIGHT = 800;

/**
 * 从 uiJSON 生成封面图片（WebP Buffer）
 *
 * @param uiJSON - App.serialize() 产出的 JSON 字符串
 * @returns WebP Buffer，失败返回 null
 */
export async function generateCover(uiJSON: string): Promise<Buffer | null> {
  try {
    // 创建 node-canvas 并包装为平台接口
    const platform = new NodePlatformCanvas(COVER_WIDTH, COVER_HEIGHT, {
      clearColor: "#ffffff",
      backgroundColor: "#ffffff",
    });
    const mainCtx = platform.getMainContext();
    const bufferCtx = platform.getBufferContext();

    // 通过平台无关工厂创建 App（flowEnabled: false，缩略图无需流程执行）
    const app = App.create(
      platform,
      mainCtx,
      bufferCtx,
      { flowEnabled: false, enablePageStack: false },
      { clearColor: "#ffffff" },
    );

    // 从 JSON 恢复应用状态
    app.initFromSerialized(uiJSON);

    // 获取 designSize 并同步画布 + camera bounds
    const { width: dw, height: dh } = app.getDesignSize();
    app.handleResize(dw, dh);

    const scene = app.getCurrentScene();
    if (scene) {
      if (scene.camera instanceof OrthographicCamera) {
        scene.camera.setBounds(0, dw, dh, 0);
      }
      scene.markDirty();
    }

    // 渲染当前场景
    const renderer = app.getRenderer();
    if (renderer && scene) {
      renderer.render(scene);
    }

    // 导出为 WebP Buffer
    const buffer = platform.toWebPBuffer(85);

    // 清理
    platform.destroy();

    return buffer;
  } catch (err) {
    console.warn("[ThumbnailService] 封面生成失败:", err instanceof Error ? err.message : String(err));
    return null;
  }
}
