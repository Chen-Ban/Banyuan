/**
 * AiModelsSettings — AI / 模型设置子页面
 *
 * 包含：
 *   - 模型提供商与默认配置（占位）
 *   - AI Agent 角色 System Prompt 定制
 */

import { useState, useEffect, useCallback } from 'react'
import { Typography, Input, Button, message, Spin, Tag, Tabs, Empty } from 'antd'
import { SaveOutlined, UndoOutlined } from '@ant-design/icons'
import { useParams } from 'react-router-dom'
import { planningApi } from '@/api'
import type { AgentPromptConfig } from '@/api'
import type { FullAgentRole } from '@/api/ai/planning'
import styles from './AiModelsSettings.module.scss'

const { Title, Text } = Typography
const { TextArea } = Input

// ─── Agent 角色元数据 ─────────────────────────────────────────────────────────

const ROLE_META: Array<{ role: FullAgentRole; label: string; description: string }> = [
  { role: 'master', label: 'Master', description: '总控 Agent，负责意图识别和任务路由' },
  { role: 'pm', label: '需求 (PM)', description: '需求分析 Agent，将用户描述拆解为功能清单' },
  { role: 'arch', label: '架构 (Arch)', description: '架构设计 Agent，规划数据结构和页面布局' },
  { role: 'visual', label: '视觉 (Visual)', description: '视觉规范 Agent，生成样式和主题配置' },
  { role: 'task', label: '任务 (Task)', description: '任务规划 Agent，将设计拆解为可执行的 ChangeSpec' },
]

// ─── Section: 模型提供商 ──────────────────────────────────────────────────────

const ModelProviderSection: React.FC = () => (
  <section className={styles.section}>
    <Title level={5} className={styles.sectionTitle}>
      模型提供商
    </Title>
    <Text type="secondary" className={styles.sectionDesc}>
      配置 AI 模型提供商的 API Key 和默认模型参数。当前支持 OpenAI、Anthropic 及兼容接口。
    </Text>
    <Empty
      description="API Key 管理与模型参数配置 — 即将上线"
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      className={styles.placeholder}
    />
  </section>
)

// ─── Section: Agent System Prompts ────────────────────────────────────────────

const AgentPromptsSection: React.FC = () => {
  const { appId } = useParams<{ appId: string }>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [prompts, setPrompts] = useState<Record<FullAgentRole, string>>({
    master: '',
    pm: '',
    arch: '',
    visual: '',
    task: '',
  })
  const [customized, setCustomized] = useState<Record<FullAgentRole, boolean>>({
    master: false,
    pm: false,
    arch: false,
    visual: false,
    task: false,
  })

  useEffect(() => {
    if (!appId) {
      setLoading(false)
      return
    }
    setLoading(true)
    planningApi
      .listPrompts(appId)
      .then((configs: AgentPromptConfig[]) => {
        const promptMap = { ...prompts }
        const customMap = { ...customized }
        for (const config of configs) {
          promptMap[config.agent] = config.promptText
          customMap[config.agent] = config.isCustomized
        }
        setPrompts(promptMap)
        setCustomized(customMap)
      })
      .catch(() => {
        message.warning('加载 AI 配置失败')
      })
      .finally(() => {
        setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId])

  const handlePromptChange = useCallback((role: FullAgentRole, value: string) => {
    setPrompts((prev) => ({ ...prev, [role]: value }))
  }, [])

  const handleSave = useCallback(
    async (role: FullAgentRole) => {
      if (!appId) return
      setSaving(true)
      try {
        await planningApi.upsertPrompt(appId, role, prompts[role])
        setCustomized((prev) => ({ ...prev, [role]: true }))
        message.success(`${ROLE_META.find((r) => r.role === role)?.label} 配置已保存`)
      } catch {
        message.error('保存失败')
      } finally {
        setSaving(false)
      }
    },
    [appId, prompts],
  )

  const handleReset = useCallback(
    async (role: FullAgentRole) => {
      if (!appId) return
      setSaving(true)
      try {
        await planningApi.resetPrompt(appId, role)
        setPrompts((prev) => ({ ...prev, [role]: '' }))
        setCustomized((prev) => ({ ...prev, [role]: false }))
        message.success('已重置为系统默认')
      } catch {
        message.error('重置失败')
      } finally {
        setSaving(false)
      }
    },
    [appId],
  )

  const tabItems = ROLE_META.map(({ role, label, description }) => ({
    key: role,
    label: (
      <span>
        {label}
        {customized[role] && (
          <Tag color="blue" className={styles.customTag}>
            已定制
          </Tag>
        )}
      </span>
    ),
    children: (
      <div className={styles.rolePanel}>
        <Text type="secondary" className={styles.roleDesc}>
          {description}
        </Text>
        <TextArea
          value={prompts[role]}
          onChange={(e) => handlePromptChange(role, e.target.value)}
          placeholder="留空则使用系统内置默认 prompt。输入自定义内容后保存生效。"
          autoSize={{ minRows: 8, maxRows: 20 }}
          className={styles.promptTextarea}
        />
        <div className={styles.roleActions}>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={() => handleSave(role)}
            loading={saving}
            disabled={!prompts[role].trim() && !customized[role]}
          >
            保存
          </Button>
          {customized[role] && (
            <Button icon={<UndoOutlined />} onClick={() => handleReset(role)} loading={saving} danger>
              重置为默认
            </Button>
          )}
        </div>
      </div>
    ),
  }))

  return (
    <section className={styles.section}>
      <Title level={5} className={styles.sectionTitle}>
        Agent System Prompts
      </Title>
      <Text type="secondary" className={styles.sectionDesc}>
        为每个 AI Agent 角色定制 system prompt，影响 AI 的行为和输出风格。留空则使用系统默认值。
      </Text>

      {!appId ? (
        <div className={styles.noticeWrap}>
          <Empty
            description="Agent System Prompts 按应用配置，请先在应用内打开设置。"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        </div>
      ) : loading ? (
        <div className={styles.loadingWrap}>
          <Spin size="small" />
          <span>加载配置...</span>
        </div>
      ) : (
        <Tabs items={tabItems} className={styles.roleTabs} />
      )}
    </section>
  )
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────

const AiModelsSettings: React.FC = () => (
  <div className={styles.page}>
    <div className={styles.content}>
      <Title level={3} className={styles.title}>
        设置
      </Title>

      <ModelProviderSection />
      <AgentPromptsSection />
    </div>
  </div>
)

export default AiModelsSettings
