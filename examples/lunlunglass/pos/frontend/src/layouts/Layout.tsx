import { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import styles from './Layout.module.scss'

interface LayoutProps {
  children: ReactNode
}

const Layout = ({ children }: LayoutProps) => {
  const location = useLocation()

  return (
    <div className={styles.layout}>
      <header className={styles.layoutHeader}>
        <h1>LunLunGlass POS</h1>
        <nav className={styles.layoutNav}>
          <Link to="/" className={`${styles.navLink} ${location.pathname === '/' ? styles.active : ''}`}>
            首页
          </Link>
          <Link to="/list" className={`${styles.navLink} ${location.pathname === '/list' ? styles.active : ''}`}>
            列表
          </Link>
        </nav>
      </header>
      <main className={styles.layoutMain}>
        {children}
      </main>
      <footer className={styles.layoutFooter}>
        <p>&copy; 2024 LunLunGlass POS. All rights reserved.</p>
      </footer>
    </div>
  )
}

export default Layout
