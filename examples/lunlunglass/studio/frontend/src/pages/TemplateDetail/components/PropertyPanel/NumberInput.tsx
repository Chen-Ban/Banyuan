import React from 'react'
import { InputNumber } from 'antd'
import styles from './index.module.scss'

export interface NumberInputProps {
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
    return (
        <div className={styles.numberInput}>
            <label className={styles.inputLabel}>{label}</label>
            <InputNumber
                size="small"
                value={value}
                onChange={(v) => { if (v != null) onChange(v) }}
                onFocus={onFocus}
                onBlur={onBlur}
                precision={precision}
                step={step}
                min={min}
                max={max}
                suffix={suffix}
                disabled={disabled}
                style={{ width: '100%' }}
                controls={false}
            />
        </div>
    )
}

export default NumberInput
