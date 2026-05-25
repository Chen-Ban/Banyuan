import { createBrowserRouter, RouteObject } from 'react-router-dom'
import HomePage from '@/pages/HomePage'
import ApplicationListPage from '@/pages/ApplicationListPage'
import ApplicationLayout from '@/layouts/ApplicationLayout'
import UIPage from '@/pages/UIPage'
import DatabasePage from '@/pages/DatabasePage'
import FunctionsPage from '@/pages/FunctionsPage'

const routes: RouteObject[] = [
  {
    path: '/',
    element: <HomePage />,
  },
  {
    path: '/applications',
    element: <ApplicationListPage />,
  },
  // 应用详情：三个子页面共用 ApplicationLayout
  {
    path: '/application/:id',
    element: <ApplicationLayout />,
    children: [
      { path: 'ui', element: <UIPage /> },
      { path: 'database', element: <DatabasePage /> },
      { path: 'functions', element: <FunctionsPage /> },
    ],
  },
]

export const router = createBrowserRouter(routes)
