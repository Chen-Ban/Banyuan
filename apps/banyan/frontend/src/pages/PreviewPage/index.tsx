/**
 * PreviewPage — 预览态页面
 *
 * 职责：
 *   - 使用 useCanvasInit 渲染运行态画布（flowEnabled: true）
 *   - 从 PreviewServerCtx 读取本地 Preview Server 地址，
 *     设置 app.backendEndpoint 使 callFlow 节点打到本地后端
 *
 * 核心原理：
 *   前端 FlowSchema 中调用云函数通过 callFlow 节点实现，
 *   callFlow 执行器读取 ctx.env.callFlow，而该函数由 Scene.triggerSchema
 *   根据 app.backendEndpoint 自动注入。所以预览态只需设上 endpoint 就行。
 *
 * 生命周期：
 *   mount → 从 ctx 读取 serverInfo.url → 设置 app.backendEndpoint
 *   unmount → 清除 endpoint（Preview Server 由 ApplicationLayout 管理，不在此停止）
 */

import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { App, Spin } from "antd";
import { useFixedCanvasInit } from "@banyuan/banvasgl/react";
import { applicationApi } from "@/api";
import { getErrorMessage } from "@/utils/error";
import { useApplicationStore } from "@/stores/applicationStore";
import { usePreviewServerCtx } from "@/layouts/ApplicationLayout/PreviewServerCtx";
import styles from "./index.module.scss";

const PreviewPage: React.FC = () => {
  const { message } = App.useApp();
  const { id: applicationId } = useParams<{ id: string }>();
  const { registerActions, setDesignSize, designSize } = useApplicationStore();
  const { serverInfo, status: serverStatus } = usePreviewServerCtx();

  // ── 状态 ───────────────────────────────────────────────────────────────────
  const [appJSON, setAppJSON] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const mountedRef = useRef(true);

  // ── 加载 appJSON ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!applicationId) return;
    applicationApi
      .fetchApplication(applicationId)
      .then((res) => {
        if (!mountedRef.current) return;
        setAppJSON(res.data!.appJSON || "");
        setLoaded(true);
      })
      .catch((err: unknown) => {
        if (!mountedRef.current) return;
        message.error(getErrorMessage(err));
        setLoaded(true);
      });
  }, [applicationId, message]);

  // ── 画布初始化（运行态：固定模式，flowEnabled = true） ────────────────────
  const { elements, actions } = useFixedCanvasInit({
    width: designSize.width,
    height: designSize.height,
    appJSON: loaded ? appJSON : "",
    appOptions: { flowEnabled: true },
    rendererOptions: { clearColor: "#fff" },
  });

  // ── 挂载画布引擎实例到 store + 同步初始 designSize ────────────────────
  useEffect(() => {
    if (!actions?.app) return;
    const unregister = registerActions(actions);
    // appJSON 加载后同步引擎当前 designSize 到 store
    const ds = actions.app.getDesignSize();
    setDesignSize({ width: ds.width, height: ds.height });
    return unregister;
  }, [registerActions, setDesignSize, actions]);

  // ── 设置 backendEndpoint（指向 Preview Server） ─────────────────────────────
  useEffect(() => {
    if (!actions?.app) return;

    if (serverInfo && serverStatus === "running") {
      actions.app.setBackendEndpoint(serverInfo.url);
    }

    return () => {
      // 退出预览态时清除 endpoint，防止其他页面误用
      actions.app.setBackendEndpoint(undefined);
    };
  }, [actions, serverInfo, serverStatus]);

  // cleanup ref
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ── 加载中 ─────────────────────────────────────────────────────────────────
  if (!loaded) {
    return (
      <div className={styles.loadingContainer}>
        <Spin size="large" tip="加载应用数据..." />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.canvasContainer}>
        {elements.container}
      </div>
    </div>
  );
};

export default PreviewPage;
