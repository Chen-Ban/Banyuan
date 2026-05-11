import React, { useCallback, useEffect, useRef, useState } from 'react'
import styles from './index.module.scss'

function formatNumber(value: number, precision: number = 2): string {
    return parseFloat(value.toFixed(precision)).toString()
}

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

export default NumberInput
