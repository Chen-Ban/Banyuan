import { useRoutes, RouteObject } from 'react-router-dom'
import HomePage from "@/pages/index"
import ListPage from "@/pages/List"
import OrderPage from "@/pages/OrderPage"
import UserPage from "@/pages/UserPage"

const routes: RouteObject[] = [
  {
    path: '/',
    element: <HomePage />,
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
