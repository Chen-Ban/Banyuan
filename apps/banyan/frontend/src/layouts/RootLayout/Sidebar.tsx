/**
 * Sidebar — 左侧导航栏
 *
 * 顶部信息栏为左右结构：左侧品牌 Logo，右侧用户信息
 * 用户信息展示逻辑：
 *   - 首页/列表页 + 已登录：信息栏不显示用户信息，导航项上方插入用户卡片
 *   - 首页/列表页 + 未登录：信息栏右侧显示 Sign in / Sign up
 *   - 其他页面 + 已登录：信息栏右侧显示用户头像（点击下拉切换）
 *   - 其他页面 + 未登录：信息栏右侧显示 Sign in / Sign up
 *
 * 下方根据 mode 渲染不同的内容：
 *   - nav：导航菜单（首页/列表/设置）
 *   - settings：设置项列表
 *   - app：AiBar 单例（由 AppLayoutCtx.aiBarNode 提供，ApplicationLayout 持有）
 */

import { useCallback, useState } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { App, Avatar, Dropdown, Input, Modal } from "antd";
import type { MenuProps } from "antd";
import {
  HomeOutlined,
  AppstoreOutlined,
  SettingOutlined,
  UserOutlined,
  LogoutOutlined,
  DownOutlined,
  DeleteOutlined,
  EditOutlined,
  SwapOutlined,
  GithubOutlined,
} from "@ant-design/icons";
import { useAuth } from "@/hooks/useAuth";
import { applicationApi } from "@/api";
import type { Application } from "@/api";
import { useRootLayoutCtx, type SidebarMode } from "./RootLayoutCtx";
import styles from "./Sidebar.module.scss";

// ─── 工具函数 ────────────────────────────────────────────────────────────────────

function getInitial(username: string): string {
  return username.charAt(0).toUpperCase();
}

// ─── Props ──────────────────────────────────────────────────────────────────────

interface SidebarProps {
  mode: SidebarMode;
}

// ─── 组件 ────────────────────────────────────────────────────────────────────────

