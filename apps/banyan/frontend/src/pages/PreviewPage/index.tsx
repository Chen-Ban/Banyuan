/**
 * PreviewPage — 预览态页面
 *
 * 职责：
 *   - 启动本地 Preview Server（通过 Electron IPC）
 *   - 使用 useCanvasInit 渲染运行态画布（flowEnabled: true）
 *   - 通过设置 app.backendEndpoint 指向本地 Preview Server，
 *     使 callFlow 节点的 HTTP 请求自动打到本地后端
 *
 * 核心原理：
 *   前端 FlowSchema 中调用云函数通过 callFlow 节点实现，
 *   callFlow 执行器读取 ctx.env.callFlow，而该函数由 Scene.triggerSchema
 *   根据 app.backendEndpoint 自动注入。所以预览态只需设上 endpoint 就行。
 *
 * 生命周期：
 *   mount → startPreviewServer → 获取 url → 设置 app.backendEndpoint
 *   unmount → 清除 endpoint + stopPreviewServer
 */

import { useEffect, useMemo, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { App, Spin } from "antd";
import {
  CheckCircleOutlined,
  LoadingOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";
import { useCanvasInit } from "@banyuan/banvasgl/react";
import type { UseCanvasOptions } from "@banyuan/banvasgl/react";
import {
  startPreviewServer,
  stopPreviewServer,
  isElectron,
} from "@/api/previewServer";
import type { PreviewServerInfo } from "@/api/previewServer";
import { applicationApi, schemaApi, cloudFunctionApi } from "@/api";
import { getErrorMessage } from "@/utils/error";
import styles from "./index.module.scss";

const PreviewPage: React.FC = () => {
  const { message } = App.useApp();
  const { id: applicationId } = useParams<{ id: string }>();

  // ── 状态 ───────────────────────────────────────────────────────────────────
  const [appJSON, setAppJSON] = useState<string>("");
  const [serverInfo, setServerInfo] = useState<PreviewServerInfo | null>(null);
  const [serverStatus, setServerStatus] = useState<
    "idle" | "starting" | "running" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
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
  }, [applicationId]);

  // ── 画布初始化（运行态：flowEnabled = true） ────────────────────────────────
  const canvasOptions: UseCanvasOptions = useMemo(
    () => ({
      width: 1280,
      height: 800,
      appOptions: { flowEnabled: true },
      rendererOptions: { clearColor: "#fff" },
    }),
    [],
  );

  const { elements, actions } = useCanvasInit(loaded ? appJSON : "", canvasOptions);

  // ── 启动 Preview Server + 设置 backendEndpoint ────────────────────────────
  useEffect(() => {
    if (!applicationId || !loaded || !actions) return;

    if (!isElectron()) {
      // 非 Electron 环境：降级模式，后端节点不执行（callFlow 为 undefined）
      setServerStatus("running");
      return;
    }

    let cancelled = false;
    setServerStatus("starting");

    const boot = async () => {
      try {
        const [schemaRes, functionsRes] = await Promise.all([
          schemaApi.fetchSchema(applicationId),
          cloudFunctionApi.listFunctions(applicationId),
        ]);

        if (cancelled) return;

        const info = await startPreviewServer({
          appId: applicationId,
          appJSON: appJSON ? JSON.parse(appJSON) : {},
          collectionSchemas: schemaRes.data?.collections || [],
          cloudFunctions: functionsRes.data || [],
        });

        if (cancelled) return;
        setServerInfo(info);
        setServerStatus("running");

        // 设置 backendEndpoint → callFlow 自动指向本地 Preview Server
        actions.app.setBackendEndpoint(info.url);
      } catch (err: unknown) {
        if (cancelled) return;
        setServerStatus("error");
        setErrorMessage(getErrorMessage(err));
        message.error(`Preview Server 启动失败: ${getErrorMessage(err)}`);
      }
    };

    boot();

    return () => {
      cancelled = true;
      // 清除 endpoint，防止退出预览态后 callFlow 仍指向已停止的服务
      actions.app.setBackendEndpoint(undefined);
      if (isElectron() && applicationId) {
        stopPreviewServer(applicationId).catch(() => {});
      }
    };
  }, [applicationId, loaded, appJSON, actions]);

  // cleanup ref
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ── 状态指示 ───────────────────────────────────────────────────────────────
  const renderStatusBadge = () => {
    switch (serverStatus) {
      case "starting":
        return (
          <span className={styles.statusBadge}>
            <LoadingOutlined spin />
            <span>正在启动本地服务...</span>
          </span>
        );
      case "running":
        return (
          <span className={`${styles.statusBadge} ${styles.statusRunning}`}>
            <CheckCircleOutlined />
            <span>
              预览运行中
              {serverInfo ? ` (${serverInfo.url})` : " (前端模式)"}
            </span>
          </span>
        );
      case "error":
        return (
          <span className={`${styles.statusBadge} ${styles.statusError}`}>
            <ExclamationCircleOutlined />
            <span>{errorMessage || "服务启动失败"}</span>
          </span>
        );
      default:
        return null;
    }
  };

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
        <div className={styles.statusBar}>{renderStatusBadge()}</div>
        {elements.container}
      </div>
    </div>
  );
};

export default PreviewPage;
