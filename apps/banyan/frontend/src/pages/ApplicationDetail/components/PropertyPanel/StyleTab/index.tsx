import React from 'react'
import { Select } from 'antd'
import type { IView } from '@banyuan/sdk/core'
import styles from '../index.module.scss'

interface StyleTabProps {
    view: IView
}

const OVERFLOW_OPTIONS = [
    { value: 'visible', label: 'visible' },
    { value: 'hidden', label: 'hidden' },
    { value: 'scroll', label: 'scroll' },
]

const StyleTab: React.FC<StyleTabProps> = ({ view }) => {
    return (
        <div className={styles.tabContent}>
            <section className={styles.section}>
                <div className={styles.sectionHeader}>样式</div>
                <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>overflow</span>
                    <Select
                        size="small"
                        value={view.style?.overflow ?? 'visible'}
                        options={OVERFLOW_OPTIONS}
                        onChange={(val) => {
                            if (view.style) {
                                view.style.overflow = val as 'visible' | 'hidden' | 'scroll'
                            }
                        }}
                        style={{ flex: 1, marginLeft: 8 }}
                    />
                </div>
            </section>
        </div>
    )
}

export default StyleTab
