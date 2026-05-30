/**
 * PlanApprovalCard — 方案确认卡片
 *
 * 当 AI 完成规划后，humanGate 暂停执行，展示此卡片让用户确认：
 *   - 展示方案描述和任务列表
 *   - 「确认执行」按钮 → resume({ approved: true })，继续执行
 *   - 「取消」按钮 → 显示输入框，用户补充修改说明后提交
 *     → resume({ approved: false, feedback })，humanGate 将反馈追加到 messages，路由回 plan 重新规划
 */

import { useState } from 'react'
import { Button, Input, Typography } from 'antd'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  RocketOutlined,
  SendOutlined,
} from '@ant-design/icons'
import type { PlanApprovalState } from '@/hooks/useXiangDi'
import styles from './index.module.scss'

const { Text, Paragraph } = Typography
const { TextArea } = Input

export interface PlanApprovalCardProps {
  plan: PlanApprovalState
  onApprove: () => void
  onReject: (feedback: string) => void
  disabled?: boolean
}

const PlanApprovalCard: React.FC<PlanApprovalCardProps> = ({
  plan,
  onApprove,
  onReject,
  disabled = false,
}) => {
  const [showFeedback, setShowFeedback] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleApprove = () => {
    setSubmitting(true)
    onApprove()
  }

  const handleReject = () => {
    if (!feedback.trim()) return
    setSubmitting(true)
    onReject(feedback.trim())
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleReject()
    }
  }

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <RocketOutlined className={styles.headerIcon} />
        <Text strong className={styles.headerText}>方案确认</Text>
      </div>

      <Paragraph className={styles.description}>
        {plan.planDescription || plan.intentSummary}
      </Paragraph>

      {plan.tasks.length > 0 && (
        <div className={styles.taskList}>
          {plan.tasks.map((task, index) => (
            <div key={task.taskId} className={styles.taskItem}>
              <span className={styles.taskIndex}>{index + 1}</span>
              <Text className={styles.taskDesc}>{task.description}</Text>
            </div>
          ))}
        </div>
      )}

      {!showFeedback ? (
        <div className={styles.actions}>
          <Button
            type="primary"
            icon={<CheckCircleOutlined />}
            onClick={handleApprove}
            loading={submitting}
            disabled={disabled || submitting}
            className={styles.approveBtn}
          >
            确认执行
          </Button>
          <Button
            icon={<CloseCircleOutlined />}
            onClick={() => setShowFeedback(true)}
            disabled={disabled || submitting}
            danger
          >
            取消
          </Button>
        </div>
      ) : (
        <div className={styles.feedbackArea}>
          <Text type="secondary" className={styles.feedbackHint}>
            请补充修改说明，AI 将根据您的反馈重新规划方案
          </Text>
          <div className={styles.feedbackInputRow}>
            <TextArea
              placeholder="描述您希望如何调整方案..."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              onKeyDown={handleKeyDown}
              autoSize={{ minRows: 2, maxRows: 4 }}
              disabled={submitting}
              className={styles.feedbackInput}
              autoFocus
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleReject}
              loading={submitting}
              disabled={!feedback.trim() || submitting}
              className={styles.feedbackSendBtn}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default PlanApprovalCard
