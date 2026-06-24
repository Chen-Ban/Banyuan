/**
 * ApplicationLayout
 *
 * 应用级嵌套路由容器，子页面通过 React Router Outlet 渲染：
 *
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │  ← 返回    [ ▶预览 | ✏编辑 ]  [ 数据库 ]  [ 云函数 ]    💾  🚀  │
 *   ├──────────────────────────────────────────────────────────────────┤
 *   │                                                                  │
 *   │   <Outlet />  （预览 / 画布 / 数据库 / 云函数 子页面内容）       │
 *   │                                                                  │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * 职责：
 *   - 加载并管理应用元数据（名称），写入 applicationStore 供各处读取
 *   - 编排保存（handleSave）操作，渲染 <AppHeader/> 顶部栏
 *   - Tab 导航通过 React Router navigate 切换子路由
 *   - 画布位置是 Segmented（预览 | 编辑），对应 /preview 和 /ui 两个子路由
 *   - 数据库和云函数是独立子路由（/database、/functions）
 *   - 管理 PreviewServer 生命周期（应用级）
 *
 * 所有共享状态通过 useApplicationStore 读写。
 */

import React, { useCallback, useEffect } from "react";
import { useParams, Outlet } from "react-router-dom";
import { App, Spin } from "antd";
import { applicationApi } from "@/api";
import { getErrorMessage } from "@/utils/error";
import { useApplicationStore } from "@/stores/applicationStore";
import { usePreviewServerStore } from "@/stores/previewServerStore";
import AppHeader from "./components/AppHeader";
import styles from "./index.module.scss";

const ApplicationLayout: React.FC = () => {
  const { id: application_id } = useParams<{ id: string }>();
  const { message } = App.useApp();

  // ── ApplicationStore ────────────────────────────────────────────────────────
  const {
    isSaving,
    dataLoading,
    setAppName,
    reset: resetStore,
    load: loadStore,
  } = useApplicationStore();

  // ── 加载应用元数据 + 业务数据 ─────────────────────────────────────────────
  useEffect(() => {
    if (!application_id) return;
    // 切换应用时重置 store

    resetStore();
    usePreviewServerStore.getState().reset();

    // 加载应用元数据（名称）
    applicationApi
      .fetchApplication(application_id)
      .then((res) => {
        setAppName(res.data!.name);
      })
      .catch((err) => {
        message.error(getErrorMessage(err));
      });

    // 加载业务数据（uiJSON/dataSchema/cloudFunctions）到 store
    loadStore(application_id);
  }, [application_id, setAppName, resetStore, loadStore]);

  // ── Preview Server 生命周期管理（应用级） ─────────────────────────────────
  useEffect(() => {
    if (!application_id) return;
    const store = usePreviewServerStore.getState();
    store.start(application_id);
    return () => {
      store.stop(application_id);
    };
  }, [application_id]);

  // ── 保存应用 ──────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    const result = await useApplicationStore.getState().save()
    if (result.success) {
      message.success(result.saved.length > 0 ? "已保存" : "没有需要保存的更改")
    } else if (result.error !== 'ALREADY_SAVING') {
      message.error(result.error || "保存失败")
    }
  }, [message]);

  return (
    <div className={styles.layout}>
      <AppHeader onSave={handleSave} />

      {/* ── 加载中或子页面内容 ── */}
      <div className={styles.content}>
        {dataLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <Spin size="large" description="加载应用数据..." />
          </div>
        ) : (
          <Outlet />
        )}
      </div>

      {/* ── 保存遮罩层：阻止所有交互 ── */}
      {isSaving && (
        <div className={styles.savingOverlay}>
          <Spin size="large" />
          <span className={styles.savingText}>正在保存…</span>
        </div>
      )}
    </div>
  );
};

export default ApplicationLayout;
