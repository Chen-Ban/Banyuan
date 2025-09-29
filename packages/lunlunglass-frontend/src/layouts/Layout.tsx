import { ReactNode } from 'react'
import './Layout.css'

interface LayoutProps {
  children: ReactNode
}

const Layout = ({ children }: LayoutProps) => {
  return (
    <div className="layout">
      <header className="layout-header">
        <h1>LunLunGlass</h1>
        <nav className="layout-nav">
          <a href="/" className="nav-link">首页</a>
          <a href="/template" className="nav-link">模板</a>
        </nav>
      </header>
      <main className="layout-main">
        {children}
      </main>
      <footer className="layout-footer">
        <p>&copy; 2024 LunLunGlass. All rights reserved.</p>
      </footer>
    </div>
  )
}

export default Layout
