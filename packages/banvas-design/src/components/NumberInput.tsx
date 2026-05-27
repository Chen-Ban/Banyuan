import React from 'react'
import { InputNumber } from 'antd'

// ── 内联样式 ──

const wrapperStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
}

const labelStyle: React.CSSProperties = {
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
    fontWeight: 500,
}

// ── 组件 ──

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

export const NumberInput: React.FC<NumberInputProps> = ({
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
        <div style={wrapperStyle}>
            <label style={labelStyle}>{label}</label>
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
