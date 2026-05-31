/**
 * DisambiguationPanel — 消歧卡片
 *
 * 当 AI 检测到用户意图存在歧义时展示：
 *   - 标题：「需要进一步确认」
 *   - 歧义内容描述
 *   - 推荐的多种方案选项（点击后直接发送，走 resume { approved: false, feedback }）
 *   - 底部提示：用户自定义其他方案请在下方输入框中描述
 *   - 输入框 + 发送按钮
 *
 * 无论是点击推荐方案还是自行输入，都是将消歧内容追加到当前对话，
 * 通过 resume({ approved: false, feedback }) 通知 humanGate，
 * humanGate 将反馈结构化追加到 messages 后路由回 plan 重新规划。
 */

import { useState } from 'react'
import { Button, Input, Typography } from 'antd'
import { QuestionCircleOutlined, SendOutlined } from '@ant-design/icons'
import type { DisambiguationOptions } from '@/api'
import styles from './index.module.scss'

const { Text, Paragraph } = Typography
const { TextArea } = Input

export interface DisambiguationPanelProps {
  options: DisambiguationOptions
  onSelect: (feedback: string) => void
}

const DisambiguationPanel: React.FC<DisambiguationPanelProps> = ({ options, onSelect }) => {
  const [customInput, setCustomInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const handleOptionClick = (optionDesc: string, optionId: string) => {
    setSelectedId(optionId)
    setSubmitting(true)
    onSelect(optionDesc)
  }

  const handleCustomSend = () => {
    if (!customInput.trim()) return
    setSubmitting(true)
    onSelect(customInput.trim())
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleCustomSend()
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <QuestionCircleOutlined className={styles.headerIcon} />
        <Text strong className={styles.headerText}>需要进一步确认</Text>
      </div>

      <Paragraph className={styles.context}>
        {options.conflictContext}
      </Paragraph>

      <div className={styles.optionList}>
        {options.options.map((option) => (
          <button
            key={option.id}
            className={`${styles.optionBtn} ${selectedId === option.id ? styles.optionBtnSelected : ''}`}
            onClick={() => handleOptionClick(option.description, option.id)}
            disabled={submitting}
          >
            <span className={styles.optionDesc}>{option.description}</span>
            {option.expectedEffect && (
              <span className={styles.optionEffect}>{option.expectedEffect}</span>
            )}
          </button>
        ))}
      </div>

      <div className={styles.customArea}>
        <Text type="secondary" className={styles.customHint}>
          以上方案都不合适？请在下方输入您的想法
        </Text>
        <div className={styles.customInputRow}>
          <TextArea
            placeholder="描述您想要的方案..."
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={handleKeyDown}
            autoSize={{ minRows: 1, maxRows: 3 }}
            disabled={submitting}
            className={styles.customInput}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleCustomSend}
            disabled={!customInput.trim() || submitting}
            className={styles.customSendBtn}
          />
        </div>
      </div>
    </div>
  )
}

export default DisambiguationPanel
