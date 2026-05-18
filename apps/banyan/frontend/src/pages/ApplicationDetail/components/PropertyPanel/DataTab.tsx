import React from 'react'
import type { IBanvasActions, IFieldSchemaMap } from 'banvasgl'
import FieldSchemaMapEditor from './FieldSchemaMapEditor'
import styles from './index.module.scss'

interface DataTabProps {
    selectedViewId: string
    actions: IBanvasActions
    viewData: IFieldSchemaMap
}

const DataTab: React.FC<DataTabProps> = ({
    selectedViewId,
    actions,
    viewData,
}) => {
    const handleAdd = () => {
        const existingKeys = Object.keys(viewData)
        let n = existingKeys.length + 1
        let newKey = `field_${n}`
        while (existingKeys.includes(newKey)) newKey = `field_${++n}`
        actions.view.setViewData(selectedViewId, newKey, { type: 'string', default: undefined })
    }

    const handleRename = (oldKey: string, newKey: string) => {
        // 按原始顺序重建 schemaMap，保持字段顺序
        const entries = Object.entries(viewData)
        for (const [k, schema] of entries) {
            if (k === oldKey) {
                actions.view.deleteViewData(selectedViewId, oldKey)
                actions.view.setViewData(selectedViewId, newKey, schema)
            }
        }
    }

    return (
        <div className={styles.tabContent}>
            <FieldSchemaMapEditor
                title="数据 (data)"
                schemaMap={viewData}
                onUpdate={(key, schema) => actions.view.setViewData(selectedViewId, key, schema)}
                onRename={handleRename}
                onDelete={(key) => actions.view.deleteViewData(selectedViewId, key)}
                onAdd={handleAdd}
            />
        </div>
    )
}

export default DataTab
