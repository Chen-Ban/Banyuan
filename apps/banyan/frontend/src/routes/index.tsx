import { createBrowserRouter, Navigate, RouteObject } from 'react-router-dom'
import RootLayout from '@/layouts/RootLayout'
import HomePage from '@/pages/HomePage'
import ApplicationListPage from '@/pages/ApplicationListPage'
import SettingsPage from '@/pages/SettingsPage'
import GeneralSettings from '@/pages/SettingsPage/GeneralSettings'
import AiModelsSettings from '@/pages/SettingsPage/AiModelsSettings'
import AppearanceSettings from '@/pages/SettingsPage/AppearanceSettings'
import AccountSettings from '@/pages/SettingsPage/AccountSettings'
import TenantSettings from '@/pages/SettingsPage/TenantSettings'
import NotificationSettings from '@/pages/SettingsPage/NotificationSettings'
import ApplicationLayout from '@/layouts/ApplicationLayout'
import ProtectedRoute from '@/components/ProtectedRoute'
import UIPage from '@/pages/UIPage'
import DatabasePage from '@/pages/DatabasePage'
import DataBrowserPage from '@/pages/DataBrowserPage'
import FunctionsPage from '@/pages/FunctionsPage'
import PreviewPage from '@/pages/PreviewPage'

const routes: RouteObject[] = [
  {
    path: '/',
    element: <RootLayout />,
    children: [
      // 首页无需登录
      { index: true, element: <HomePage /> },
      // 以下路由需要登录
      {
        element: <ProtectedRoute />,
        children: [
          { path: 'applications', element: <ApplicationListPage /> },
          // 设置页：子路由模式，左侧导航由 Sidebar SettingsNav 控制
          {
            path: 'settings',
            element: <SettingsPage />,
            children: [
              { index: true, element: <Navigate to="general" replace /> },
              { path: 'general', element: <GeneralSettings /> },
              { path: 'ai-models', element: <AiModelsSettings /> },
              { path: 'appearance', element: <AppearanceSettings /> },
              { path: 'account', element: <AccountSettings /> },
              { path: 'tenant', element: <TenantSettings /> },
              { path: 'notifications', element: <NotificationSettings /> },
            ],
          },
          // 应用详情：Outlet 嵌套路由模式
          {
            path: 'application/:id',
            element: <ApplicationLayout />,
            children: [
              // 默认进入预览态
              { index: true, element: <Navigate to="preview" replace /> },
              { path: 'preview', element: <PreviewPage /> },
              { path: 'ui', element: <UIPage /> },
              { path: 'database', element: <DatabasePage /> },
              { path: 'data-browser', element: <DataBrowserPage /> },
              { path: 'functions', element: <FunctionsPage /> },
            ],
          },
        ],
      },
    ],
  },
]

export const router = createBrowserRouter(routes)
