import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Tabs, Tooltip } from 'antd'
import type { IBanvasActions } from 'banvasgl'
import styles from './index.module.scss'

interface PropertyPanelProps {
    selectedViewId: string
    actions: IBanvasActions
}

// ── 工具函数 ──

const radiansToDegrees = (rad: number) => rad * (180 / Math.PI)
const degreesToRadians = (deg: number) => deg * (Math.PI / 180)

function formatNumber(value: number, precision: number = 2): string {
    return parseFloat(value.toFixed(precision)).toString()
}

// ── 数值输入组件 ──

interface NumberInputProps {
    label: string
    value: number
    onChange: (value: number) => void
    onFocus: () => void
    onBlur: () => void
    precision?: number
    step?: number
    min?: number
    max?: number
    suffix?: string
    disabled?: boolean
}

const NumberInput: React.FC<NumberInputProps> = ({
    label,
    value,
    onChange,
    onFocus,
    onBlur,
    precision = 2,
    step = 1,
    min,
    max,
    suffix,
    disabled = false,
}) => {
    const [localValue, setLocalValue] = useState(formatNumber(value, precision))
    const [isFocused, setIsFocused] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (!isFocused) {
            setLocalValue(formatNumber(value, precision))
        }
    }, [value, precision, isFocused])

    const commitValue = useCallback(() => {
        const parsed = parseFloat(localValue)
        if (isNaN(parsed)) {
            setLocalValue(formatNumber(value, precision))
            return
        }
        let clamped = parsed
        if (min !== undefined) clamped = Math.max(min, clamped)
        if (max !== undefined) clamped = Math.min(max, clamped)
        if (clamped !== value) {
            onChange(clamped)
        }
        setLocalValue(formatNumber(clamped, precision))
    }, [localValue, value, onChange, precision, min, max])

    const handleFocus = () => {
        setIsFocused(true)
        onFocus()
        setTimeout(() => inputRef.current?.select(), 0)
    }

    const handleBlur = () => {
        setIsFocused(false)
        commitValue()
        onBlur()
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            commitValue()
            inputRef.current?.blur()
        } else if (e.key === 'Escape') {
            setLocalValue(formatNumber(value, precision))
            inputRef.current?.blur()
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            const newVal = value + step
            onChange(max !== undefined ? Math.min(max, newVal) : newVal)
        } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            const newVal = value - step
            onChange(min !== undefined ? Math.max(min, newVal) : newVal)
        }
    }

    return (
        <div className={styles.numberInput}>
            <label className={styles.inputLabel}>{label}</label>
            <div className={styles.inputWrapper}>
                <input
                    ref={inputRef}
                    type="text"
                    value={localValue}
                    onChange={(e) => setLocalValue(e.target.value)}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    disabled={disabled}
                    className={styles.input}
                />
                {suffix && <span className={styles.inputSuffix}>{suffix}</span>}
            </div>
        </div>
    )
}

// ── 主面板组件 ──

