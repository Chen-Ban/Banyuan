import { createBrowserRouter, RouteObject } from 'react-router-dom'
import RootLayout from '@/layouts/RootLayout'
import HomePage from '@/pages/HomePage'
import ApplicationListPage from '@/pages/ApplicationListPage'
import SettingsPage from '@/pages/SettingsPage'
import ApplicationLayout from '@/layouts/ApplicationLayout'

const routes: RouteObject[] = [
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'applications', element: <ApplicationListPage /> },
      { path: 'settings', element: <SettingsPage /> },
      // 应用详情：KeepAlive 模式，ApplicationLayout 内部直接渲染三个子页面
      {
        path: 'application/:id/*',
        element: <ApplicationLayout />,
      },
    ],
  },
]

export const router = createBrowserRouter(routes)
