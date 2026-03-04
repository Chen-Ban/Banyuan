import React from 'react'
import { Scene } from 'banvasgl'

interface ComponentPanelProps {
    scene: Scene | null
    id: string
}

const ComponentPanel: React.FC<ComponentPanelProps> = ({ scene, id }) => {
    if (!scene) {
        return <div>请选择页面</div>
    }
    // 使用scene.getViewById获取容器实例，创建表单供用户修改容器属性
    return <div>{id}</div>
}

export default ComponentPanel
