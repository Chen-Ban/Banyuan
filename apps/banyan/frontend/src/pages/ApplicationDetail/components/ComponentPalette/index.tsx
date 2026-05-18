import React, { useState } from 'react'
import { Button, Tooltip, Popover } from 'antd'
import { ArrowLeftOutlined, SaveOutlined, EllipsisOutlined, RocketOutlined, DatabaseOutlined } from '@ant-design/icons'
import type { IComponentDefinition } from 'banvasgl'
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
    /** 点击数据库按钮（仅已保存应用显示） */
    onDatabase?: () => void
    /** 引擎内置物料，直接来自 useDesignBanvas().builtinComponents */
    builtinComponents: IComponentDefinition[]
    /**
     * 用户自定义物料（可选）
     *
     * 格式与内置物料完全一致，source 建议设为 'user'。
     * 未来社区物料也通过同一接口接入，面板无需改动。
     */
    userComponents?: IComponentDefinition[]
}

/** 渲染物料图标 */
const ComponentIcon: React.FC<{ icon: IComponentDefinition['icon'] }> = ({ icon }) => {
    if (icon.type === 'svg') {
        return (
            <span
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                dangerouslySetInnerHTML={{ __html: icon.content }}
            />
        )
    }
    return <img src={icon.src} width={20} height={20} alt="" style={{ objectFit: 'contain' }} />
}

/** 栅格最多展示 6 个，超出折叠到「更多」 */
const MAX_VISIBLE = 6

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
    onDatabase,
    builtinComponents,
    userComponents = [],
}) => {
    const [moreOpen, setMoreOpen] = useState(false)

    // 合并所有物料：内置在前，用户自定义在后
    const allComponents = [...builtinComponents, ...userComponents]
    const visibleComponents = allComponents.slice(0, MAX_VISIBLE)
    const overflowComponents = allComponents.slice(MAX_VISIBLE)

    const handleDragStart = (e: React.DragEvent, def: IComponentDefinition) => {
        // 只序列化 template（创建数据），不传 icon/label 等展示信息
        e.dataTransfer.setData('application/json', JSON.stringify({ template: def.template }))
        e.dataTransfer.effectAllowed = 'copy'
    }

    const renderItem = (def: IComponentDefinition) => (
        <Tooltip key={def.id} title={def.description ?? def.label} placement="bottom">
            <div
                className={styles.componentItem}
                draggable
                onDragStart={e => handleDragStart(e, def)}
            >
                <ComponentIcon icon={def.icon} />
            </div>
        </Tooltip>
    )

    const overflowPanel = (
        <div className={styles.overflowGrid}>
            {overflowComponents.map(renderItem)}
        </div>
    )

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
                {onDatabase && (
                    <Tooltip title="数据库 Schema">
                        <Button
                            type="text"
                            icon={<DatabaseOutlined />}
                            onClick={onDatabase}
                            className={styles.saveBtn}
                        />
                    </Tooltip>
                )}
            </div>

            {/* 分隔线 */}
            <div className={styles.divider} />

            {/* 右侧：组件区域（3x2 栅格 + 更多） */}
            <div className={styles.componentsSection}>
                <div className={styles.componentsGrid}>
                    {visibleComponents.map(renderItem)}
                </div>
                {overflowComponents.length > 0 && (
                    <Popover
                        content={overflowPanel}
                        trigger="click"
                        placement="bottomRight"
                        open={moreOpen}
                        onOpenChange={setMoreOpen}
                    >
                        <div className={styles.moreBtn}>
                            <EllipsisOutlined />
                        </div>
                    </Popover>
                )}
            </div>
        </div>
    )
}

export default ComponentPalette
