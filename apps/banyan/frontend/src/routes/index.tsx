import { useRoutes, RouteObject } from 'react-router-dom'
import TemplateList from "@/pages/TemplateList"
import TemplateDetail from "@/pages/TemplateDetail"

const routes: RouteObject[] = [
  {
    path: '/',
    element: <TemplateList />,
  },
  {
    path: '/template/:id',
    element: <TemplateDetail />,
  },
  {
    path: '/template/new',
    element: <TemplateDetail />,
  },
]

export function AppRoutes() {
  const element = useRoutes(routes)
  return element
}
