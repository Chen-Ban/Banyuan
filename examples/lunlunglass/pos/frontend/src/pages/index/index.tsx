import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { userApi, orderApi } from '@/api'
import styles from './index.module.scss'

const HomePage = () => {
  const navigate = useNavigate()
  const [userCount, setUserCount] = useState<number | null>(null)
  const [orderCount, setOrderCount] = useState<number | null>(null)

  useEffect(() => {
    // 加载统计数据
    userApi.fetchUsers(1, 1).then(res => {
      setUserCount(res.data.total)
    }).catch(() => { /* 静默失败 */ })

    orderApi.fetchOrders(1, 1).then(res => {
      setOrderCount(res.data.total)
    }).catch(() => { /* 静默失败 */ })
  }, [])

  const handleStart = () => {
    navigate('/list')
  }

  return (
    <div className={styles.homePage}>
      <div className={styles.homeContent}>
        {/* 品牌 Logo */}
        <div className={styles.brandLogo}>
          <h1 className={styles.brandName}>LunLunGlass</h1>
        </div>

        {/* 统计信息 */}
        <div className={styles.statsContainer}>
          <div className={styles.statItem}>
            <div className={styles.statValue}>{userCount !== null ? userCount : '--'}</div>
            <div className={styles.statLabel}>用户数</div>
          </div>
          <div className={styles.statItem}>
            <div className={styles.statValue}>{orderCount !== null ? orderCount : '--'}</div>
            <div className={styles.statLabel}>配镜数</div>
          </div>
        </div>

        {/* 开始使用按钮 */}
        <button className={styles.startButton} onClick={handleStart}>
          开始使用
        </button>
      </div>
    </div>
  )
}

export default HomePage
