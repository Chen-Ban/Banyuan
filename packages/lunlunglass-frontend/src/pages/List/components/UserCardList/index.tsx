import { useState, useEffect, useRef, useCallback } from 'react'
import { message } from 'antd'
import UserCard from '@/pages/List/components/UserCard'
import { userApi } from '@/api'
import { getErrorMessage } from '@/utils/error'
import type { User, UserFilters } from '@/types'
import styles from './index.module.scss'

interface UserCardListProps {
  filters: UserFilters
}

const UserCardList = ({ filters }: UserCardListProps) => {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [page, setPage] = useState(1)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const loadingRef = useRef<HTMLDivElement | null>(null)

  const pageSize = 12

  // 获取用户数据
  const fetchUsers = useCallback(async (pageNum: number, reset: boolean = false) => {
    setLoading(true)
    try {
      const res = await userApi.fetchUsers(pageNum, pageSize, filters)
      const { users: newUsers, total } = res.data

      if (reset) {
        setUsers(newUsers)
        setPage(2)
      } else {
        setUsers(prev => [...prev, ...newUsers])
        setPage(prev => prev + 1)
      }

      const loadedCount = reset ? newUsers.length : (pageNum - 1) * pageSize + newUsers.length
      setHasMore(loadedCount < total)
    } catch (error: unknown) {
      message.error(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [filters])

  // 初始化加载
  useEffect(() => {
    setUsers([])
    setPage(1)
    setHasMore(true)
    fetchUsers(1, true)
  }, [filters.username, filters.userId, filters.email, filters.phone, fetchUsers])

  // 无限滚动
  useEffect(() => {
    if (!hasMore || loading) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading) {
          fetchUsers(page)
        }
      },
      { threshold: 0.1 }
    )

    if (loadingRef.current) {
      observer.observe(loadingRef.current)
    }

    observerRef.current = observer

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [page, hasMore, loading, fetchUsers])

  return (
    <div className={styles.userCardList}>
      <div className={styles.userCardGrid}>
        {users.map((user) => (
          <UserCard key={user.userId} user={user} />
        ))}
      </div>
      {loading && (
        <div className={styles.loadingIndicator}>加载中...</div>
      )}
      {!hasMore && users.length > 0 && (
        <div className={styles.noMoreIndicator}>没有更多数据了</div>
      )}
      <div ref={loadingRef} className={styles.scrollTrigger} />
    </div>
  )
}

export default UserCardList
