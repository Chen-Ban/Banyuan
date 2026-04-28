import { App, Scene } from 'banvasgl'
import React from 'react'

interface SceneListProps {
    app: App | null
    scene: Scene | null
}

const SceneList: React.FC<SceneListProps> = ({ app, scene }) => {
    return <div>{scene?.id}</div>
}
export default SceneList
