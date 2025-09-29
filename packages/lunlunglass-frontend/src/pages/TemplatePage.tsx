import { useMemo, useEffect, useState, useCallback } from 'react'
import { useBanvas } from '../hooks/useBanvas'
import { 
  useTextViewExample, 
  useImageViewExample, 
  useGraphViewExample, 
  useCombinedViewExample 
} from '../hooks'
import { Scene, BaseCamera, Color } from 'banvasgl'
import './TemplatePage.css'

const TemplatePage = () => {
  // 使用useMemo缓存options，避免每次渲染都创建新对象
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

  const { app, canvas } = useBanvas(banvasOptions)

  // 示例 hooks
  const { textView, createTextView, updateText } = useTextViewExample()
  const { imageView, createImageView, updateImage, resizeImage } = useImageViewExample()
  const { graphView, createGraphView, createCircleView, createLineView, updateGraphStyle } = useGraphViewExample()
  const { combinedView, createCombinedView, addChildView, removeChildView, clearChildren, getChildCount } = useCombinedViewExample()

  // 当前选中的示例类型
  const [selectedExample, setSelectedExample] = useState<'text' | 'image' | 'graph' | 'combined'>('text')
  // 当前场景引用
  const [currentScene, setCurrentScene] = useState<Scene | null>(null)

  // 创建页面并绘制内容
  useEffect(() => {
    if (!app) {
      console.log('App not ready yet')
      return
    }

    try {
      // 创建基础相机
      const camera = new BaseCamera()
      
      // 创建新页面（场景）
      const scene = new Scene(camera)
      setCurrentScene(scene)
      
      // 根据选中的示例类型创建对应的视图
      let currentView = null
      
      switch (selectedExample) {
        case 'text':
          currentView = createTextView()
          break
        case 'image':
          currentView = createImageView()
          break
        case 'graph':
          currentView = createGraphView()
          break
        case 'combined':
          currentView = createCombinedView()
          break
      }
      
      if (currentView) {
        // 设置位置
        currentView.translate(100, 100, 0)
        scene.addChild(currentView)
      }

      
      // 添加场景到应用
      app.addScene(scene)
      
      // 导航到新页面
      app.navigateTo(scene) 
      
      // 延迟渲染，确保场景完全设置好
      app.render()

      

    } catch (error) {
      console.error('Failed to create page and draw content:', error)
    }
  }, [app, selectedExample, createTextView, createImageView, createGraphView, createCombinedView])

  // 更新场景中的视图
  const updateSceneView = useCallback((newView: any) => {
    if (currentScene && app) {
      // 清空当前场景的所有子视图
      currentScene.clearChildren()
      
      // 添加新视图
      if (newView) {
        newView.translate(100, 100, 0)
        currentScene.addChild(newView)
      }
      
      // 重新渲染
      app.render()
    }
  }, [currentScene, app])

  


  return (
    <div className="template-page">
      <div className="template-container">
        <h2>BanvasGL 示例测试页面</h2>
        <p>这是一个使用示例 hooks 的测试页面。</p>
        
        {/* 控制面板 */}
        <div className="control-panel">
          <h3>示例类型选择</h3>
          <div className="button-group">
            <button 
              className={selectedExample === 'text' ? 'active' : ''}
              onClick={() => setSelectedExample('text')}
            >
              文本视图
            </button>
            <button 
              className={selectedExample === 'image' ? 'active' : ''}
              onClick={() => setSelectedExample('image')}
            >
              图片视图
            </button>
            <button 
              className={selectedExample === 'graph' ? 'active' : ''}
              onClick={() => setSelectedExample('graph')}
            >
              图形视图
            </button>
            <button 
              className={selectedExample === 'combined' ? 'active' : ''}
              onClick={() => setSelectedExample('combined')}
            >
              组合视图
            </button>
          </div>
          
          {/* 示例特定的控制 */}
          {selectedExample === 'text' && (
            <div className="example-controls">
              <h4>文本视图控制</h4>
              <button onClick={() => {
                updateText('Hello World!')
                if (textView) updateSceneView(textView)
              }}>更新文本</button>
              <button onClick={() => {
                updateText('这是中文测试文本')
                if (textView) updateSceneView(textView)
              }}>中文文本</button>
            </div>
          )}
          
          {selectedExample === 'image' && (
            <div className="example-controls">
              <h4>图片视图控制</h4>
              <button onClick={() => {
                updateImage('https://via.placeholder.com/200x150/FF5722/FFFFFF?text=New+Image')
                if (imageView) updateSceneView(imageView)
              }}>
                更换图片
              </button>
              <button onClick={() => {
                resizeImage(200, 150)
                if (imageView) updateSceneView(imageView)
              }}>调整尺寸</button>
            </div>
          )}
          
          {selectedExample === 'graph' && (
            <div className="example-controls">
              <h4>图形视图控制</h4>
              <button onClick={() => {
                const newView = createCircleView()
                if (newView) updateSceneView(newView)
              }}>圆形</button>
              <button onClick={() => {
                const newView = createLineView()
                if (newView) updateSceneView(newView)
              }}>线条</button>
              <button onClick={() => {
                updateGraphStyle(Color.RED)
                if (graphView) updateSceneView(graphView)
              }}>红色</button>
              <button onClick={() => {
                updateGraphStyle(Color.BLUE)
                if (graphView) updateSceneView(graphView)
              }}>蓝色</button>
            </div>
          )}
          
          {selectedExample === 'combined' && (
            <div className="example-controls">
              <h4>组合视图控制</h4>
              <p>子视图数量: {getChildCount()}</p>
              <button onClick={() => {
                clearChildren()
                if (combinedView) updateSceneView(combinedView)
              }}>清空子视图</button>
            </div>
          )}
        </div>
        
        <div className="canvas-section">
          <h3>画布区域</h3>
          <div className="canvas-wrapper">
            {canvas}
          </div>
          <div className="canvas-info">
            <p>应用实例: {app ? '已创建' : '未创建'}</p>
            <p>当前示例: {selectedExample}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TemplatePage
