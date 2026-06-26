/**
 * SettingsPage — 设置页布局
 *
 * 仅提供 <Outlet />，子页面由路由决定：
 *   - /settings/general       → GeneralSettings
 *   - /settings/ai-models     → AiModelsSettings
 *   - /settings/appearance    → AppearanceSettings
 *   - /settings/account       → AccountSettings
 *   - /settings/tenant        → TenantSettings
 *   - /settings/notifications → NotificationSettings
 *
 * 左侧导航由全局 Sidebar 的 SettingsNav 负责（含个人设置/工作空间分组）。
 */

import { Outlet } from 'react-router-dom'

const SettingsPage: React.FC = () => {
  return <Outlet />
}

export default SettingsPage
