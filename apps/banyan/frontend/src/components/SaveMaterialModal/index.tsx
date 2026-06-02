/**
 * SaveMaterialModal — "保存为物料"弹窗
 *
 * 选中 View 后，通过右键菜单或工具栏触发。
 * 用户填写名称/描述/标签后，调用 serialize + 后端 API 发布物料。
 */

import React, { useState, useCallback } from 'react'
import { Modal, Input, Tag, App } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { materialApi } from '@/api'
import type { IBanvasActions } from '@banyuan/banvasgl'
import { getErrorMessage } from '@/utils/error'
import styles from './index.module.scss'

export interface SaveMaterialModalProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
  viewId: string
  actions: IBanvasActions
}

const SaveMaterialModal: React.FC<SaveMaterialModalProps> = ({
  open,
  onClose,
  onSuccess,
  viewId,
  actions,
}) => {
  const { message } = App.useApp()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [loading, setLoading] = useState(false)

  const handleAddTag = useCallback(() => {
    const trimmed = tagInput.trim()
    if (trimmed && !tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed])
    }
    setTagInput('')
  }, [tagInput, tags])

  const handleRemoveTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag))
  }, [])

  const handleOk = useCallback(async () => {
    if (!name.trim()) {
      message.warning('请输入物料名称')
      return
    }

    setLoading(true)
    try {
      // 调用 BanvasGL view.serializeMaterial 生成模板
      const template = actions.view.serializeMaterial(viewId, {
        name: name.trim(),
        description: description.trim() || undefined,
        parameterBindings: [],
      })

      // 发布到后端
      await materialApi.createMaterial({
        name: name.trim(),
        description: description.trim() || undefined,
        tags: tags.length > 0 ? tags : undefined,
        source: 'user',
        template,
      })

      message.success('物料保存成功')
      onSuccess?.()
      handleClose()
    } catch (err: unknown) {
      message.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [name, description, tags, viewId, actions, onSuccess])

  const handleClose = useCallback(() => {
    setName('')
    setDescription('')
    setTags([])
    setTagInput('')
    onClose()
  }, [onClose])

  return (
    <Modal
      title="保存为物料"
      open={open}
      onOk={handleOk}
      onCancel={handleClose}
      confirmLoading={loading}
      okText="保存"
      cancelText="取消"
      destroyOnClose
    >
      <div className={styles.formItem}>
        <span className={styles.label}>名称 *</span>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="输入物料名称"
          maxLength={50}
        />
      </div>

      <div className={styles.formItem}>
        <span className={styles.label}>描述</span>
        <Input.TextArea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="简要描述此物料的用途"
          maxLength={200}
          rows={3}
        />
      </div>

      <div className={styles.formItem}>
        <span className={styles.label}>标签</span>
        <div className={styles.tags}>
          {tags.map((tag) => (
            <Tag key={tag} closable onClose={() => handleRemoveTag(tag)}>
              {tag}
            </Tag>
          ))}
          <Input
            className={styles.tagInput}
            size="small"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onPressEnter={handleAddTag}
            onBlur={handleAddTag}
            placeholder="添加标签"
            prefix={<PlusOutlined style={{ fontSize: 10 }} />}
          />
        </div>
      </div>
    </Modal>
  )
}

export default SaveMaterialModal
