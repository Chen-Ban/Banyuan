/**
 * ApplicationLayout 常量集中
 *
 * 汇总顶部栏各子组件共用的常量：
 *   - 默认设计尺寸
 *   - 机型预设（分组 + 扁平化）
 *   - 平台图标 / 显示名映射
 *   - 构建状态配置
 *
 * 图标以组件引用（ComponentType）形式存储，由渲染处实例化，
 */

import type { ComponentType, CSSProperties } from "react";
import {
  LaptopOutlined,
  MobileOutlined,
  TabletOutlined,
  GlobalOutlined,
  DesktopOutlined,
  AppleOutlined,
  AndroidOutlined,
  LoadingOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import type { Platform, BuildStatus } from "@/api";

/** Ant Design 图标组件类型 */
export type IconComponent = ComponentType<{
  className?: string;
  style?: CSSProperties;
}>;

// ── 默认设计尺寸 ──────────────────────────────────────────────────────────────

export const DEFAULT_DESIGN_SIZE = { width: 1280, height: 800 };

// ── 机型预设类型 ──────────────────────────────────────────────────────────────

export interface DevicePreset {
  key: string;
  label: string;
  width: number;
  height: number;
}

export interface DeviceGroup {
  group: string;
  icon: IconComponent;
  items: DevicePreset[];
}

// ── 机型预设（分组） ──────────────────────────────────────────────────────────

export const DEVICE_GROUPS: DeviceGroup[] = [
  {
    group: "PC",
    icon: LaptopOutlined,
    items: [
      { key: "1280x800", label: "PC 标准", width: 1280, height: 800 },
      { key: "1366x768", label: "PC 宽屏", width: 1366, height: 768 },
      { key: "1440x900", label: "MacBook", width: 1440, height: 900 },
      { key: "1920x1080", label: "PC 全高清", width: 1920, height: 1080 },
    ],
  },
  {
    group: "iPad",
    icon: TabletOutlined,
    items: [
      { key: "810x1080", label: "iPad 9", width: 810, height: 1080 },
      {
        key: "820x1180",
        label: "iPad Air / iPad 10",
        width: 820,
        height: 1180,
      },
      { key: "1024x1366", label: 'iPad Pro 12.9"', width: 1024, height: 1366 },
    ],
  },
  {
    group: "iPhone",
    icon: MobileOutlined,
    items: [
      { key: "375x667", label: "iPhone SE", width: 375, height: 667 },
      { key: "390x844", label: "iPhone 14", width: 390, height: 844 },
      { key: "393x852", label: "iPhone 15", width: 393, height: 852 },
      { key: "430x932", label: "iPhone 15 Pro Max", width: 430, height: 932 },
    ],
  },
  {
    group: "Android",
    icon: MobileOutlined,
    items: [
      { key: "360x800", label: "小屏 Android", width: 360, height: 800 },
      { key: "412x915", label: "Pixel 8", width: 412, height: 915 },
      { key: "412x891", label: "Galaxy S24 Ultra", width: 412, height: 891 },
    ],
  },
  {
    group: "折叠屏",
    icon: MobileOutlined,
    items: [
      { key: "619x720", label: "Galaxy Z Fold", width: 619, height: 720 },
      { key: "744x1061", label: "三折叠", width: 744, height: 1061 },
    ],
  },
];

/** 扁平化后的所有预设，用于按宽高查找当前选中项 */
export const ALL_DEVICE_PRESETS = DEVICE_GROUPS.flatMap((g) => g.items);

// ── 平台图标映射 ──────────────────────────────────────────────────────────────

export const PLATFORM_ICON_MAP: Record<Platform, IconComponent> = {
  web: GlobalOutlined,
  mac: DesktopOutlined,
  win: DesktopOutlined,
  linux: DesktopOutlined,
  ios: AppleOutlined,
  android: AndroidOutlined,
};

// ── 平台显示名映射 ────────────────────────────────────────────────────────────

export const PLATFORM_LABEL_MAP: Record<Platform, string> = {
  web: "网页",
  mac: "macOS",
  win: "Windows",
  linux: "Linux",
  ios: "iOS",
  android: "Android",
};

// ── 构建状态配置 ──────────────────────────────────────────────────────────────

export const BUILD_STATUS_CONFIG: Record<
  BuildStatus,
  { label: string; icon: IconComponent; color: string }
> = {
  pending: {
    label: "排队中",
    icon: ClockCircleOutlined,
    color: "var(--color-text-tertiary)",
  },
  running: {
    label: "构建中",
    icon: LoadingOutlined,
    color: "var(--color-brand-text)",
  },
  success: {
    label: "已完成",
    icon: CheckCircleOutlined,
    color: "var(--color-success-text)",
  },
  failed: {
    label: "失败",
    icon: CloseCircleOutlined,
    color: "var(--color-error-text)",
  },
};
