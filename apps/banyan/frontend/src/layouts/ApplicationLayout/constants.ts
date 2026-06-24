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

// ── 设备装饰类型 ──────────────────────────────────────────────────────────────

/** 设备类型，驱动画布装饰（CanvasDecoration）渲染不同设备外观 */
export type DeviceType = 'iphone' | 'android' | 'ipad' | 'android-tablet' | 'mac' | 'windows' | 'foldable';

// ── 机型预设类型 ──────────────────────────────────────────────────────────────

export interface DevicePreset {
  key: string;
  label: string;
  width: number;
  height: number;
  /** 设备类型，用于画布装饰 */
  deviceType: DeviceType;
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
      { key: "1280x800", label: "PC 标准 (1280×800)", width: 1280, height: 800, deviceType: "windows" },
      { key: "1366x768", label: "PC 宽屏 (1366×768)", width: 1366, height: 768, deviceType: "windows" },
      { key: "1920x1080", label: "PC 全高清 (1920×1080)", width: 1920, height: 1080, deviceType: "windows" },
    ],
  },
  {
    group: "Mac",
    icon: DesktopOutlined,
    items: [
      { key: "1440x900", label: "Apple MacBook Air 13\" (M4)", width: 1440, height: 900, deviceType: "mac" },
      { key: "1710x1080", label: "Apple MacBook Air 15\" (M4)", width: 1710, height: 1080, deviceType: "mac" },
      { key: "1512x982", label: "Apple MacBook Pro 14\" (M5)", width: 1512, height: 982, deviceType: "mac" },
      { key: "1728x1117", label: "Apple MacBook Pro 16\" (M5)", width: 1728, height: 1117, deviceType: "mac" },
    ],
  },
  {
    group: "iPad",
    icon: TabletOutlined,
    items: [
      { key: "820x1180", label: "Apple iPad (11th gen)", width: 820, height: 1180, deviceType: "ipad" },
      { key: "744x1133", label: "Apple iPad mini (A17 Pro)", width: 744, height: 1133, deviceType: "ipad" },
      { key: "820x1180-m3", label: "Apple iPad Air 11\" (M3)", width: 820, height: 1180, deviceType: "ipad" },
      { key: "1024x1366-m3", label: "Apple iPad Air 13\" (M3)", width: 1024, height: 1366, deviceType: "ipad" },
      { key: "834x1194", label: "Apple iPad Pro 11\" (M5)", width: 834, height: 1194, deviceType: "ipad" },
      { key: "1024x1366-m5", label: "Apple iPad Pro 13\" (M5)", width: 1024, height: 1366, deviceType: "ipad" },
    ],
  },
  {
    group: "Pad",
    icon: TabletOutlined,
    items: [
      { key: "800x1280", label: "Samsung Galaxy Tab S10", width: 800, height: 1280, deviceType: "android-tablet" },
      { key: "1133x744-pad", label: "小米 Pad 7", width: 1133, height: 744, deviceType: "android-tablet" },
    ],
  },
  {
    group: "iPhone",
    icon: MobileOutlined,
    items: [
      { key: "390x844-se", label: "Apple iPhone 16e", width: 390, height: 844, deviceType: "iphone" },
      { key: "393x852", label: "Apple iPhone 17", width: 393, height: 852, deviceType: "iphone" },
      { key: "402x874-air", label: "Apple iPhone 17 Air", width: 402, height: 874, deviceType: "iphone" },
      { key: "402x874", label: "Apple iPhone 17 Pro", width: 402, height: 874, deviceType: "iphone" },
      { key: "440x956", label: "Apple iPhone 17 Pro Max", width: 440, height: 956, deviceType: "iphone" },
    ],
  },
  {
    group: "Phone",
    icon: MobileOutlined,
    items: [
      { key: "360x780-s26", label: "Samsung Galaxy S26", width: 360, height: 780, deviceType: "android" },
      { key: "412x932", label: "Samsung Galaxy S26 Ultra", width: 412, height: 932, deviceType: "android" },
      { key: "412x915-p10", label: "Google Pixel 10 / 10 Pro", width: 412, height: 915, deviceType: "android" },
      { key: "432x960", label: "Google Pixel 10 Pro XL", width: 432, height: 960, deviceType: "android" },
      { key: "412x905", label: "OnePlus 13", width: 412, height: 905, deviceType: "android" },
      { key: "424x913", label: "华为 Mate 70 Pro", width: 424, height: 913, deviceType: "android" },
      { key: "408x904", label: "华为 Pura 70 Ultra", width: 408, height: 904, deviceType: "android" },
      { key: "393x852-xm17", label: "小米 Xiaomi 17", width: 393, height: 852, deviceType: "android" },
      { key: "432x960-xm", label: "小米 Xiaomi 17 Pro", width: 432, height: 960, deviceType: "android" },
      { key: "432x960-oppo", label: "OPPO Find X9 Pro", width: 432, height: 960, deviceType: "android" },
      { key: "432x960-honor", label: "荣耀 Magic 7 Pro", width: 432, height: 960, deviceType: "android" },
      { key: "420x933", label: "vivo X300 Pro", width: 420, height: 933, deviceType: "android" },
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
