import { useState, useEffect, useRef, useCallback } from 'react'
import UserCard from '@/pages/List/components/UserCard'
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

  // 模拟获取用户数据
  const fetchUsers = useCallback(async (pageNum: number, reset: boolean = false) => {
    setLoading(true)
    
    // 模拟API调用
    await new Promise(resolve => setTimeout(resolve, 500))
    
    // 模拟数据
    const pageSize = 12 // 每页12个，一排4个，共3排
    const mockUsers: User[] = Array.from({ length: pageSize }, (_, i) => {
      const index = (pageNum - 1) * pageSize + i + 1
      return {
        id: `user_${index}`,
        userId: `user_${index}`,
        username: `用户${index}`,
        email: `user${index}@example.com`,
        phone: `138${String(index).padStart(8, '0')}`,
        createdAt: new Date().toISOString(),
      }
    })

    const filteredUsers = mockUsers.filter(user => {
      const matchesUsername = !filters.username || user.username.includes(filters.username)
      const matchesUserId = !filters.userId || user.userId.includes(filters.userId)
      const matchesEmail = !filters.email || user.email?.includes(filters.email)
      const matchesPhone = !filters.phone || user.phone?.includes(filters.phone)
      return matchesUsername && matchesUserId && matchesEmail && matchesPhone
    })

    if (reset) {
      setUsers(filteredUsers)
      setPage(2)
    } else {
      setUsers(prev => [...prev, ...filteredUsers])
      setPage(prev => prev + 1)
    }

    // 模拟没有更多数据（假设总共100个用户）
    const totalUsers = (pageNum - 1) * pageSize + pageSize
    setHasMore(totalUsers < 100)
    setLoading(false)
  }, [filters])

  // 初始化加载
  useEffect(() => {
    setUsers([])
    setPage(1)
    setHasMore(true)
    fetchUsers(1, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.username, filters.userId, filters.email, filters.phone])

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
          <UserCard key={user.id} user={user} />
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

