import { useRoutes, RouteObject } from 'react-router-dom'
import ApplicationList from '@/pages/ApplicationList'
import ApplicationLayout from '@/pages/ApplicationLayout'
import ApplicationDetail from '@/pages/ApplicationDetail'
import DatabasePage from '@/pages/DatabasePage'
import FunctionsPage from '@/pages/FunctionsPage'

const routes: RouteObject[] = [
  {
    path: '/',
    element: <ApplicationList />,
  },
  // 新建应用：也走 Layout，但 Layout 内部检测 isNew 时不渲染 Tab / AiBar
  {
    path: '/application/new',
    element: <ApplicationLayout />,
    children: [
      { index: true, element: <ApplicationDetail /> },
    ],
  },
  // 已有应用：三个子页面共用 ApplicationLayout
  {
    path: '/application/:id',
    element: <ApplicationLayout />,
    children: [
      { index: true, element: <ApplicationDetail /> },
      { path: 'database', element: <DatabasePage /> },
      { path: 'functions', element: <FunctionsPage /> },
    ],
  },
]

export function AppRoutes() {
  const element = useRoutes(routes)
  return element
}
