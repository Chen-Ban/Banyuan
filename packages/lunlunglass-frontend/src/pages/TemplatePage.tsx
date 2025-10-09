import { useMemo} from 'react'
import { useBanvas } from 'banvasgl'
import './TemplatePage.css'

const TemplatePage = () => {
  const banvasOptions = useMemo(() => ({
    width: 800,
    height: 600,
    appOptions: {
      enablePageStack: true,
      maxPageStackSize: 50
    },
    rendererOptions: {
      clearColor: '#fff'
    }
  }), [])

  const { app, Banvas } = useBanvas([], banvasOptions)

  return (
    <div className="template-page">
      <div className="template-container">
        <div className="canvas-section">
          <div className="canvas-wrapper">
            {Banvas}
          </div>
          <div className="canvas-info">
            <p>应用实例: {app ? '已创建' : '未创建'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TemplatePage