const Sidebar: React.FC<SidebarProps> = ({ mode }) => {
  const navigate = useNavigate();
  const { user, loading: authLoading, logout, openLoginModal } = useAuth();

  // 是否为首页/列表页模式
  const isNavMode = mode === "nav";

  // ── 信息栏（左右结构：左侧面包屑，右侧用户信息） ────────────────────────────────

  const renderInfoBar = () => {
    return (
      <div className={styles.infoBar}>
        {/* 左侧：Logo / 页面标题 面包屑 */}
        <div className={styles.infoBarLeft}>
          <button className={styles.brandLink} onClick={() => navigate("/")}>
            <span className={styles.brandLogo}>Banyan</span>
          </button>

          {mode !== "nav" && (
            <>
              <span className={styles.breadcrumbSep}>/</span>
              {renderPageTitle()}
            </>
          )}
        </div>

        {/* 右侧：用户信息 */}
        <div className={styles.infoBarRight}>{renderInfoBarUser()}</div>
      </div>
    );
  };

  // ── 页面标题（面包屑中的一段） ────────────────────────────────────────────────

  const renderPageTitle = () => {
    if (mode === "settings") {
      return <span className={styles.pageTitle}>设置</span>;
    }
    if (mode === "app") {
      return <AppBreadcrumb />;
    }
    return null;
  };

  // ── 信息栏右侧用户信息 ────────────────────────────────────────────────────────

  const renderInfoBarUser = () => {
    if (authLoading) return null;

    // 首页/列表页 + 已登录：不在信息栏显示用户信息（用户卡片在导航区上方）
    if (isNavMode && user) return null;

    // 未登录：显示 Sign in 按钮
    if (!user) {
      return (
        <div className={styles.authActions}>
          <button className={styles.signUpBtn} onClick={openLoginModal}>
            Sign in
          </button>
        </div>
      );
    }

    // 其他页面 + 已登录：显示用户头像 + 下拉菜单
    const menuItems: MenuProps["items"] = [
      {
        key: "username",
        label: user.username,
        disabled: true,
        style: { color: "rgba(255,255,255,0.6)", cursor: "default" },
      },
      { type: "divider" },
      {
        key: "logout",
        icon: <LogoutOutlined />,
        label: "退出登录",
        onClick: () => logout(),
        danger: true,
      },
    ];

    return (
      <Dropdown
        menu={{ items: menuItems }}
        trigger={["click"]}
        placement="bottomRight"
      >
        <button className={styles.avatarBtn}>
          <Avatar size={24} className={styles.userAvatar}>
            {getInitial(user.username)}
          </Avatar>
        </button>
      </Dropdown>
    );
  };

  // ── 用户卡片（仅首页/列表页 + 已登录时显示） ──────────────────────────────────

  const renderUserCard = () => {
    if (!isNavMode || !user || authLoading) return null;

    const menuItems: MenuProps["items"] = [
      {
        key: "logout",
        icon: <LogoutOutlined />,
        label: "退出登录",
        onClick: () => logout(),
        danger: true,
      },
    ];

    return (
      <Dropdown
        menu={{ items: menuItems }}
        trigger={["click"]}
        placement="bottomLeft"
      >
        <div className={styles.userCard}>
          <Avatar size={28} className={styles.userCardAvatar}>
            {getInitial(user.username)}
          </Avatar>
          <div className={styles.userCardInfo}>
            <span className={styles.userCardName}>{user.username}</span>
          </div>
          <DownOutlined className={styles.userCardArrow} />
        </div>
      </Dropdown>
    );
  };

  // ── 内容区 ──────────────────────────────────────────────────────────────────

  const renderContent = () => {
    if (mode === "nav") {
      return <NavMenu />;
    }
    if (mode === "settings") {
      return <SettingsNav />;
    }
    // app 模式：直接渲染 ApplicationLayout 持有的 AiBar 单例节点
    return <AppAiBar />;
  };

  return (
    <div className={styles.sidebar}>
      {renderInfoBar()}
      <div className={mode === "app" ? styles.appContent : styles.navContent}>
        {renderUserCard()}
        {renderContent()}
      </div>
      {mode !== "app" && (
        <div className={styles.bottomSection}>
          <a
            className={styles.githubLink}
            href="https://github.com/Chen-Ban/Banyuan"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
          >
            <GithubOutlined />
          </a>
        </div>
      )}
    </div>
  );
};

// ─── 子组件：导航菜单 ────────────────────────────────────────────────────────────

