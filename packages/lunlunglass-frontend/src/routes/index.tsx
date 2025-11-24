import { useRoutes, RouteObject } from 'react-router-dom'
import TemplateList from "@/pages/TemplateList"
import TemplateDetail from "@/pages/TemplateDetail"
import HomePage from "@/pages/index"
import ListPage from "@/pages/List"
import OrderPage from "@/pages/OrderPage"
import UserPage from "@/pages/UserPage"

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <HomePage />,
  },
  {
    path: '/template',
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
  {
    path: '/list',
    element: <ListPage />,
  },
  {
    path: '/order',
    element: <OrderPage />,
  },
  {
    path: '/order/:id',
    element: <OrderPage />,
  },
  {
    path: '/user',
    element: <UserPage />,
  },
  {
    path: '/user/:id',
    element: <UserPage />,
  },
]

export function AppRoutes() {
  const element = useRoutes(routes)
  return element
}

