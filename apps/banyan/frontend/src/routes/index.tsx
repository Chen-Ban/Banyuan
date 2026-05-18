import { useRoutes, RouteObject } from 'react-router-dom'
import ApplicationList from "@/pages/ApplicationList"
import ApplicationDetail from "@/pages/ApplicationDetail"
import DatabasePage from "@/pages/DatabasePage"

const routes: RouteObject[] = [
  {
    path: '/',
    element: <ApplicationList />,
  },
  {
    path: '/application/:id',
    element: <ApplicationDetail />,
  },
  {
    path: '/application/new',
    element: <ApplicationDetail />,
  },
  {
    path: '/application/:id/database',
    element: <DatabasePage />,
  },
]

export function AppRoutes() {
  const element = useRoutes(routes)
  return element
}