const NavMenu: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const items = [
    { key: "/", label: "首页", icon: <HomeOutlined /> },
    { key: "/applications", label: "应用列表", icon: <AppstoreOutlined /> },
    { key: "/settings", label: "设置", icon: <SettingOutlined /> },
  ];

  return (
    <>
      {items.map((item) => {
        const isActive = location.pathname === item.key;
        return (
          <button
            key={item.key}
            className={`${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
            onClick={() => navigate(item.key)}
          >
            <span className={styles.navIcon}>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        );
      })}
    </>
  );
};

// ─── 子组件：设置项列表（复用 navItem 样式，保持一致） ──────────────────────────────

const SettingsNav: React.FC = () => {
  const [activeKey, setActiveKey] = useState("general");

  const settingsItems = [
    { key: "general", label: "通用设置", icon: <SettingOutlined /> },
    { key: "account", label: "账户设置", icon: <UserOutlined /> },
  ];

  return (
    <>
      {settingsItems.map((item) => (
        <button
          key={item.key}
          className={`${styles.navItem} ${activeKey === item.key ? styles.navItemActive : ""}`}
          onClick={() => setActiveKey(item.key)}
        >
          <span className={styles.navIcon}>{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </>
  );
};

// ─── 子组件：应用面包屑（含下拉菜单：重命名 / 切换应用 / 删除） ──────────────────

const AppBreadcrumb: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const currentAppId = params.id ?? "";

  // 从 RootLayoutCtx 读取应用名（ApplicationLayout 写入）
  const { appName: rootAppName, setAppName } = useRootLayoutCtx();
  const appName = rootAppName || "未命名应用";

  // ── 重命名弹窗 ──
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  const handleRename = useCallback(() => {
    setRenameValue(appName);
    setRenameOpen(true);
  }, [appName]);

  const handleRenameConfirm = useCallback(async () => {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      message.warning("应用名称不能为空");
      return;
    }
    try {
      await applicationApi.updateApplication(currentAppId, { name: trimmed });
      setAppName(trimmed);
      setRenameOpen(false);
      message.success("已重命名");
    } catch {
      message.error("重命名失败");
    }
  }, [renameValue, currentAppId, setAppName]);

  // ── 删除应用 ──
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteInputValue, setDeleteInputValue] = useState("");
  const [deleting, setDeleting] = useState(false);

  const deleteConfirmMatch = deleteInputValue.trim() === appName;

  const handleDelete = useCallback(() => {
    setDeleteInputValue("");
    setDeleteOpen(true);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteConfirmMatch) return;
    setDeleting(true);
    try {
      await applicationApi.deleteApplication(currentAppId);
      message.success("应用已删除");
      setDeleteOpen(false);
      navigate("/");
    } catch {
      message.error("删除失败");
    } finally {
      setDeleting(false);
    }
  }, [deleteConfirmMatch, currentAppId, navigate]);

  // ── 切换应用子菜单 ──
  const [appList, setAppList] = useState<Application[]>([]);

  const loadAppList = useCallback(() => {
    applicationApi
      .fetchApplications()
      .then((res) => {
        setAppList(res.data?.applications ?? []);
      })
      .catch(() => {});
  }, []);

  const switchItems: MenuProps["items"] = appList
    .filter((a) => a.application_id !== currentAppId)
    .map((a) => ({
      key: a.application_id,
      label: a.name || "未命名应用",
      onClick: () => navigate(`/application/${a.application_id}/ui`),
    }));

  const menuItems: MenuProps["items"] = [
    {
      key: "rename",
      icon: <EditOutlined />,
      label: "重命名",
      onClick: handleRename,
    },
    {
      key: "switch",
      icon: <SwapOutlined />,
      label: "切换应用",
      children:
        switchItems.length > 0
          ? switchItems
          : [{ key: "empty", label: "暂无其他应用", disabled: true }],
    },
    { type: "divider" },
    {
      key: "delete",
      icon: <DeleteOutlined />,
      label: "删除应用",
      danger: true,
      onClick: handleDelete,
    },
  ];

  return (
    <>
      <Dropdown
        menu={{ items: menuItems }}
        trigger={["click"]}
        onOpenChange={(open) => {
          if (open) loadAppList();
        }}
      >
        <button className={styles.appNameBtn}>
          <span className={styles.appNameText}>{appName}</span>
          <DownOutlined style={{ fontSize: 10 }} />
        </button>
      </Dropdown>

      <Modal
        title="重命名应用"
        open={renameOpen}
        onOk={handleRenameConfirm}
        onCancel={() => setRenameOpen(false)}
        okText="确定"
        cancelText="取消"
        centered
        destroyOnHidden
      >
        <Input
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onPressEnter={handleRenameConfirm}
          placeholder="输入新的应用名称"
          autoFocus
        />
      </Modal>

      <Modal
        title="删除应用"
        open={deleteOpen}
        onOk={handleDeleteConfirm}
        onCancel={() => setDeleteOpen(false)}
        okText="删除此应用"
        okType="danger"
        okButtonProps={{ loading: deleting, disabled: !deleteConfirmMatch }}
        cancelText="取消"
        centered
        destroyOnHidden
      >
        <p style={{ marginBottom: 12 }}>
          此操作<strong>不可撤销</strong>，将永久删除应用及其所有数据。
        </p>
        <p style={{ marginBottom: 8 }}>
          请输入 <strong>{appName}</strong> 以确认删除：
        </p>
        <Input
          value={deleteInputValue}
          onChange={(e) => setDeleteInputValue(e.target.value)}
          onPressEnter={handleDeleteConfirm}
          placeholder={appName}
          autoFocus
        />
      </Modal>
    </>
  );
};

// ─── 子组件：app 模式 AiBar 容器（从 RootLayoutCtx 取单例节点） ──────────────────

const AppAiBar: React.FC = () => {
  const { aiBarNode } = useRootLayoutCtx();
  return <>{aiBarNode}</>;
};

export default Sidebar;