const PropertyPanel: React.FC<PropertyPanelProps> = ({
    selectedViewId,
    actions,
}) => {
    const view = selectedViewId ? actions.view.getViewInstance(selectedViewId) : null

    const isEditingRef = useRef(false)

    const handleFocus = useCallback(() => {
        if (!isEditingRef.current) {
            actions.view.beginPropertyEdit()
            isEditingRef.current = true
        }
    }, [actions])

    const handleBlur = useCallback(() => {
        if (isEditingRef.current) {
            actions.view.commitPropertyEdit()
            isEditingRef.current = false
        }
    }, [actions])

    // 无选中时的空状态
    if (!view) {
        return (
            <div className={styles.panel}>
                <div className={styles.emptyState}>
                    未选中任何元素
                </div>
            </div>
        )
    }

    // 读取属性
    const x = view.matrix.extractTranslation2D().x
    const y = view.matrix.extractTranslation2D().y
    const rotation = view.matrix.extractRotationZ()
    const rotationDeg = radiansToDegrees(rotation)
    const width = view.viewport.width
    const height = view.viewport.height

    // Tab 1: 属性（基础信息 + 变换 + 状态）
    const propertiesTab = (
        <div className={styles.tabContent}>
            {/* 基础信息 */}
            <section className={styles.section}>
                <div className={styles.sectionHeader}>基础信息</div>
                <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>类型</span>
                    <span className={styles.infoValue}>{view.type}</span>
                </div>
                <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>ID</span>
                    <Tooltip title={view.id}>
                        <span
                            className={styles.infoValueId}
                            onClick={() => navigator.clipboard?.writeText(view.id)}
                        >
                            {view.id}
                        </span>
                    </Tooltip>
                </div>
                <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>名称</span>
                    <input
                        className={styles.nameInput}
                        value={view.name}
                        onChange={(e) => actions.view.rename(selectedViewId, e.target.value)}
                    />
                </div>
            </section>

            {/* 变换 */}
            <section className={styles.section}>
                <div className={styles.sectionHeader}>变换</div>
                <div className={styles.transformGrid}>
                    <NumberInput
                        label="X"
                        value={x}
                        onChange={(v) => actions.view.setProperty('x', v)}
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                        suffix="px"
                    />
                    <NumberInput
                        label="Y"
                        value={y}
                        onChange={(v) => actions.view.setProperty('y', v)}
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                        suffix="px"
                    />
                    <NumberInput
                        label="W"
                        value={width}
                        onChange={(v) => actions.view.setProperty('width', v)}
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                        min={1}
                        suffix="px"
                    />
                    <NumberInput
                        label="H"
                        value={height}
                        onChange={(v) => actions.view.setProperty('height', v)}
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                        min={1}
                        suffix="px"
                    />
                    <NumberInput
                        label="旋转"
                        value={rotationDeg}
                        onChange={(v) => actions.view.setProperty('rotation', degreesToRadians(v))}
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                        step={1}
                        suffix="°"
                    />
                    <NumberInput
                        label="弧度"
                        value={rotation}
                        onChange={(v) => actions.view.setProperty('rotation', v)}
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                        step={0.01}
                        precision={4}
                        suffix="rad"
                    />
                </div>
            </section>

            {/* 状态 */}
            <section className={styles.section}>
                <div className={styles.sectionHeader}>状态</div>
                <div className={styles.stateRow}>
                    <label className={styles.stateLabel}>
                        <input
                            type="checkbox"
                            checked={view.visible}
                            onChange={(e) => actions.view.setVisible(selectedViewId, e.target.checked)}
                        />
                        可见
                    </label>
                    <label className={styles.stateLabel}>
                        <input
                            type="checkbox"
                            checked={view.freezed}
                            onChange={(e) => actions.view.setLocked(selectedViewId, e.target.checked)}
                        />
                        锁定
                    </label>
                </div>
            </section>
        </div>
    )

    // Tab 2: 样式
    const styleTab = (
        <div className={styles.tabContent}>
            <section className={styles.section}>
                <div className={styles.sectionHeader}>样式</div>
                <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>overflow</span>
                    <select
                        className={styles.selectInput}
                        value={view.style?.overflow ?? 'visible'}
                        onChange={(e) => {
                            if (view.style) {
                                view.style.overflow = e.target.value as 'visible' | 'hidden' | 'scroll'
                            }
                        }}
                    >
                        <option value="visible">visible</option>
                        <option value="hidden">hidden</option>
                        <option value="scroll">scroll</option>
                    </select>
                </div>
            </section>
        </div>
    )

    // Tab 3: 占位
    const extensionTab = (
        <div className={styles.tabContent}>
            <div className={styles.emptyState}>
                更多功能开发中...
            </div>
        </div>
    )

    const tabItems = [
        { key: 'properties', label: '属性', children: propertiesTab },
        { key: 'style', label: '样式', children: styleTab },
        { key: 'extensions', label: '扩展', children: extensionTab },
    ]

    return (
        <div className={styles.panel}>
            <Tabs
                items={tabItems}
                size="small"
                className={styles.tabs}
                defaultActiveKey="properties"
            />
        </div>
    )
}

export default PropertyPanel
