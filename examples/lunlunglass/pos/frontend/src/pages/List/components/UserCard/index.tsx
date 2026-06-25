import { useNavigate } from 'react-router-dom'
import { Button } from 'antd'
import { EditOutlined } from '@ant-design/icons'
import type { User } from '@/types'
import styles from './index.module.scss'

interface UserCardProps {
  user: User
}

const UserCard = ({ user }: UserCardProps) => {
  const navigate = useNavigate()

  const getInitials = (name: string) => {
    return name.charAt(0).toUpperCase()
  }

  const handleEdit = () => {
    navigate(`/user/${user.userId}`)
  }

  return (
    <div className={styles.userCard}>
      <div className={styles.userCardHeader}>
        <div className={styles.userAvatar}>
          {user.avatar ? (
            <img src={user.avatar} alt={user.username} />
          ) : (
            <span className={styles.avatarInitials}>{getInitials(user.username)}</span>
          )}
        </div>
        <div className={styles.userInfo}>
          <h3 className={styles.userName}>{user.username}</h3>
          <p className={styles.userId}>ID: {user.userId}</p>
        </div>
      </div>
      <div className={styles.userCardBody}>
        {user.email && (
          <div className={styles.userDetail}>
            <span className={styles.detailLabel}>邮箱:</span>
            <span className={styles.detailValue}>{user.email}</span>
          </div>
        )}
        {user.phone && (
          <div className={styles.userDetail}>
            <span className={styles.detailLabel}>电话:</span>
            <span className={styles.detailValue}>{user.phone}</span>
          </div>
        )}
        {user.createdAt && (
          <div className={styles.userDetail}>
            <span className={styles.detailLabel}>注册时间:</span>
            <span className={styles.detailValue}>{new Date(user.createdAt).toLocaleDateString()}</span>
          </div>
        )}
      </div>
      <div className={styles.userCardActions}>
        <Button type="primary" icon={<EditOutlined />} onClick={handleEdit} size="small">
          编辑
        </Button>
      </div>
    </div>
  )
}

export default UserCard
