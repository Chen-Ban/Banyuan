/**
 * DisambiguationPanel 消歧选项面板
 *
 * 当 AI 检测到用户意图冲突时展示，
 * 以卡片式 UI 展示可选方案，用户点选后恢复 AgentLoop 执行。
 */

import { useState } from 'react'
import { Card, Button, Typography } from 'antd'
import { ThunderboltOutlined } from '@ant-design/icons'
import type { DisambiguationOptions } from '@/api'
import styles from './index.module.scss'

const { Text, Paragraph } = Typography

export interface DisambiguationPanelProps {
  options: DisambiguationOptions
  onSelect: (choiceId: string) => void
}

const DisambiguationPanel: React.FC<DisambiguationPanelProps> = ({ options, onSelect }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSelect = (choiceId: string) => {
    setSelectedId(choiceId)
    setSubmitting(true)
    onSelect(choiceId)
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <ThunderboltOutlined className={styles.headerIcon} />
        <Text strong className={styles.headerText}>检测到意图冲突</Text>
      </div>

      <Paragraph className={styles.context}>
        {options.conflictContext}
      </Paragraph>

      <div className={styles.optionList}>
        {options.options.map((option) => (
          <Card
            key={option.id}
            className={`${styles.optionCard} ${selectedId === option.id ? styles.optionCardSelected : ''}`}
            size="small"
            hoverable={!submitting}
          >
            <div className={styles.optionContent}>
              <Text className={styles.optionDesc}>{option.description}</Text>
              <Text type="secondary" className={styles.optionEffect}>
                {option.expectedEffect}
              </Text>
            </div>
            <Button
              type={selectedId === option.id ? 'primary' : 'default'}
              size="small"
              className={styles.optionBtn}
              disabled={submitting}
              loading={submitting && selectedId === option.id}
              onClick={() => handleSelect(option.id)}
            >
              {selectedId === option.id ? '已选择' : '选择'}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  )
}

export default DisambiguationPanel
