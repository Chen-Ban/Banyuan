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
    return (
        <div className={styles.tabContent}>
            <FieldSchemaMapEditor
                title="数据 (data)"
                schemaMap={viewData}
                onUpdate={(key, schema) => actions.view.setViewData(selectedViewId, key, schema)}
                onDelete={(key) => actions.view.deleteViewData(selectedViewId, key)}
                onAdd={(key, schema) => actions.view.setViewData(selectedViewId, key, schema)}
            />
        </div>
    )
}

export default DataTab
