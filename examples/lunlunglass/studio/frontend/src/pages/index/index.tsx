import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { templateApi } from '@/api'
import styles from './index.module.scss'

const HomePage = () => {
  const navigate = useNavigate()
  const [templateCount, setTemplateCount] = useState<number | null>(null)

  useEffect(() => {
    templateApi
      .fetchTemplates(1, 1)
      .then((res) => {
        setTemplateCount(res.data.total)
      })
      .catch(() => {
        /* 静默失败 */
      })
  }, [])

  const handleStart = () => {
    navigate('/template')
  }

  return (
    <div className={styles.homePage}>
      <div className={styles.homeContent}>
        {/* 品牌 Logo */}
        <div className={styles.brandLogo}>
          <h1 className={styles.brandName}>LunLunGlass Studio</h1>
          <p className={styles.brandSubtitle}>模板设计系统</p>
        </div>

        {/* 统计信息 */}
        <div className={styles.statsContainer}>
          <div className={styles.statItem}>
            <div className={styles.statValue}>{templateCount !== null ? templateCount : '--'}</div>
            <div className={styles.statLabel}>模板数</div>
          </div>
        </div>

        {/* 开始使用按钮 */}
        <button className={styles.startButton} onClick={handleStart}>
          管理模板
        </button>
      </div>
    </div>
  )
}

export default HomePage
