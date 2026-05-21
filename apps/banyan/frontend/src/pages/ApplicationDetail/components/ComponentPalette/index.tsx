import React from 'react'
import { Button, Tooltip } from 'antd'
import { ArrowLeftOutlined, SaveOutlined, RocketOutlined } from '@ant-design/icons'
import styles from './index.module.scss'

interface ComponentPaletteProps {
    applicationName: string
    applicationDescription: string
    saving: boolean
    isNew: boolean
    onNameChange: (value: string) => void
    onDescriptionChange: (value: string) => void
    onSave: () => void
    onBack: () => void
    /** 生成应用（打包） */
    onBuild: () => void
    /** 是否正在提交构建 */
    building?: boolean
    /**
     * 物料区域内容
     *
     * 由外部使用 hook 返回的 MaterialPalette 组件渲染后传入：
     * ```tsx
     * <ComponentPalette materialContent={<MaterialPalette />} ... />
     * ```
     */
    materialContent: React.ReactNode
}

const ComponentPalette: React.FC<ComponentPaletteProps> = ({
    applicationName,
    applicationDescription,
    saving,
    isNew,
    onNameChange,
    onDescriptionChange,
    onSave,
    onBack,
    onBuild,
    building = false,
    materialContent,
}) => {
    return (
        <div className={styles.palette}>
            {/* 左侧：Header 操作区 */}
            <div className={styles.headerSection}>
                <Button
                    type="text"
                    size="small"
                    icon={<ArrowLeftOutlined />}
                    onClick={onBack}
                    className={styles.backBtn}
                />
                <div className={styles.infoFields}>
                    <input
                        className={styles.fieldInput}
                        placeholder="未命名应用"
                        value={applicationName}
                        onChange={e => onNameChange(e.target.value)}
                    />
                    <input
                        className={`${styles.fieldInput} ${styles.descInput}`}
                        placeholder="添加描述..."
                        value={applicationDescription}
                        onChange={e => onDescriptionChange(e.target.value)}
                    />
                </div>
                <Tooltip title={isNew ? '创建应用' : '保存应用'}>
                    <Button
                        type="text"
                        icon={<SaveOutlined />}
                        loading={saving}
                        onClick={onSave}
                        className={styles.saveBtn}
                    />
                </Tooltip>
                <Tooltip title="生成应用">
                    <Button
                        type="text"
                        icon={<RocketOutlined />}
                        loading={building}
                        onClick={onBuild}
                        className={styles.saveBtn}
                    />
                </Tooltip>
            </div>

            {/* 分隔线 */}
            <div className={styles.divider} />

            {/* 右侧：物料区域（由外部 MaterialPalette 渲染） */}
            <div className={styles.componentsSection}>
                {materialContent}
            </div>
        </div>
    )
}

export default ComponentPalette
